import {supabase} from '../supabaseClient';
import {validatePurchasePdfEvidence} from './purchasePdfEvidence';
import {assessDigitalPdf} from './pdfImportEvidence';

export const PURCHASE_DOCUMENT_BUCKET='bt-purchase-pdfs';
const LIMIT=12*1024*1024;

const verifyFileHeader=async file=>{
 if(!file||file.size<10||file.size>LIMIT||!String(file.name).toLowerCase().endsWith('.pdf'))
  throw new Error('Sélectionnez un PDF de 12 Mo maximum.');
 const first=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
 if(first!=='%PDF-')throw new Error('Ce document n’est pas un PDF valide.');
};

export const verifyPurchasePdf=async(file,{kind,source,site})=>{
 if(!['quote','order'].includes(kind)||!source?.id||!site?.id)
  throw new Error('Type de justificatif ou chantier invalide.');
 await verifyFileHeader(file);
 const {readDigitalPdf}=await import('./digitalPdfReader');
 const pdf=await readDigitalPdf(file);
 if(!pdf.digitalText||!pdf.allPagesProcessed||!pdf.sha256)
  throw new Error('PDF incomplet, scanné sans texte ou illisible.');
 const parsed=assessDigitalPdf(pdf,{kind:kind==='quote'?'budget':'order',
  site,previousOrders:[],hasExistingBudget:false});
 validatePurchasePdfEvidence(parsed,{kind,source,site});
 return {sha:pdf.sha256,parsed};
};

export const archivePurchasePdf=async(file,{kind,source,site,companyId})=>{
 const validated=await verifyPurchasePdf(file,{kind,source,site});
 const {data:session,error:authError}=await supabase.auth.getUser();
 if(authError||!session?.user?.id)throw new Error('Session expirée : reconnectez-vous.');
 const {data:existing,error:lookupError}=await supabase.from('bt_purchase_documents')
  .select('id').eq('company_id',companyId).eq('site_id',site.id)
  .eq('source_kind',kind).eq('source_id',source.id).maybeSingle();
 if(lookupError)throw lookupError;
 if(existing)throw new Error('Le PDF original est déjà conservé pour ce document.');
 const uid=crypto.randomUUID();
 const path=[companyId,site.id,kind,source.id,uid+'.pdf'].join('/');
 const {error:uploadError}=await supabase.storage.from(PURCHASE_DOCUMENT_BUCKET)
  .upload(path,file,{contentType:'application/pdf',cacheControl:'3600',upsert:false});
 if(uploadError)throw uploadError;
 const {error:insertError}=await supabase.from('bt_purchase_documents').insert({
  company_id:companyId,site_id:site.id,source_kind:kind,source_id:source.id,
  file_name:file.name.slice(0,250),storage_path:path,
  file_sha256:validated.sha,file_size:file.size,uploaded_by:session.user.id,
 });
 if(insertError){
  // Orphan-only delete RLS policy prohibits deleting an already registered PDF.
  await supabase.storage.from(PURCHASE_DOCUMENT_BUCKET).remove([path]);
  throw insertError;
 }
 return path;
};

// Fetch PDF bytes only into memory for the integrated PDF.js preview.
// The PDF stays in the private Supabase Storage bucket; no public URL,
// signed external tab, browser download or permanent local copy is created.
export const fetchPrivatePurchasePdf=async record=>{
 if(!record?.storage_path)throw new Error('Aucun PDF original archivé.');
 const {data,error}=await supabase.storage.from(PURCHASE_DOCUMENT_BUCKET)
  .download(record.storage_path);
 if(error||!data)throw error||new Error('Lecture du PDF impossible.');
 if(data.size<10||data.size>LIMIT)
  throw new Error('PDF absent ou trop volumineux pour l’aperçu.');
 const bytes=new Uint8Array(await data.arrayBuffer());
 if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')
  throw new Error('Document PDF invalide.');
 return bytes;
};

export async function importPurchasePdf(file, { companyId, siteId, kind, fingerprint, metadata, rows, override }) {
 await verifyFileHeader(file);
 const id = crypto.randomUUID();
 const path = [companyId, siteId, 'order', id, 'original.pdf'].join('/');
 const bucket = supabase.storage.from(PURCHASE_DOCUMENT_BUCKET);
 const { error: uploadError } = await bucket.upload(path, file, {
  contentType: 'application/pdf', cacheControl: '3600', upsert: false,
 });
 if (uploadError) throw uploadError;

 const { data, error } = await supabase.rpc('bt_purchase_import_document', {
  p_company_id: companyId, p_site_id: siteId, p_document_id: id, p_kind: kind,
  p_po_number: metadata.poNumber, p_supplier: metadata.supplier,
  p_supplier_order_number: metadata.supplierNumber || '',
  p_original_supplier_order_number: metadata.originalSupplierNumber || '',
  p_shipping_project_name: metadata.shippingProject, p_override_confirmation: override || '',
  p_file_name: file.name.slice(0, 250), p_file_sha256: fingerprint, p_file_size: file.size, p_lines: rows,
 });
 if (error) {
  if (/^[0-9A-Z]{5}$/.test(error.code || '')) await bucket.remove([path]);
  throw error;
 }
 return data;
}

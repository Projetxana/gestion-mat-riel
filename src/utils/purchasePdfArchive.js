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

export const openPurchasePdf=async record=>{
 if(!record?.storage_path)throw new Error('Aucun PDF original archivé.');
 // Open the tab synchronously to avoid mobile/browser popup blocking.
 const tab=window.open('about:blank','_blank');
 if(tab){tab.opener=null;tab.document.title='Ouverture du PDF…';}
 const {data,error}=await supabase.storage.from(PURCHASE_DOCUMENT_BUCKET)
  .createSignedUrl(record.storage_path,120);
 if(error||!data?.signedUrl){
  if(tab)tab.close();
  throw error||new Error('Ouverture du PDF impossible.');
 }
 if(tab)tab.location.replace(data.signedUrl);
 else window.location.assign(data.signedUrl);
};

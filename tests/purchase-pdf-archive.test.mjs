import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {validatePurchasePdfEvidence} from '../src/utils/purchasePdfEvidence.js';

const site={id:12,name:'A1 Cash & Carry'};
const quote={id:'q',quote_number:'2051538',line_count:80,total_amount:57062.03};
const quoteProof={
 document:{document_type:'supplier_quotation',all_pages_processed:true,
  detected_line_count:80,printed_material_total:57062.03},
 hints:{quote_number:'2051538',shipping_project_name:'A1 CASH & CARRY'},
};
const order={id:'po',po_number:'P02294',supplier:'Flocor',
 line_count:5,total_amount:27094};
const orderProof={
 document:{document_type:'order',all_pages_processed:true,detected_line_count:5,
  printed_material_total:27094},
 hints:{po_number:'P02294',shipping_project_name:'A1 CASH & CARRY'},
 supplier:'Flocor',
};

test('a matching 80-line Flocor PDF can be attached to its original quotation',()=>{
 assert.equal(validatePurchasePdfEvidence(quoteProof,{kind:'quote',source:quote,site}),true);
});
test('rejects a wrong quote number, project, subtotal or missing pages',()=>{
 for(const [field,value] of [['quote_number','0000000'],['shipping_project_name','AUTRE CHANTIER']]){
  assert.throws(()=>validatePurchasePdfEvidence({
   ...quoteProof,hints:{...quoteProof.hints,[field]:value},
  },{kind:'quote',source:quote,site}),/diffère/);
 }
 assert.throws(()=>validatePurchasePdfEvidence({
  ...quoteProof,document:{...quoteProof.document,printed_material_total:60000},
 },{kind:'quote',source:quote,site}),/diffère/);
 assert.throws(()=>validatePurchasePdfEvidence({
  ...quoteProof,document:{...quoteProof.document,detected_line_count:79},
 },{kind:'quote',source:quote,site}),/diffère/);
 assert.throws(()=>validatePurchasePdfEvidence({
  ...quoteProof,document:{...quoteProof.document,all_pages_processed:false},
 },{kind:'quote',source:quote,site}),/pages/);
});
test('order must match existing PO, exact supplier, job site, row count and total',()=>{
 assert.equal(validatePurchasePdfEvidence(orderProof,{kind:'order',source:order,site}),true);
 for(const [field,value] of [['po_number','P02316'],['shipping_project_name','AUTRE CHANTIER']]){
  assert.throws(()=>validatePurchasePdfEvidence({
   ...orderProof,hints:{...orderProof.hints,[field]:value},
  },{kind:'order',source:order,site}),/diffère/);
 }
 assert.throws(()=>validatePurchasePdfEvidence({...orderProof,supplier:'Autre fournisseur'},
  {kind:'order',source:order,site}),/diffère/);
 assert.throws(()=>validatePurchasePdfEvidence({
  ...orderProof,document:{...orderProof.document,printed_material_total:20000},
 },{kind:'order',source:order,site}),/diffère/);
 assert.throws(()=>validatePurchasePdfEvidence(quoteProof,
  {kind:'order',source:order,site}),/diffère/);
});
test('the PDF preview loads privately into memory without download URLs',()=>{
 const src=readFileSync(new URL('../src/utils/purchasePdfArchive.js',import.meta.url),'utf8');
 assert.match(src,/export const fetchPrivatePurchasePdf=async record/);
 assert.match(src,/\.download\(record\.storage_path\)/);
 assert.match(src,/new Uint8Array\(await data\.arrayBuffer\(\)\)/);
 assert.doesNotMatch(src,/createSignedUrl|window\.open|window\.location|URL\.createObjectURL/);
 assert.match(src,/from\(PURCHASE_DOCUMENT_BUCKET\)/);
 assert.match(src,/upload\(path,file/);
 assert.match(src,/validatePurchasePdfEvidence/);
 assert.doesNotMatch(src,/getPublicUrl|service_role|upsert:true/);
 assert.match(src,/bt_purchase_documents/);
});
test('private archive SQL requires admin role, matching tenant and existing source record',()=>{
 const sql=readFileSync(new URL('../migrations/bt_purchase_documents_private_20261123_PROPOSED.sql',import.meta.url),'utf8');
 assert.match(sql,/VALUES\('bt-purchase-pdfs','bt-purchase-pdfs',false/);
 assert.match(sql,/allowed_mime_types/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/bt_stage2_is_admin/);
 assert.match(sql,/REFERENCES public\.sites/);
 assert.match(sql,/source_kind='quote'/);
 assert.match(sql,/source_kind='order'/);
 assert.match(sql,/storage\.foldername\(storage\.objects\.name\)/);
 assert.doesNotMatch(sql,/storage\.foldername\(name\)/);
 assert.doesNotMatch(sql,/FOR (?:UPDATE|DELETE) TO anon/);
});
test('clicking either archived or unarchived cards always opens an in-app preview',()=>{
 const card=readFileSync(new URL('../src/components/PurchasePdfCard.jsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/components/PurchaseBudgetPanel.jsx',import.meta.url),'utf8');
 const quoteUi=readFileSync(new URL('../src/components/SupplierPriceReferencePanel.jsx',import.meta.url),'utf8');
 assert.match(card,/Consulter les informations enregistrées/);
 assert.match(card,/setPreviewOpen\(true\)/);
 assert.match(card,/<PurchaseDataPreview/);
 assert.match(card,/<PurchasePdfPreview/);
 assert.doesNotMatch(card,/if\(!hasOriginal\)\{picker\.current\?\.click\(\);return;\}/);
 assert.match(card,/Joindre le PDF original \(facultatif\)/);
 assert.match(card,/setPreviewOpen\(true\)/);
 assert.match(card,/<PurchasePdfPreview/);
 assert.match(card,/archivePurchasePdf\(file/);
 assert.match(panel,/orders\.map\(item/);
 assert.match(panel,/<PurchasePdfCard/);
 assert.match(quoteUi,/<PurchasePdfCard/);
 assert.match(panel,/archiveNewOrder/);
 assert.match(quoteUi,/archivePurchasePdf\(pending\.sourceFile/);
 for(const code of [card,panel,quoteUi])
  assert.ok(transformSync(code,{loader:'jsx'}).code.length>100);
});

test('existing quote and order details are previewable before archiving PDFs',()=>{
 const fallback=readFileSync(new URL('../src/components/PurchaseDataPreview.jsx',import.meta.url),'utf8');
 const card=readFileSync(new URL('../src/components/PurchasePdfCard.jsx',import.meta.url),'utf8');
 const quote=readFileSync(new URL('../src/components/SupplierPriceReferencePanel.jsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/components/PurchaseBudgetPanel.jsx',import.meta.url),'utf8');
 assert.match(fallback,/Aperçu des données enregistrées/);
 assert.match(fallback,/Le PDF original n’est pas encore archivé/);
 assert.match(fallback,/Il ne s’agit pas d’une reproduction du PDF/);
 assert.match(fallback,/Quantité/);
 assert.match(fallback,/Prix unitaire HT/);
 assert.match(fallback,/Total HT/);
 assert.match(fallback,/role="dialog"/);
 assert.match(fallback,/createPortal\(/);
 assert.match(fallback,/event\.key==='Escape'/);
 assert.match(fallback,/data-purchase-data-preview/);
 assert.doesNotMatch(fallback,/window\.open|download=|createSignedUrl|iframe|<object/);
 assert.match(quote,/detailLines=\{quoteLines\.filter/);
 assert.match(panel,/detailLines=\{orderLines\.filter/);
 assert.match(quote,/\{flocor&&<PurchasePdfCard/);
 assert.match(panel,/\{orders\.map\(item => \(\s*<PurchasePdfCard/);
 assert.match(card,/\{previewOpen&&\(hasOriginal\?<PurchasePdfPreview/);
 assert.ok(transformSync(fallback,{loader:'jsx'}).code.length>100);
});
test('inline preview includes readable PDF pages, navigation and mobile-safe controls',()=>{
 const viewer=readFileSync(new URL('../src/components/PurchasePdfPreview.jsx',import.meta.url),'utf8');
 assert.match(viewer,/createPortal\(/);
 assert.match(viewer,/aria-modal="true"/);
 assert.match(viewer,/role="dialog"/);
 assert.match(viewer,/fetchPrivatePurchasePdf\(record\)/);
 assert.match(viewer,/pdfjs-dist\/build\/pdf\.mjs/);
 assert.match(viewer,/pdf\.getPage\(page\)/);
 assert.match(viewer,/pageProxy\.render\(/);
 assert.match(viewer,/Page \{page\} \/ \{pages\}/);
 assert.match(viewer,/Agrandir le zoom/);
 assert.match(viewer,/Réduire le zoom/);
 assert.match(viewer,/min-h-11 min-w-11/);
 assert.match(viewer,/event\.key==='Escape'/);
 assert.match(viewer,/renderTaskRef\.current\?\.cancel\(\)/);
 assert.match(viewer,/loadingTask\.destroy\(\)/);
 assert.doesNotMatch(viewer,/<a\b|download=|createSignedUrl|window\.open|iframe|<object/);
 assert.ok(transformSync(viewer,{loader:'jsx'}).code.length>100);
});

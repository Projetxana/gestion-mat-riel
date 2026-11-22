import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPdfAutoImport} from '../src/utils/pdfAutoImportPolicy.js';

const rows=[
 {item_code:'ART00429',description:'Té CPVC',quantity:40,unit:'UN',unit_cost:3.8,amount:152,
  included:true,is_complete:true,arithmetic_warning:false},
 {item_code:'ART00159',description:'Tuyau CPVC',quantity:100,unit:'PI',unit_cost:1.33,amount:133,
  included:true,is_complete:true,arithmetic_warning:false},
];
const sample=()=>({
 kind:'order',site:{id:31,company_id:'c1',name:'Cash and Carry',status:'active'},
 hints:{po_number:'P02281',shipping_project_name:'Cash and Carry',suggested_lines:structuredClone(rows)},
 supplier:'Flocor',previousOrders:[],document:{
  mime_type:'application/pdf',digital_text:true,parser_id:'flocor-layout-v1',
  all_pages_processed:true,page_count:3,source_line_count:2,detected_line_count:2,
  material_line_count:2,sha256:'a'.repeat(64),printed_material_total:285,
  total_verified_from_pdf:true
 },evidence:{warnings:[]}
});
const hasIssue=(result,code)=>result.issues.some(issue=>issue.code===code);
test('a verified complete digital PDF needs no user confirmation',()=>{
 const result=assessPdfAutoImport(sample());
 assert.equal(result.status,'auto_commit');
 assert.equal(result.needs_attention,false);
 assert.equal(result.issues.length,0);
 assert.equal(result.verified_rows.length,2);
 assert.equal(result.verified_rows.reduce((sum,row)=>sum+row.amount,0),285);
});
test('same project but wrong PO duplicate must not be posted twice',()=>{
 const input=sample();
 input.previousOrders=[{po_number:'P02281',supplier:'Flocor'}];
 const result=assessPdfAutoImport(input);
 assert.equal(result.status,'attention_required');
 assert.equal(hasIssue(result,'duplicate'),true);
 assert.equal(result.verified_rows.length,0);
});
test('wrong or missing shipping project requires attention, without committing prices',()=>{
 const input=sample(); input.hints.shipping_project_name='Another project';
 const result=assessPdfAutoImport(input);
 assert.equal(hasIssue(result,'project'),true);
 assert.equal(result.verified_rows.length,0);
});
test('partial extraction and unrecognized pages never auto-post a partial order',()=>{
 const input=sample();input.document.source_line_count=3;
 assert.equal(hasIssue(assessPdfAutoImport(input),'coverage'),true);
 input.document.source_line_count=2;input.document.all_pages_processed=false;
 assert.equal(hasIssue(assessPdfAutoImport(input),'pages'),true);
});
test('mismatched supplier printed total blocks unattended save',()=>{
 const input=sample();input.document.printed_material_total=300;
 assert.equal(hasIssue(assessPdfAutoImport(input),'total'),true);
});
test('supplier net subtotal which reflects shipment but not backorders is not safe to commit',()=>{
 const input=sample();input.hints.suggested_lines[0].amount=114;
 input.hints.suggested_lines[0].arithmetic_warning=true;
 input.document.printed_material_total=247;
 const result=assessPdfAutoImport(input);
 assert.equal(hasIssue(result,'amount'),true);
 assert.equal(result.status,'attention_required');
});
test('PDF without a provable subtotal requires exception handling',()=>{
 const input=sample();input.document.total_verified_from_pdf=false;
 assert.equal(hasIssue(assessPdfAutoImport(input),'total'),true);
});
test('budget initial is auto-imported only once and material lines must reconcile',()=>{
 const input=sample();
 input.kind='budget';input.document.parser_id='cd-estimate-v1';
 delete input.hints.po_number;input.supplier='';input.document.printed_material_total=285;
 assert.equal(assessPdfAutoImport(input).status,'auto_commit');
 input.hasExistingBudget=true;
 assert.equal(hasIssue(assessPdfAutoImport(input),'duplicate'),true);
 input.hasExistingBudget=false;input.document.material_line_count=3;
 assert.equal(hasIssue(assessPdfAutoImport(input),'coverage'),true);
});
test('unrecognized or image-based PDF is not silently treated as text',()=>{
 const input=sample();input.document.digital_text=false;
 assert.equal(hasIssue(assessPdfAutoImport(input),'digital'),true);
 input.document.digital_text=true;input.document.parser_id='unknown';
 assert.equal(hasIssue(assessPdfAutoImport(input),'template'),true);
});

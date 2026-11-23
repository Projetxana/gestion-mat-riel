import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
 extractGenericBudgetCandidates, prepareReviewedBudgetPdf, validateReviewedBudgetPdf,
} from '../src/utils/reviewedBudgetPdf.js';

const site={id:11,company_id:'company',name:'A1 Cash & Carry',status:'active'};
const pdf={
 document:{digital_text:true,all_pages_processed:true,page_count:3,
  sha256:'a'.repeat(64),printed_material_total:null},
 hints:{shipping_project_name:'',suggested_lines:[]},
 issues:[{code:'project',message:'Chantier absent'},{code:'template',message:'Mise en page inconnue'}],
 evidence:{warnings:[]}
};
const source=[
 'SOUMISSION FOURNISSEUR',
 'AX-100     Coude CPVC 1 po       4      UN      5,50      22,00',
 'AZ-200     Té de 3 po            2      UN      12,00     24,00',
 'Sous-total                                             46,00',
].join('\n');
const validRow={
 item_code:'AX-100',description:'Coude CPVC',quantity:'4',
 unit:'UN',unit_cost:'5,50',amount:'22,00',included:true
};
const checked={
 rows:[validRow],expectedCount:'1',printedMaterialTotal:null,enteredTotal:'22,00',
 confirmed:true,site,extractedProject:'',
 siteConfirmation:'A1 Cash & Carry',
};

test('unknown vendor layout yields provisional rows, never an automatic import',()=>{
 const items=extractGenericBudgetCandidates(source);
 assert.equal(items.length,2);
 assert.deepEqual(items.map(x=>x.item_code),['AX-100','AZ-200']);
 assert.equal(items[0].amount,22);
 const review=prepareReviewedBudgetPdf(pdf,site,source);
 assert.equal(review.rows.length,2);
 assert.equal(review.genericCandidates,2);
 assert.match(review.issues.join(','),/Mise en page inconnue/);
 assert.equal(review.printedMaterialTotal,null);
});

test('unrecognized PDF with zero extracted rows still allows explicit entry, not a blank commit',()=>{
 const review=prepareReviewedBudgetPdf(pdf,site,'Texte numérique sans tableau lisible');
 assert.equal(review.rows.length,1);
 assert.equal(review.rows[0].description,'');
 assert.throws(()=>validateReviewedBudgetPdf({...checked,rows:review.rows}),/Lignes invalides/);
});

test('manual review checks exact site acknowledgement, row count and source total',()=>{
 assert.throws(()=>validateReviewedBudgetPdf({...checked,siteConfirmation:''}),/chantier/);
 assert.throws(()=>validateReviewedBudgetPdf({...checked,expectedCount:'2'}),/nombre exact/);
 assert.throws(()=>validateReviewedBudgetPdf({...checked,confirmed:false}),/comparé/);
 assert.throws(()=>validateReviewedBudgetPdf({...checked,enteredTotal:'25,00'}),/diffère/);
 assert.equal(validateReviewedBudgetPdf(checked).amount,22);
});

test('no printed material total requires explicit acknowledgement; discrepancy requires another one',()=>{
 assert.throws(()=>validateReviewedBudgetPdf({...checked,enteredTotal:''}),/absence/);
 assert.equal(validateReviewedBudgetPdf({...checked,enteredTotal:'',acceptMissingTotal:true}).amount,22);
 assert.equal(validateReviewedBudgetPdf({...checked,enteredTotal:'25',acceptDifference:true}).amount,22);
});

test('arithmetic inconsistencies, missing unit or excluded lines cannot silently pass',()=>{
 assert.throws(()=>validateReviewedBudgetPdf({...checked,
  rows:[{...validRow,amount:'25'}]}),/quantité × prix/);
 assert.throws(()=>validateReviewedBudgetPdf({...checked,
  rows:[{...validRow,unit:''}]}),/Lignes invalides/);
 assert.throws(()=>validateReviewedBudgetPdf({...checked,
  rows:[{...validRow,included:false}]}),/entre 1 et 5/);
});

test('a genuinely unreadable or incomplete PDF is not accepted for review',()=>{
 assert.throws(()=>prepareReviewedBudgetPdf({...pdf,document:{...pdf.document,digital_text:false}},site,source),/non exploitable/);
 assert.throws(()=>prepareReviewedBudgetPdf({...pdf,document:{...pdf.document,all_pages_processed:false}},site,source),/non exploitable/);
});

test('review UI exists and the Supabase revision remains an explicit action',()=>{
 const component=readFileSync(new URL('../src/components/PurchaseBudgetRevisions.jsx',import.meta.url),'utf8');
 assert.match(component,/Validation manuelle du PDF/);
 assert.match(component,/validateReviewedBudgetPdf/);
 assert.match(component,/Ajouter un article manquant/);
 assert.match(component,/bt_purchase_add_budget_revision/);
 assert.match(component,/confirmé/);
 assert.ok(transformSync(component,{loader:'jsx'}).code.length>100);
});

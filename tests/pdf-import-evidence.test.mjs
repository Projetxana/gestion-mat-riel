import test from 'node:test';
import assert from 'node:assert/strict';
import {derivePdfImportEvidence,assessDigitalPdf} from '../src/utils/pdfImportEvidence.js';

const site={id:11,company_id:'c',name:'DJ4 S.E.C.',status:'active'};
const flocor=[
'FLOCOR DORVAL',
'COMMANDE DE VTE',
'CONFIRMATION',
'CUSTOMER P.O. NUMBER.              JOB NAME',
'P02330                                  DJ4 S.E.C.                      89        106',
'019     ADBLZ105RS2               ADAPT TÊTE GICLEUR                       UN       50.00        50.00          .00           3.5500                   177.50',
'        No Item Client..          ART00540',
'INSTRUCTIONS SPÉCIALES / SPECIAL INSTRUCTIONS              Sous-total / Sub-Total                        177.50',
].join('\n');
const make=(text=flocor)=>({text,numPages:1,sha256:'f'.repeat(64),
 allPagesProcessed:true,digitalText:true});
test('detect Flocor row anchors and printed subtotal separately',()=>{
 const result=derivePdfImportEvidence(make(),{kind:'order',site});
 assert.equal(result.document.source_line_count,1);
 assert.equal(result.document.detected_line_count,1);
 assert.equal(result.document.printed_material_total,177.50);
 assert.equal(result.supplier,'Flocor');
});
test('valid single-row digital supplier confirmation can be auto-committed without manual validation',()=>{
 const result=assessDigitalPdf(make(),{kind:'order',site});
 assert.equal(result.status,'auto_commit',JSON.stringify(result.issues));
 assert.equal(result.verified_rows.length,1);
});
test('a different PO or project is blocked even if amounts are correct',()=>{
 const result=assessDigitalPdf(make(flocor.replace('DJ4 S.E.C.','Autre projet')),{kind:'order',site});
 assert.equal(result.status,'attention_required');
 assert.ok(result.issues.some(x=>x.code==='project'));
});
test('quantity on backorder forces an exception because supplier net excludes BO',()=>{
 const changed=flocor.replace('50.00        50.00          .00           3.5500                   177.50',
  '50.00        40.00         10.00           3.5500                   142.00')
  .replace('177.50\\n','142.00\\n');
 const result=assessDigitalPdf(make(changed),{kind:'order',site});
 assert.equal(result.status,'attention_required');
 assert.ok(result.issues.some(x=>x.code==='exception')||result.issues.some(x=>x.code==='amount'));
});

test('supplier stock code is enough when no optional ART client cross-reference exists',()=>{
 const text=flocor.replace('        No Item Client..          ART00540\n','');
 const result=assessDigitalPdf(make(text),{kind:'order',site});
 assert.equal(result.status,'auto_commit',JSON.stringify(result.issues));
 assert.equal(result.verified_rows[0].item_code,'ADBLZ105RS2');
});
test('CD estimate with grouped total but separate adjustments requires review',()=>{
 const text=[
 '2026-056 Cash and Carry [ MULTI-SCÉNARIO ]',
 'Description   Quantité  Prix  Esc%  Coût net  Matériel',
 'BOULONNERIE ET ANCRAGES BÉTON',
 'CD 00402 ANCRAGE A BETON KH-EZ-I 3/8"   6474 UN   159,56 / CT   0   159,56 / CT   10 329,91',
 'N.B. Comme les quantités sont groupées, le total du matériel peut différer quelque peu de celui des autres rapports. 12 000,00',
 ].join('\n');
 const result=assessDigitalPdf(make(text),{kind:'budget',site:{...site,name:'Cash and Carry'}});
 assert.equal(result.document.source_line_count,1);
 assert.equal(result.document.printed_material_total,12000);
 assert.equal(result.status,'attention_required');
 assert.ok(result.issues.some(x=>x.code==='total'));
});

test('similar PDF layout without Flocor branding never auto-commits under false supplier',()=>{
 const text=flocor.replace('FLOCOR DORVAL','AUTRE FOURNISSEUR');
 const result=assessDigitalPdf(make(text),{kind:'order',site});
 assert.equal(result.status,'attention_required');
 assert.ok(result.issues.some(x=>x.code==='template'));
});

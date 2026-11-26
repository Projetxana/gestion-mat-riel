import test from 'node:test';
import assert from 'node:assert/strict';
import {
 extractFlocorQuotationHeader, extractFlocorQuotationLines,
} from '../src/utils/flocorQuotationParser.js';
import { extractDocumentHints } from '../src/utils/purchaseDocumentText.js';
import { assessDigitalPdf } from '../src/utils/pdfImportEvidence.js';
import { prepareReviewedBudgetPdf,validateReviewedBudgetPdf } from '../src/utils/reviewedBudgetPdf.js';

const site={id:14,company_id:'demo-company',name:'CHANTIER DEMO',status:'active'};
const quotation = (lines, subtotal) => [
 'FLOCOR- DORVAL                                QUOTATION',
 'FLOCOR INC                                    SOUMISSION',
 'Téléphone (514) 000-0000                        2050001',
 '# 1234  CHANTIER DEMO                         10/20/26           1',
 'Seq. Qty/Qté U/M Product No - Description Unit Price/Prix unit. Ext. Price/Prix ext.',
 ...lines,
 'CONTINUED ON NEXT PAGE',
 '\f',
 'Sub-total/',
 String(subtotal),
 'Sous-total',
 'GST / TPS          5.00',
].join('\n');

const sample=quotation([
 '50      2.00 UN   AX-100, COUDE EXPÉRIMENTAL                              3.5500                  7.10',
 'Alias : ART00051',
 '80      1.00 FT   PX.02, TUYAU EXPÉRIMENTAL                                .7000                   .70',
], '7.80');

const makePdf = text=>({
 text,numPages:5,sha256:'a'.repeat(64),digitalText:true,allPagesProcessed:true,
});

test('quotation header identifies vendor, project, quote number and date',()=>{
 const result=extractFlocorQuotationHeader(sample);
 assert.equal(result.shipping_project_name,'CHANTIER DEMO');
 assert.equal(result.project_number,'1234');
 assert.equal(result.quote_number,'2050001');
 assert.equal(result.quotation_date,'10/20/26');
});

test('line parser handles supplier references, aliases and prices below one dollar',()=>{
 const result=extractFlocorQuotationLines(sample);
 assert.equal(result.source_line_count,2);
 assert.equal(result.items.length,2);
 assert.equal(result.printed_material_total,7.80);
 assert.equal(result.calculated_total,7.80);
 assert.equal(result.items[0].customer_alias,'ART00051');
 assert.equal(result.items[1].unit_cost,0.7);
 assert.deepEqual(result.warnings,[]);
});

test('a five-page perfect quotation is never auto-committed as a budget or order',()=>{
 const lines=Array.from({length:80},(_,i)=>String(50+i*10)+
  '      1.00 UN    TEST'+i+', PIÈCE D ESSAI                   1.2500         1.25');
 const pdf=quotation(lines.slice(0,20).concat(['\f'],lines.slice(20,40),
  ['\f'],lines.slice(40,60),['\f'],lines.slice(60)), '100.00');
 const parsed=assessDigitalPdf(makePdf(pdf),{kind:'budget',site});
 assert.equal(parsed.document.parser_id,'flocor-quotation-v1');
 assert.equal(parsed.document.document_type,'supplier_quotation');
 assert.equal(parsed.document.source_line_count,80);
 assert.equal(parsed.document.detected_line_count,80);
 assert.equal(parsed.document.printed_material_total,100);
 assert.equal(parsed.hints.suggested_lines.length,80);
 assert.equal(parsed.status,'attention_required');
 assert.ok(parsed.issues.some(issue=>issue.code==='quotation'));
 assert.equal(parsed.verified_rows.length,0);
 const review=prepareReviewedBudgetPdf(parsed,site,pdf);
 assert.equal(review.quoteNumber,'2050001');
 assert.equal(review.rows.length,80);
 assert.equal(validateReviewedBudgetPdf({
  ...review,rows:review.rows,site,extractedProject:review.extractedProject,
  printedMaterialTotal:review.printedMaterialTotal,
  expectedCount:'80',confirmed:true,
 }).amount,100);
});

test('wrong site, altered subtotal, and malformed product row trigger review warnings',()=>{
 const wrong=assessDigitalPdf(makePdf(sample),{kind:'budget',site:{...site,name:'AUTRE PROJET'}});
 assert.ok(wrong.issues.some(i=>i.code==='project'));
 const altered=extractFlocorQuotationLines(sample.replace('7.80\nSous-total','8.80\nSous-total'));
 assert.ok(altered.warnings.some(w=>/Somme des produits/.test(w)));
 const broken=extractFlocorQuotationLines(sample.replace('3.5500                  7.10','3.5500                  TEXTE'));
 assert.notEqual(broken.source_line_count,broken.items.length);
 assert.ok(broken.warnings.some(w=>/incomplètes/.test(w)));
});

test('quotation never masquerades as Flocor order confirmation',()=>{
 const hints=extractDocumentHints(sample,'order');
 assert.equal(hints.suggested_lines.length,0);
 const decision=assessDigitalPdf(makePdf(sample),{kind:'order',site});
 assert.equal(decision.status,'attention_required');
 assert.ok(decision.issues.some(issue=>issue.code==='quotation'));
 assert.equal(extractFlocorQuotationHeader('FLOCOR- DORVAL\nCOMMANDE DE VTE\nCONFIRMATION'),null);
});

 test('Flocor description header without job number',()=>{
 const text=sample.replace('# 1234  CHANTIER DEMO                         10/20/26           1','Description       Job/Projet          Page\nDJ4 PHASE 2                            1');
 assert.equal(extractFlocorQuotationHeader(text).shipping_project_name,'DJ4 PHASE 2');
 assert.equal(extractFlocorQuotationLines(text).items.length,2);
 });

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {activeSupplierQuotes,compareSupplierPrices,quoteImportDate} from '../src/utils/supplierPriceWatch.js';
import {validateSupplierQuoteDraft} from '../src/utils/supplierPriceQuoteImport.js';

const site={id:12,company_id:'enterprise',name:'A1 Cash & Carry',status:'active'};
const quotes=[
 {id:'q1',supplier:'Flocor',quote_number:'2051538',created_at:'2026-11-23T10:00:00Z'},
];
const quoteLines=[
 {id:501,quote_id:'q1',item_code:'009V.2',description:'Manchon 2 po',unit:'UN',unit_cost:7.93},
 {id:502,quote_id:'q1',item_code:'G1460310',description:'Tige filetee',unit:'FT',unit_cost:0.32},
 {id:503,quote_id:'q1',item_code:'VSRF8',customer_alias:'ART00459',unit:'UN',unit_cost:179.6},
];
const orders=[{id:'order1',supplier:'Flocor',po_number:'PO-101'}];
const orderLines=[{id:901,order_id:'order1',item_code:'009V.2',unit:'UN',
 quantity:100,unit_cost:8.45,description:'Manchon 2 po',amount:845}];
const compare=(extra={})=>compareSupplierPrices({quotes,quoteLines,orders,orderLines,...extra});
test('a confirmed 8.45 vs quoted 7.93 for 100 units alerts $52 before tax',()=>{
 const r=compare();
 assert.equal(r.overpriceCount,1);
 assert.equal(r.impact,52);
 assert.equal(r.overpriced[0].deltaPerUnit,0.52);
 assert.equal(r.overpriced[0].referenceUnitCost,7.93);
});
test('exact SKU or customer alias joins but fuzzy descriptions never do',()=>{
 const r=compare({orderLines:[
  {...orderLines[0],id:1,item_code:'ART00459',unit_cost:179.6,quantity:2},
  {...orderLines[0],id:2,item_code:'OTHER',description:'Manchon 2 po'},
 ]});
 assert.equal(r.lines[0].matchType,'alias');
 assert.equal(r.lines[0].status,'ok');
 assert.equal(r.lines[1].status,'not_in_quote');
 assert.equal(r.notInQuoteCount,1);
 assert.equal(r.needsReview.length,0);
});
test('Flocor P02294 products absent from quote are purchases, not false overprice alerts',()=>{
 const extras=[
  ['50F.2105',1,11.68],['50F.105102',1,12.74],
  ['009V.102',3,7.49],['50F.2102',3,11.35],
  ['F05139',2,3.50],['FLGFITKIT8',3,43.08],
 ];
 const lines=extras.map(([sku,qty,unitPrice],index)=>({
  id:index+1,order_id:'order1',item_code:sku,description:sku,
  unit:'UN',quantity:qty,unit_cost:unitPrice,
  amount:Math.round(qty*unitPrice*100)/100,
 }));
 const r=compare({orderLines:lines});
 assert.equal(r.notInQuoteCount,6);
 assert.equal(r.notInQuoteAmount,217.18);
 assert.equal(r.needsReview.length,0);
 assert.equal(r.overpriceCount,0);
 assert.deepEqual(r.notInQuote.map(x=>x.status),Array(6).fill('not_in_quote'));
});
test('manually identified equivalent product returns to the negotiated price check',()=>{
 const row={id:22,order_id:'order1',item_code:'50F.2105',unit:'UN',
  quantity:1,unit_cost:11.68,amount:11.68};
 const baseline=compare({orderLines:[row]});
 assert.equal(baseline.notInQuoteCount,1);
 const mapped=compare({orderLines:[row],links:[{order_line_id:22,quote_line_id:501}]});
 assert.equal(mapped.notInQuoteCount,0);
 assert.equal(mapped.overpriceCount,1);
 assert.equal(mapped.overpriced[0].impact,3.75);
});
test('FT and PI are compatible; incompatible and ambiguous prices need review',()=>{
 const good=compare({orderLines:[{id:2,order_id:'order1',item_code:'G1460310',
  quantity:540,unit:'PI',unit_cost:0.33}]});
 assert.equal(good.overpriceCount,1);
 assert.equal(good.impact,5.4);
 const wrong=compare({orderLines:[{...orderLines[0],unit:'FT'}]});
 assert.equal(wrong.lines[0].status,'unit_mismatch');
 const ambiguous=compare({quoteLines:[...quoteLines,
  {...quoteLines[0],id:600,unit_cost:8.2}]});
 assert.equal(ambiguous.lines[0].status,'ambiguous');
});
test('different supplier never compares to Flocor even with identical SKU',()=>{
 const r=compare({orders:[{id:'order1',supplier:'Autre fournisseur',po_number:'P01'}]});
 assert.equal(r.lines[0].status,'other_supplier');
 assert.equal(r.overpriceCount,0);
});
test('explicit manual mapping is only valid when it references the active quote',()=>{
 const line={id:990,order_id:'order1',item_code:'CUSTOM',unit:'UN',quantity:1,unit_cost:9};
 const linked=compare({orderLines:[line],links:[{order_line_id:990,quote_line_id:501}]});
 assert.equal(linked.lines[0].status,'above');
 assert.equal(linked.lines[0].matchType,'manual');
 const stale=compare({orderLines:[line],links:[{order_line_id:990,quote_line_id:777}]});
 assert.equal(stale.lines[0].status,'stale_link');
});
test('newest same-supplier quotation wins; historical references remain intact',()=>{
 const newer={id:'q2',supplier:'FLOCOR',created_at:'2026-12-01T00:00:00Z'};
 assert.equal(activeSupplierQuotes([...quotes,newer])[0].id,'q2');
 const r=compare({quotes:[...quotes,newer],quoteLines:[...quoteLines,
  {...quoteLines[0],id:999,quote_id:'q2',unit_cost:8.5}]});
 assert.equal(r.lines[0].status,'below');
});
test('non-quoted purchases never force confirmation or automatic SKU pairing',()=>{
 const order=[
  {id:99,order_id:'order1',item_code:'MISSING-FROM-QUOTE',
   unit:'UN',quantity:3,unit_cost:4,amount:12},
 ];
 const comparison=compare({orderLines:order});
 assert.equal(comparison.notInQuoteCount,1);
 assert.equal(comparison.needsReview.length,0);
 assert.equal(comparison.overpriceCount,0);
 const panel=readFileSync(new URL('../src/components/PurchaseBudgetPanel.jsx',import.meta.url),'utf8');
 const priceRule=panel.split("const priceReview=mode==='order'&&")[1]?.split("if(parsed.status")[0];
 assert.ok(priceRule);
 assert.doesNotMatch(priceRule,/notInQuoteCount|!matchingQuote/);
 const gate=panel.split('const pendingPriceNeedsReview=Boolean(pendingOrder&&(')[1]?.split('));')[0];
 assert.ok(gate);
 assert.doesNotMatch(gate,/notInQuoteCount|!supplierHasQuote/);
 assert.match(panel,/priceRiskAcknowledged/);
});
test('quotation source count, quote number, prices and printed total must be confirmed',()=>{
 const data={
  site,rows:[{item_code:'009V.2',description:'Manchon',unit:'UN',
    quantity:100,unit_cost:7.93,amount:793}],
  documentSite:'A1 CASH & CARRY',quoteNumber:'2051538',supplier:'Flocor',
  printedTotal:793,expectedCount:'1',confirmed:true,
 };
 assert.equal(validateSupplierQuoteDraft(data).amount,793);
 assert.throws(()=>validateSupplierQuoteDraft({...data,confirmed:false}),/Confirmez/);
 assert.throws(()=>validateSupplierQuoteDraft({...data,expectedCount:'80'}),/nombre exact/);
 assert.throws(()=>validateSupplierQuoteDraft({...data,printedTotal:792}),/sous-total/);
 assert.throws(()=>validateSupplierQuoteDraft({...data,rows:[{...data.rows[0],unit_cost:8.45}]}),/incohérent/);
 assert.throws(()=>validateSupplierQuoteDraft({...data,documentSite:'Autre chantier'}),/chantier/);
});
test('quotation date is parsed from vendor format, not from locale heuristics',()=>{
 assert.equal(quoteImportDate('10/20/26'),'2026-10-20');
 assert.equal(quoteImportDate('02/29/25'),null);
});
test('UI compares prices in both pre-import confirmation and recorded order views',()=>{
 const panel=readFileSync(new URL('../src/components/PurchaseBudgetPanel.jsx',import.meta.url),'utf8');
 const alerts=readFileSync(new URL('../src/components/SupplierPriceAlertsPanel.jsx',import.meta.url),'utf8');
 const reference=readFileSync(new URL('../src/components/SupplierPriceReferencePanel.jsx',import.meta.url),'utf8');
 assert.match(panel,/SupplierPriceReferencePanel/);
 assert.match(panel,/SupplierPriceAlertsPanel/);
 assert.match(panel,/pendingPriceComparison/);
 assert.match(panel,/priceRiskAcknowledged/);
 assert.match(panel,/pendingPriceNeedsReview/);
 assert.match(panel,/quoteBasedBudget/);
 assert.match(panel,/!quoteBasedBudget&&<PurchaseLineReconciliation/);
 assert.match(panel,/Aucune correspondance n’est demandée/);
 assert.match(alerts,/Aucune intervention requise/);
 assert.doesNotMatch(alerts,/Il s’agit d’un produit du devis sous une référence différente/);
 assert.match(alerts,/overpriceCount/);
 assert.match(alerts,/Articles commandés hors soumission/);
 assert.match(alerts,/Aucune hausse détectée sur les lignes/);
 assert.match(panel,/pendingPriceComparison\.notInQuoteCount/);
 assert.match(alerts,/bt_supplier_price_line_links/);
 assert.match(reference,/bt_supplier_price_register/);
 for(const source of [panel,alerts,reference])assert.ok(transformSync(source,{loader:'jsx'}).code.length>100);
});

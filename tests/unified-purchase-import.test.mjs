import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPurchasePdf,reconcileDocumentRows,planPurchasePdf} from '../src/utils/unifiedPurchaseImport.js';

const site={id:12,company_id:'a',name:'DJ4 - Phase 2',status:'active'};
const creditText=[
 'Note de crédit','CONFIRMATION','7235979','FLOCOR- DORVAL',
 'P02097   DJ4 S.E.C.    89 106 7235382    NTR CAMION',
 '001     006G.6   006 CAP 6" RAIN FD FIRELOCK   UN  2.00- 2.00- .00 39.5300 79.06-',
 'Sous-total / Sub-Total   79.06-'
].join('\n');
const pdf=(text=creditText)=>({text,sha256:'a'.repeat(64),digitalText:true,allPagesProcessed:true,numPages:1});
const alias={company_id:'a',supplier:'Flocor',name:'DJ4 S.E.C.',site_id:12};

test('credit takes precedence over confirmation; invoice and delivery never commit',()=>{
 assert.equal(classifyPurchasePdf(creditText),'credit');
 for(const text of ['Facture 123','Invoice 123','Bon de livraison 123','Packing slip 123']){
  assert.equal(planPurchasePdf(pdf(text),{site}).status,'non_financial');
 }
});
test('credit needs only site confirmation then reuses scoped alias',()=>{
 const pending=planPurchasePdf(pdf(),{site});
 assert.equal(pending.status,'confirm');
 assert.deepEqual(pending.issues,['confirm_site']);
 const ready=planPurchasePdf(pdf(),{site,aliases:[alias]});
 assert.equal(ready.status,'ready');
 assert.equal(ready.action,'add_credit');
 assert.equal(ready.total,-79.06);
 assert.equal(ready.rows[0].quantity,-2);
 assert.equal(ready.originalReference,'7235382');
});
test('different tenant and conflicting aliases cannot authorize import',()=>{
 assert.equal(planPurchasePdf(pdf(),{site,aliases:[{...alias,company_id:'b'}]}).status,'confirm');
 assert.equal(planPurchasePdf(pdf(),{site,aliases:[alias,{...alias,site_id:13}]}).status,'confirm');
});
test('same hash or supplier document ref blocks; same PO alone does not',()=>{
 assert.equal(planPurchasePdf(pdf(),{site,knownHashes:['a'.repeat(64)]}).status,'duplicate');
 const document={company_id:'a',kind:'credit',supplier:'Flocor',reference:'7235979',po:'P02097'};
 assert.equal(planPurchasePdf(pdf(),{site,knownDocuments:[document]}).status,'duplicate');
 assert.equal(planPurchasePdf(pdf(),{site,aliases:[alias],knownDocuments:[{...document,kind:'order',reference:'7235382'}]}).status,'ready');
});
test('wrong subtotal, wrong signs and missing rows cannot be financially valid',()=>{
 const row={item_code:'X',description:'Item',unit:'UN',quantity:2,unit_cost:10,amount:20};
 assert.equal(reconcileDocumentRows([row],20,{expectedCount:1}).valid,true);
 assert.equal(reconcileDocumentRows([row],20,{expectedCount:2}).valid,false);
 assert.equal(reconcileDocumentRows([row],19,{expectedCount:1}).valid,false);
 assert.equal(reconcileDocumentRows([row],20,{expectedCount:1,credit:true}).valid,false);
 assert.equal(reconcileDocumentRows([{...row,amount:19}],19,{expectedCount:1}).valid,false);
 assert.equal(reconcileDocumentRows([row],null,{expectedCount:1}).valid,false);
});
test('unrecognized and incomplete PDFs are blocked, malformed credits cannot become orders',()=>{
 assert.equal(planPurchasePdf(pdf('unknown document'),{site}).status,'blocked');
 assert.equal(planPurchasePdf({...pdf(),allPagesProcessed:false},{site}).status,'blocked');
 assert.equal(planPurchasePdf(pdf(creditText.replace('Sous-total / Sub-Total   79.06-','Sous-total / Sub-Total   80.00-')),{site}).status,'blocked');
});

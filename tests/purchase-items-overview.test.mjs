import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {comparePurchaseItems,calculatePurchaseBudget} from '../src/utils/purchaseBudget.js';
import {buildPurchaseItemsView,filterPurchaseItems} from '../src/utils/purchaseItemsView.js';

const budget=[
 {id:10,item_code:'VSRF8',description:'VSR COMMUTATEUR ALARME (Alias ART00459)',unit:'UN',quantity:2,unit_cost:179.60,amount:359.20},
 {id:11,item_code:'P10GV2',description:'TUYAU 2 po CED 10',unit:'FT',quantity:100,unit_cost:3.89,amount:389},
 {id:12,item_code:'P10GV2',description:'TUYAU 2 po CED 10',unit:'PI',quantity:50,unit_cost:3.89,amount:194.50},
 {id:13,item_code:'CABHD12',description:'COFFRET POUR 12 TÊTES',unit:'UN',quantity:1,unit_cost:13.27,amount:13.27},
];
const orders=[
 {id:101,item_code:'ART00459',description:'COMMUTATEUR ALARME',unit:'UN',quantity:1,unit_cost:179.60,amount:179.60},
 {id:102,item_code:'P10GV2',description:'TUYAU 2',unit:'FT',quantity:175,unit_cost:3.95,amount:691.25},
 {id:103,item_code:'NON-DEVISE',description:'OUTIL',unit:'UN',quantity:4,unit_cost:2.5,amount:10},
];
const view=()=>buildPurchaseItemsView(budget,comparePurchaseItems(budget,orders));

test('Flocor 359.20 is total for two pieces, with unit price 179.60, not a unit cost',()=>{
 const result=view();
 const v=result.rows.find(r=>r.item_code==='VSRF8');
 assert.equal(v.quotedUnitPrice,179.6);
 assert.equal(v.quotedTotal,359.2);
 assert.equal(v.estimatedQty,2);
 assert.equal(v.orderedQty,1);
 assert.equal(v.committedMatched,179.6);
 assert.equal(v.remainingQty,1);
 assert.equal(v.status,'partial');
});

test('two identical quote SKUs in different foot units combine into one reference',()=>{
 const result=view();
 assert.equal(result.counts.quotedLines,4);
 assert.equal(result.counts.references,3);
 const pipe=result.rows.find(row=>row.item_code==='P10GV2');
 assert.equal(pipe.estimatedQty,150);
 assert.equal(pipe.orderedQty,175);
 assert.equal(pipe.status,'over');
 assert.equal(pipe.extraQty,25);
 assert.equal(pipe.quotedTotal,583.5);
 assert.equal(pipe.quotedUnitPrice,3.89);
});

test('the unquoted tool is never added to quote lines but stays in global commitments',()=>{
 const result=view();
 assert.equal(result.rows.length,3);
 assert.equal(result.counts.withOrders,2);
 assert.equal(result.counts.noOrders,1);
 const global=calculatePurchaseBudget(budget,orders);
 assert.equal(global.committed,880.85);
 assert.equal(result.matchedAmount,870.85);
 assert.equal(global.committed-result.matchedAmount,10);
 assert.equal(result.rows.find(row=>row.item_code==='CABHD12').status,'none');
});

test('search by normalized code or alias, then filter by purchased/remaining/over',()=>{
 const result=view();
 assert.equal(filterPurchaseItems(result.rows,'ART00459').length,1);
 assert.equal(filterPurchaseItems(result.rows,'commutateur').length,1);
 assert.equal(filterPurchaseItems(result.rows,'  P10GV2 ', 'over').length,1);
 assert.equal(filterPurchaseItems(result.rows,'','ordered').length,2);
 assert.equal(filterPurchaseItems(result.rows,'','none').length,1);
 assert.equal(filterPurchaseItems(result.rows,'','remaining').length,2);
});

test('single responsive view replaces both old scrollboxes; all items are searchable',()=>{
 const page=readFileSync(new URL('../src/components/PurchaseBudgetPanel.jsx',import.meta.url),'utf8');
 const component=readFileSync(new URL('../src/components/PurchaseItemsOverview.jsx',import.meta.url),'utf8');
 assert.match(page,/<PurchaseItemsOverview/);
 assert.doesNotMatch(page,/budgetLines\.slice\(0, 25\)/);
 assert.doesNotMatch(page,/Comparer les quantités estimées et commandées/);
 assert.match(component,/Prix unitaire réf\./);
 assert.match(component,/Montant prévu/);
 assert.match(component,/Coût commandé/);
 assert.match(component,/hidden lg:block/);
 assert.match(component,/lg:hidden/);
 assert.match(component,/type="search"/);
 assert.match(component,/Aucun achat identifié/);
 assert.match(component,/Les produits sans correspondance/);
 assert.match(component,/setVisible\(n=>n\+20\)/);
 assert.ok(transformSync(page,{loader:'jsx'}).code.length>100);
 assert.ok(transformSync(component,{loader:'jsx'}).code.length>100);
});

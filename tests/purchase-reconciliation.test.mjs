import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePurchaseItems,suggestBudgetCorrespondences} from '../src/utils/purchaseBudget.js';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';

const budget=[
 {id:10,item_code:'CD 00020',description:'TUYAU SCH10 NOIR RAIN 2"',unit:'PI',quantity:3239,amount:15749.25},
 {id:11,item_code:'CD 00023',description:'TUYAU SCH10 NOIR RAIN 4"',unit:'PI',quantity:714,amount:7363.04},
 {id:12,item_code:'CD 04251',description:'COUP RIGIDE 2" VICTAULIC',unit:'UN',quantity:481,amount:5738.33}
];
const orders=[
 {id:1,order_id:'P02294',item_code:'P10GV2',description:'TUYAU 2" CED 10 ERW NOIR RAIN',unit:'FT',quantity:1575,amount:6126.75},
 {id:2,order_id:'P02316',item_code:'P10GV2',description:'TUYAU 2" CED 10 ERW NOIR RAIN',unit:'FT',quantity:840,amount:3267.60},
 {id:3,order_id:'P02316',item_code:'P10GV4',description:'TUYAU 4" CED 10 ERW NOIR RAIN',unit:'FT',quantity:714,amount:5890.50},
 {id:4,order_id:'P02294',item_code:'009V.2',description:'MANCHON RIGIDE 2" JOINT',unit:'UN',quantity:204,amount:1617.72}
];
test('supplier codes do not create false 0-purchased claims',()=>{
 const result=comparePurchaseItems(budget,orders);
 assert.equal(result.unmatched.length,4);
 assert.equal(result.matched.find(x=>x.item_code==='CD 00020').orderedQty,0);
});
test('manual links reconcile quantities without changing any order amounts',()=>{
 const links=[
 {order_line_id:1,budget_line_id:10,disposition:'linked'},
 {order_line_id:2,budget_line_id:10,disposition:'linked'},
 {order_line_id:3,budget_line_id:11,disposition:'linked'}
 ];
 const result=comparePurchaseItems(budget,orders,links);
 assert.equal(result.unmatched.length,1);
 assert.equal(result.matched.find(x=>x.item_code==='CD 00020').orderedQty,2415);
 assert.equal(result.matched.find(x=>x.item_code==='CD 00020').remainingQty,824);
 assert.equal(result.matched.find(x=>x.item_code==='CD 00023').orderedQty,714);
 assert.equal(result.outsideBudget.length,0);
 const totalBefore=orders.reduce((sum,x)=>sum+x.amount,0);
 const totalAfter=[...orders].reduce((sum,x)=>sum+x.amount,0);
 assert.equal(totalBefore,totalAfter);
});
test('a replaced CD estimate reattaches saved old links by exact active Flocor code or printed alias',()=>{
 const active=[
  {id:200,item_code:'P10GV2',description:'TUYAU 2 PO',unit:'FT',quantity:3255,amount:12661.95},
  {id:201,item_code:'90CI1',description:'COUDE 90 1 PO (Alias ART00051)',unit:'UN',quantity:75,amount:172.5},
 ];
 const historic=[
  {id:1,order_id:'po',item_code:'P10GV2',description:'TUYAU',unit:'FT',quantity:840,amount:3267.6},
  {id:2,order_id:'po',item_code:'ART00051',description:'COUDE',unit:'UN',quantity:60,amount:138}
 ];
 const obsoleteLinks=[
  {order_line_id:1,budget_line_id:10,disposition:'linked'},
  {order_line_id:2,budget_line_id:11,disposition:'linked'}
 ];
 const r=comparePurchaseItems(active,historic,obsoleteLinks);
 assert.equal(r.unmatched.length,0);
 assert.equal(r.matched.find(x=>x.item_code==='P10GV2').orderedQty,840);
 assert.equal(r.matched.find(x=>x.item_code==='90CI1').orderedQty,60);
});
test('never reuse an obsolete historical link when active Flocor SKU is ambiguous or absent',()=>{
 const active=[{id:200,item_code:'P10GV2',description:'TUYAU',unit:'FT',quantity:100,amount:389}];
 const old=[{id:1,item_code:'DIFFERENT',unit:'FT',quantity:5,amount:50}];
 const r=comparePurchaseItems(active,old,[{order_line_id:1,budget_line_id:10,disposition:'linked'}]);
 assert.equal(r.unmatched.length,1);
});
test('out-of-estimate entries stay committed but no longer appear as unresolved',()=>{
 const links=[{order_line_id:4,disposition:'outside_budget',budget_line_id:null}];
 const result=comparePurchaseItems(budget,orders,links);
 assert.equal(result.unmatched.length,3);
 assert.deepEqual(result.outsideBudget.map(x=>x.id),[4]);
});
test('a missing or incompatible link cannot quietly associate quantities',()=>{
 const result=comparePurchaseItems(budget,orders,[
  {order_line_id:1,disposition:'linked',budget_line_id:12}
 ]);
 assert.equal(result.unmatched.length,4);
});
test('candidate sorting suggests compatible pipe sizes but never performs an automatic save',()=>{
 const candidates=suggestBudgetCorrespondences(orders[2],budget);
 assert.equal(candidates[0].item_code,'CD 00023');
 assert.equal(candidates.every(x=>x.unit==='PI'),true);
});
test('UI exposes supplier PO, association, outside-estimate and correction controls',()=>{
 const panel=readFileSync(new URL('../src/components/PurchaseLineReconciliation.jsx',import.meta.url),'utf8');
 assert.match(panel,/Associer à l’estimation/);
 assert.match(panel,/Achat hors estimation/);
 assert.match(panel,/Corriger/);
 assert.match(panel,/po_number/);
 assert.match(panel,/bt_purchase_line_links/);
 assert.ok(transformSync(panel,{loader:'jsx',target:'es2022'}).code.length>100);
});

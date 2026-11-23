import test from 'node:test';
import assert from 'node:assert/strict';
import {activeBudgetLines,projectedBudgetRevision} from '../src/utils/purchaseBudgetRevisions.js';
import {calculatePurchaseBudget,comparePurchaseItems} from '../src/utils/purchaseBudget.js';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';

const original=[
 {id:1,revision_id:null,item_code:'CD 00020',description:'Tuyau',unit:'PI',quantity:10,amount:100},
 {id:2,revision_id:null,item_code:'CD 00429',description:'Té',unit:'UN',quantity:10,amount:50}
];
const replacement=[
 {id:10,revision_id:'r1',item_code:'CD 00020',description:'Tuyau',unit:'PI',quantity:15,amount:150}
];
const extension=[
 {id:20,revision_id:'e1',item_code:'CD 00088',description:'Travaux supplémentaires',unit:'UN',quantity:2,amount:80}
];
const second=[
 {id:30,revision_id:'r2',item_code:'CD 00020',description:'Tuyau',unit:'PI',quantity:19,amount:190}
];
const revisions=[
 {id:'r1',revision_no:1,kind:'replacement',total_amount:150},
 {id:'e1',revision_no:2,kind:'extension',total_amount:80},
 {id:'r2',revision_no:3,kind:'replacement',total_amount:190}
];
test('baseline remains active until the first replacement',()=>{
 assert.deepEqual(activeBudgetLines([...original,...extension],revisions.filter(r=>r.kind==='extension')).map(x=>x.id),[1,2,20]);
});
test('latest replacement plus every extension is active, not historical lines',()=>{
 assert.deepEqual(activeBudgetLines([...original,...replacement,...extension,...second],revisions)
  .map(x=>x.id),[20,30]);
 const after=activeBudgetLines([...original,...replacement,...extension,...second],revisions);
 const purchase=calculatePurchaseBudget(after,[{amount:95}]);
 assert.equal(purchase.initial,270);
 assert.equal(purchase.committed,95);
 assert.equal(purchase.uncommitted,175);
});
test('new replacement retains extensions, new extension adds only its own amount',()=>{
 const current=[...replacement,...extension];
 const before=revisions.slice(0,2);
 assert.deepEqual(projectedBudgetRevision(current,second,before,'replacement'),{
  current:230,base:150,extensions:80,newList:190,projected:270,difference:40
 });
 assert.equal(projectedBudgetRevision(current,[{amount:30}],before,'extension').projected,260);
});
test('historical purchase links never invent a link to replaced material',()=>{
 const oldLink=[{order_line_id:9,budget_line_id:1,disposition:'linked'}];
 const active=activeBudgetLines([...original,...replacement,...extension],revisions.slice(0,2));
 const matched=comparePurchaseItems(active,[{id:9,item_code:'SUPPLIER-SKU',description:'Tuyau',unit:'PI',quantity:3,amount:55}],oldLink);
 assert.equal(matched.unmatched.length,1);
 assert.equal(matched.matched.find(x=>x.item_code==='CD 00020').orderedQty,0);
});
test('UI and project summary use the effective budget RPC',()=>{
 const panel=readFileSync(new URL('../src/components/PurchaseBudgetPanel.jsx',import.meta.url),'utf8');
 const modal=readFileSync(new URL('../src/components/ProjectMonitoringModal.jsx',import.meta.url),'utf8');
 const form=readFileSync(new URL('../src/components/PurchaseBudgetRevisions.jsx',import.meta.url),'utf8');
 assert.match(panel,/bt_purchase_effective_budget_lines/);
 assert.match(modal,/bt_purchase_effective_budget_lines/);
 assert.match(form,/Remplacer l’estimation de base/);
 assert.match(form,/Ajouter une liste complémentaire/);
 assert.match(form,/bt_purchase_add_budget_revision/);
 assert.match(form,/history|historique/i);
 assert.ok(transformSync(form,{loader:'jsx'}).code.length>100);
 assert.ok(transformSync(modal,{loader:'jsx'}).code.length>100);
});

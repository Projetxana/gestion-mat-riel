import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBudgetDocument,activePriceDocuments} from '../src/utils/unifiedBudgetDocument.js';

const site={id:12,company_id:'a',status:'active',name:'DJ4 - Phase 2'};
const row={item_code:'X',description:'Produit',unit:'UN',quantity:2,unit_cost:10,amount:20,customer_alias:'ART1234',source_sequence:1};
const plan={status:'ready',kind:'quotation',sha256:'a'.repeat(64),supplier:'Flocor',reference:'123',rows:[row],printedTotal:20,expectedCount:1};
test('one intent preserves budget and supplier aliases without changing totals',()=>{
 const result=prepareBudgetDocument({plan,site,hasBudget:false});
 assert.equal(result.kind,'initial');
 assert.equal(result.total,20);
 assert.equal(result.projection.projected,20);
 assert.equal(result.budgetRows[0].customer_alias,undefined);
 assert.equal(result.supplierReference.rows[0].customer_alias,'ART1234');
});
test('replacement retains extension amounts and extension adds to active budget',()=>{
 const activeLines=[{amount:100,revision_id:null},{amount:30,revision_id:'e'}];
 const revisions=[{id:'e',kind:'extension',revision_no:1}];
 const common={plan,site,hasBudget:true,activeLines,revisions};
 assert.equal(prepareBudgetDocument({...common,revisionKind:'replacement'}).projection.projected,50);
 assert.equal(prepareBudgetDocument({...common,revisionKind:'extension'}).projection.projected,150);
});
test('invalid intent cannot authorize financial changes',()=>{
 for(const p of [{...plan,status:'confirm'},{...plan,printedTotal:21},{...plan,expectedCount:2},{...plan,sha256:''},{...plan,reference:''}]){
  assert.throws(()=>prepareBudgetDocument({plan:p,site,hasBudget:false}));
 }
 assert.throws(()=>prepareBudgetDocument({plan,site,hasBudget:true}));
 assert.throws(()=>prepareBudgetDocument({plan,site,hasBudget:false,revisionKind:'extension'}));
});
test('active prices preserve extensions, scope tenant and retain conflicts',()=>{
 const doc=(id,kind,revision_no,price,company_id='a',site_id=12)=>({id,kind,revision_no,company_id,site_id,supplier:'Flocor',rows:[{...row,unit_cost:price}]});
 const docs=[doc('old','initial',0,8),doc('new','replacement',2,10),doc('extra','extension',1,12),doc('foreign','extension',3,1,'b'),doc('other-site','extension',4,1,'a',99)];
 const active=activePriceDocuments(docs,site);
 assert.equal(active.length,1);
 assert.deepEqual(active[0].documents,['new','extra']);
 assert.deepEqual(active[0].rows.map(r=>r.unit_cost),[10,12]);
});
test('internal estimates do not invent supplier quotes',()=>{
 const result=prepareBudgetDocument({plan:{...plan,kind:'estimate',supplier:'',reference:''},site,hasBudget:false});
 assert.equal(result.supplierReference,null);
});

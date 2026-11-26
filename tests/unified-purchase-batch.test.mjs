import test from 'node:test';
import assert from 'node:assert/strict';
import {planPurchaseBatch,summarizePurchaseBatch} from '../src/utils/unifiedPurchaseBatch.js';

const site={id:12,company_id:'a',name:'DJ4 - Phase 2',status:'active'};
const alias={company_id:'a',supplier:'Flocor',name:'DJ4 S.E.C.',site_id:12};
const text=['Note de crédit','CONFIRMATION','7235979','FLOCOR- DORVAL','P02097   DJ4 S.E.C.    89 106 7235382    NTR CAMION','001     006G.6   006 CAP 6" RAIN FD FIRELOCK   UN  2.00- 2.00- .00 39.5300 79.06-','Sous-total / Sub-Total   79.06-'].join('\n');
const readPdf=async file=>{
 if(file.broken)throw Error('broken');
 return {text:file.text||text,sha256:file.hash||'a'.repeat(64),digitalText:true,allPagesProcessed:true,numPages:1};
};
test('one unreadable PDF does not prevent other files, same bytes detected',async()=>{
 const progress=[];
 const results=await planPurchaseBatch([{name:'credit.pdf'},{name:'broken.pdf',broken:true},{name:'renamed.pdf'}],{readPdf,context:{site,aliases:[alias]},onProgress:p=>progress.push(p)});
 assert.deepEqual(results.map(r=>r.plan.status),['ready','blocked','duplicate']);
 assert.equal(results[0].plan.total,-79.06);
 assert.deepEqual(progress.at(-1),{completed:3,total:3});
 assert.equal(summarizePurchaseBatch(results).netImported,0);
});
test('summary only counts confirmed successful writes',()=>{
 const results=[{plan:{status:'imported',action:'add_order',total:734.94}},{plan:{status:'imported',action:'add_credit',total:-79.06}},{plan:{status:'ready',action:'add_order',total:100}},{plan:{status:'imported',action:'create_budget',total:78611.89}}];
 assert.equal(summarizePurchaseBatch(results).netImported,655.88);
});
test('batch size capped',async()=>{
 await assert.rejects(planPurchaseBatch(Array(31).fill({}),{readPdf,context:{site}}),/Maximum/);
});

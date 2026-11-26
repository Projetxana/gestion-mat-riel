import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetPriceReference} from '../src/utils/budgetPriceReference.js';
import {compareSupplierPrices} from '../src/utils/supplierPriceWatch.js';
const budget={id:'b',source_name:'Soumission Flocor.PDF'};
const budgetLines=[{id:1,item_code:'A',unit:'UN',unit_cost:10,amount:100}];
test('historical Flocor budget compares existing orders',()=>{
 const refs=budgetPriceReference({budget,budgetLines});
 const result=compareSupplierPrices({...refs,orders:[{id:'o',supplier:'Flocor'}],orderLines:[{order_id:'o',item_code:'A',unit:'UN',quantity:2,unit_cost:12}]});
 assert.equal(result.impact,4);
});
test('general budget and mixed extensions are not supplier references',()=>{
 assert.equal(budgetPriceReference({budget:{...budget,source_name:'Estimation.pdf'},budgetLines}).quotes.length,0);
 assert.equal(budgetPriceReference({budget,budgetLines,revisions:[{kind:'extension'}]}).quotes.length,0);
});
test('explicit quotation takes precedence',()=>{
 const quotes=[{id:'q',supplier:'Flocor'}];
 assert.deepEqual(budgetPriceReference({budget,budgetLines,quotes}).quotes,quotes);
});

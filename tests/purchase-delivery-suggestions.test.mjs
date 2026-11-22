import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestDeliveryReviewRows} from '../src/utils/deliveryReconciliation.js';

const orders=[
 {id:11,item_code:'CD 00429',description:'Té',unit:'UN',quantity:100},
 {id:12,item_code:'CD 00159',description:'Tuyau',unit:'PI',quantity:200},
 {id:13,item_code:'CD 00999',description:'Autre',unit:'UN',quantity:40},
];
test('review proposals match client codes and compatible units, never prices',()=>{
 const result=suggestDeliveryReviewRows([
  {item_code:'ART00429',description:'Té',unit:'EA',shipped_qty:75,supplier_bo_qty:25,is_complete:true},
  {item_code:'ART00159',description:'Tuyau',unit:'FT',shipped_qty:100,supplier_bo_qty:0,is_complete:true}
 ],orders);
 assert.equal(result.rejected.length,0);
 assert.deepEqual(result.proposals,{'11':{shipped:'75',bo:'25'},'12':{shipped:'100',bo:'0'}});
});
test('ambiguous codes, repeated scans and over-delivery remain manual',()=>{
 const result=suggestDeliveryReviewRows([
  {item_code:'ART00429',description:'Té',shipped_qty:75,is_complete:true},
  {item_code:'ART00429',description:'Té',shipped_qty:10,is_complete:true},
  {item_code:'ART00159',description:'Tuyau',shipped_qty:250,is_complete:true},
  {item_code:'ART99999',description:'inconnu',shipped_qty:4,is_complete:true}
 ],orders);
 assert.equal(Object.keys(result.proposals).length,1);
 assert.equal(result.rejected.length,3);
});
test('OCR missing shipped quantity does not prefill received=0',()=>{
 const result=suggestDeliveryReviewRows([
  {item_code:'ART00429',description:'Té',shipped_qty:null,is_complete:false}
 ],orders);
 assert.equal(Object.keys(result.proposals).length,0);
 assert.equal(result.rejected.length,1);
});

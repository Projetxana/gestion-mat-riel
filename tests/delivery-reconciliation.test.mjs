import test from 'node:test';
import assert from 'node:assert/strict';
import {
    matchDeliveryToOrder, summarizeDeliveries, deliveryReviewPayload,
    matchingDeliveryItemCodes, fingerprintDeliveryPhotos,
} from '../src/utils/deliveryReconciliation.js';
import { webcrypto } from 'node:crypto';

const COMPANY_A = 'company-a', COMPANY_B = 'company-b';
const orders = [
    { id: 1, company_id: COMPANY_A, site_id: 10, supplier: 'Flocor', po_number: 'P02281' },
    { id: 2, company_id: COMPANY_B, site_id: 99, supplier: 'Flocor', po_number: 'P02281' },
    { id: 3, company_id: COMPANY_A, site_id: 20, supplier: 'Flocor', po_number: 'P02281' },
    { id: 4, company_id: COMPANY_A, site_id: 10, supplier: 'Autre', po_number: 'P02281' },
];

test('PO matching requires same company and site; supplier disambiguates', () => {
    assert.equal(matchDeliveryToOrder({poNumber:'P 02281',supplier:'Flocor',companyId:COMPANY_A,siteId:10},orders).order.id,1);
    assert.equal(matchDeliveryToOrder({poNumber:'P02281',supplier:'',companyId:COMPANY_A,siteId:10},orders).status,'review');
    assert.equal(matchDeliveryToOrder({poNumber:'P02281',supplier:'Flocor',companyId:COMPANY_A,siteId:99},orders).status,'review');
    assert.equal(matchDeliveryToOrder({poNumber:'P02281',supplier:'Flocor',companyId:COMPANY_B,siteId:10},orders).status,'review');
});

test('two delivery slips accumulate; BO is an explicit supplier statement, not a remaining quantity', () => {
    const lines = [
        {id:11,order_id:1,item_code:'ART00422',description:'CAP CPVC',unit:'UN',quantity:100},
        {id:12,order_id:1,item_code:'ART00523',description:'TE CPVC',unit:'UN',quantity:250},
    ];
    const notes = [
        {id:'a',order_id:1,status:'verified',verified_at:'2026-11-20T09:00:00Z'},
        {id:'b',order_id:1,status:'verified',verified_at:'2026-11-21T09:00:00Z'},
        {id:'pending',order_id:1,status:'pending_review',verified_at:'2026-11-22T09:00:00Z'},
    ];
    const deliveries = [
        {delivery_id:'a',order_id:1,order_line_id:11,shipped_qty:60,supplier_bo_qty:40},
        {delivery_id:'b',order_id:1,order_line_id:11,shipped_qty:40,supplier_bo_qty:0},
        {delivery_id:'a',order_id:1,order_line_id:12,shipped_qty:100,supplier_bo_qty:null},
        {delivery_id:'pending',order_id:1,order_line_id:12,shipped_qty:150,supplier_bo_qty:0},
    ];
    const summary=summarizeDeliveries(lines,notes,deliveries);
    assert.equal(summary[0].receivedQty,100);
    assert.equal(summary[0].remainingQty,0);
    assert.equal(summary[0].status,'complete');
    assert.equal(summary[1].receivedQty,100);
    assert.equal(summary[1].remainingQty,150);
    assert.equal(summary[1].status,'remaining');
    assert.equal(summary[1].supplierBoQty,null);
});

test('one supplier BO is distinct from unshipped quantity', () => {
    const summary=summarizeDeliveries(
      [{id:11,order_id:1,item_code:'ART',description:'pivot',unit:'UN',quantity:100}],
      [{id:'a',order_id:1,status:'verified',verified_at:'2026-11-20T09:00:00Z'}],
      [{delivery_id:'a',order_id:1,order_line_id:11,shipped_qty:0,supplier_bo_qty:75}]
    )[0];
    assert.equal(summary.remainingQty,100);
    assert.equal(summary.supplierBoQty,75);
    assert.equal(summary.status,'supplier_bo');
});

test('review rows reject duplicate product lines and non-quantities, preserve 3 decimals', () => {
    assert.deepEqual(deliveryReviewPayload([{order_line_id:11,shipped_qty:'1.125',supplier_bo_qty:'0'}]),
      [{order_line_id:11,shipped_qty:1.125,supplier_bo_qty:0}]);
    assert.throws(()=>deliveryReviewPayload([{order_line_id:11,shipped_qty:-1}]));
    assert.throws(()=>deliveryReviewPayload([{order_line_id:11,shipped_qty:1},{order_line_id:11,shipped_qty:2}]));
    assert.throws(()=>deliveryReviewPayload([{order_line_id:11,shipped_qty:0,supplier_bo_qty:0}]));
});

test('client/supplier codes only match when equivalent, not description-only', () => {
    assert.equal(matchingDeliveryItemCodes('ART00429','CD 00429'),true);
    assert.equal(matchingDeliveryItemCodes('FL999','CD 00429'),false);
});

test('fingerprinting identical photos is deterministic; different bytes change the digest', async () => {
    const photo = data => ({blob:new Blob([data],{type:'image/jpeg'})});
    const a=await fingerprintDeliveryPhotos([photo('abc'),photo('xyz')],webcrypto);
    const b=await fingerprintDeliveryPhotos([photo('abc'),photo('xyz')],webcrypto);
    const c=await fingerprintDeliveryPhotos([photo('abc'),photo('xyZ')],webcrypto);
    assert.match(a,/^[0-9a-f]{64}$/);
    assert.equal(a,b);
    assert.notEqual(a,c);
});

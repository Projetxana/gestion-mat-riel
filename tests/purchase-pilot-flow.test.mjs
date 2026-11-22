import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDocumentHints,getDocumentSiteStatus} from '../src/utils/purchaseDocumentText.js';
import {validateReviewedOrderRows} from '../src/utils/purchaseDocumentLines.js';
import {
 parsePurchaseRows,calculatePurchaseBudget,shippingProjectVerification,
} from '../src/utils/purchaseBudget.js';
import {
 suggestDeliveryReviewRows,deliveryReviewPayload,summarizeDeliveries,matchDeliveryToOrder,
} from '../src/utils/deliveryReconciliation.js';

// Fully fabricated purchase confirmation and shipment with distinct budget.
// No real project names, supplier prices or email recipients.
const companyId='tenant-pilot';
const site={id:101,name:'Chantier Démonstration A',company_id:companyId,status:'active'};
const orderText=[
'Customer PO#: P02330',
'Job Name: Chantier Démonstration A',
'| Code client | Description | Ordered | U/M | Unit Price | Net Amount |',
'| --- | --- | ---: | --- | ---: | ---: |',
'| ART00429 | Té CPVC | 20 | UN | 3,80 | 76,00 |',
'| ART00159 | Tuyau CPVC | 100 | PI | 1,33 | 133,00 |'
].join('\n');
const shipmentText=[
'Customer PO#: P02330',
'Job Name: Chantier Démonstration A',
'| Code client | Description | Ordered | Shipped | B/O |',
'| --- | --- | ---: | ---: | ---: |',
'| ART00429 | Té CPVC | 20 | 12 | 8 |',
'| ART00159 | Tuyau CPVC | 100 | 100 | 0 |'
].join('\n');

test('pilot: PDF draft -> admin review -> PO -> shipment/BO; delivery cannot increase budget',()=>{
 const detected=extractDocumentHints(orderText,'order');
 assert.equal(detected.po_number,'P02330');
 assert.equal(getDocumentSiteStatus(detected,site),'candidate');
 assert.equal(detected.suggested_lines.length,2);
 assert.equal(detected.requires_review,true);
 const reviewed=validateReviewedOrderRows(detected.suggested_lines.map(x=>({...x,included:true})));
 const orderLines=parsePurchaseRows(reviewed,{kind:'order'});
 assert.equal(orderLines.length,2);
 assert.equal(orderLines.reduce((sum,l)=>sum+l.amount,0),209);
 const budgetLines=[{item_code:'CD 00429',description:'Té CPVC',quantity:20,
  unit:'UN',amount:70,unit_cost:3.5},{item_code:'CD 00159',description:'Tuyau',
  quantity:100,unit:'PI',amount:120,unit_cost:1.2}];
 const firstBudget=calculatePurchaseBudget(budgetLines,orderLines);
 assert.equal(firstBudget.initial,190);
 assert.equal(firstBudget.committed,209);
 assert.equal(shippingProjectVerification(detected.shipping_project_name,site.name).canAccept,true);

 const order={id:'po1',company_id:companyId,site_id:site.id,
  po_number:'P02330',supplier:'Fournisseur Démo'};
 assert.equal(matchDeliveryToOrder({poNumber:'P02330',companyId,siteId:site.id,supplier:order.supplier},[order]).status,'matched');
 const scanned=extractDocumentHints(shipmentText,'delivery');
 assert.equal(scanned.suggested_lines.length,2);
 const ids=orderLines.map((x,i)=>({id:i+1,order_id:order.id,...x}));
 const {proposals,rejected}=suggestDeliveryReviewRows(scanned.suggested_lines,ids);
 assert.equal(rejected.length,0);
 assert.deepEqual(proposals['1'],{shipped:'12',bo:'8'});
 const payload=deliveryReviewPayload(Object.entries(proposals).map(([id,entry])=>({
  order_line_id:Number(id),shipped_qty:entry.shipped,
  supplier_bo_qty:entry.bo,
 })));
 assert.equal(payload.length,2);
 const notes=[{id:'delivery-1',status:'verified',order_id:order.id,
  verified_at:'2026-11-22T12:00:00Z'}];
 const shipment=payload.map(x=>({...x,order_id:order.id,delivery_id:'delivery-1'}));
 const summary=summarizeDeliveries(ids,notes,shipment);
 assert.equal(summary[0].receivedQty,12);
 assert.equal(summary[0].remainingQty,8);
 assert.equal(summary[0].supplierBoQty,8);
 assert.equal(summary[1].receivedQty,100);
 assert.equal(summary[1].remainingQty,0);
 // Confirmed delivery is quantities-only: purchase financial commitments unchanged.
 assert.deepEqual(calculatePurchaseBudget(budgetLines,orderLines),firstBudget);
});

test('pilot: a supplier document with a valid PO but wrong delivery project must be reviewed',()=>{
 const hints=extractDocumentHints(orderText.replaceAll(site.name,'Chantier Démonstration B'),'order');
 assert.equal(hints.po_number,'P02330');
 assert.equal(getDocumentSiteStatus(hints,site),'review');
 assert.equal(shippingProjectVerification(hints.shipping_project_name,site.name).canAccept,false);
 const other={id:'other',name:'Chantier Démonstration B',company_id:'other-tenant',status:'active'};
 assert.equal(matchDeliveryToOrder({poNumber:'P02330',companyId:'other-tenant',
  siteId:other.id,supplier:'Fournisseur Démo'},[
    {id:'po1',company_id:companyId,site_id:site.id,po_number:'P02330',supplier:'Fournisseur Démo'}
  ]).status,'review');
});

test('pilot fixture: same construction site, different PO, must not attach shipment',()=>{
 const confirmation={id:'order-B',company_id:companyId,site_id:site.id,
  po_number:'P02330',supplier:'Fournisseur Démo'};
 const scanned={poNumber:'P02281',companyId,siteId:site.id,supplier:confirmation.supplier};
 assert.equal(matchDeliveryToOrder(scanned,[confirmation]).status,'review');
 // The original photo example contained 100 ordered, 0 shipped and 100 B/O:
 // preserve all three quantities separately and never create committed spend.
 const summary=summarizeDeliveries(
   [{id:22,order_id:'order-A',item_code:'ART77703',unit:'UN',quantity:100}],
   [{id:'scan-A',status:'verified',order_id:'order-A',
     verified_at:'2026-11-22T12:00:00Z'}],
   [{delivery_id:'scan-A',order_id:'order-A',order_line_id:22,
     shipped_qty:0,supplier_bo_qty:100}]
 );
 assert.equal(summary[0].receivedQty,0);
 assert.equal(summary[0].remainingQty,100);
 assert.equal(summary[0].supplierBoQty,100);
 assert.equal(summary[0].status,'supplier_bo');
});

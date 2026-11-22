import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSupplierTableLines,safeSupplierNumber} from '../src/utils/purchaseDocumentLines.js';

const flocorOrder = [
'## Flocor – confirmation de commande (anonymized fixture)',
'Customer PO#: P02281',
'Job Name: DJ4 S.E.C.',
'| ITEM CLIE | Description | Ordered | U/M | Prix unitaire | Montant |',
'| --- | --- | ---: | --- | ---: | ---: |',
'| ART00429 | Té CPVC 1 po | 40 | UN | 3,80 | 152,00 |',
'| ART00159 | Tuyau CPVC 1 po | 200 | PI | 1,33 | 266,00 |',
'|  | SOUS-TOTAL |  |  |  | 418,00 |'
].join('\n');

test('supplier confirmation safely extracts coded material rows without totals',()=>{
 const found=extractSupplierTableLines(flocorOrder,{kind:'order'});
 assert.equal(found.table_count,1);
 assert.equal(found.items.length,2);
 assert.deepEqual(found.items.map(x=>x.quantity),[40,200]);
 assert.equal(found.items[0].item_code,'ART00429');
 assert.equal(found.items[0].unit_cost,3.80);
 assert.equal(found.items[0].amount,152);
 assert.equal(found.items[0].is_complete,true);
 assert.equal(found.items[0].requires_review,true);
 assert.equal(found.warnings.length,0);
});

test('supplier delivery ordered, shipped and BO stay three different quantities',()=>{
 const markdown=[
 '| Code client | Description | Ordered | Shipped | B/O |',
 '| --- | --- | ---: | ---: | ---: |',
 '| ART00429 | Té CPVC | 100 | 75 | 25 |',
 '| ART00533 | Coude CPVC | 80 | 80 | 0 |',
 ].join('\n');
 const found=extractSupplierTableLines(markdown,{kind:'delivery'});
 assert.equal(found.items.length,2);
 assert.deepEqual(found.items.map(x=>[x.ordered_qty,x.shipped_qty,x.supplier_bo_qty]),
   [[100,75,25],[80,80,0]]);
 assert.equal(found.items[0].requires_review,true);
});

test('ambiguous grouping, empty cells, and missing price do not imply certain amounts',()=>{
 assert.equal(safeSupplierNumber('1,000'),null);
 assert.equal(safeSupplierNumber('1,000.00'),1000);
 assert.equal(safeSupplierNumber('1 000,00'),1000);
 const markdown=[
 '| Code | Description | Qty | Unit | Unit Price | Amount |',
 '| --- | --- | --- | --- | --- | --- |',
 '| ART00599 | Té 2 po | 1,000 | UN | 4.00 | 4,000.00 |',
 '| ART00429 | Coude | 4 | UN | | 16.00 |',
 ].join('\n');
 const found=extractSupplierTableLines(markdown);
 assert.equal(found.items.length,2);
 assert.equal(found.items[0].quantity,null);
 assert.equal(found.items[0].is_complete,false);
 assert.equal(found.items[1].is_complete,false);
 assert.ok(found.warnings.some(w=>w.includes('manquent')));
});

test('line math mismatch is flagged, never overwritten with a computed number',()=>{
 const md=[
 '| Code | Description | Qty | Unit | Unit Price | Amount |',
 '| --- | --- | --- | --- | --- | --- |',
 '| ART00429 | Té CPVC | 4 | UN | 3,80 | 15,00 |'
 ].join('\n');
 const found=extractSupplierTableLines(md);
 assert.equal(found.items[0].amount,15);
 assert.equal(found.items[0].arithmetic_warning,true);
 assert.ok(found.warnings.some(w=>w.includes('quantité')));
});

test('unstructured prose and totals alone cannot generate fabricated order rows',()=>{
 assert.equal(extractSupplierTableLines('Té CPVC 40 pièces à 3.80, Total 152 CAD').items.length,0);
 assert.equal(extractSupplierTableLines('PO P02281 | Qty 200 | BON DE LIVRAISON').items.length,0);
 assert.throws(()=>extractSupplierTableLines('x',{kind:'invoice'}),/invalide/);
});

test('incomplete images with table headings still preserve review instead of assumption',()=>{
 const md=[
 '| ITEM CODE | DESCRIPTION | ORDERED | SHIPPED | B/O |',
 '| --- | --- | --- | --- | --- |',
 '| ART00429 | Té | 200 | ??? | ? |'
 ].join('\n');
 const found=extractSupplierTableLines(md,{kind:'delivery'});
 assert.equal(found.items.length,1);
 assert.equal(found.items[0].shipped_qty,null);
 assert.equal(found.items[0].is_complete,false);
});

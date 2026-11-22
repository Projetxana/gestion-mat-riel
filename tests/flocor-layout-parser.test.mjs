import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFlocorHeader,extractFlocorLayoutLines} from '../src/utils/flocorLayoutParser.js';
import {extractDocumentHints} from '../src/utils/purchaseDocumentText.js';
import {safeSupplierNumber} from '../src/utils/purchaseDocumentLines.js';

// Fictional fixture based on the column layout of a 3-page supplier example.
// No customer address, phone number, tax ID or identifying order record.
const layout=[
'COMMANDE DE VTE',
'CONFIRMATION',
'',
'No. COMMANDE DU CLIENT           NOM DU PROJET          NUMERO',
'CUSTOMER P.O. NUMBER.             JOB NAME              NUMBER    REP.',
'',
'P02330                                  Chantier Démo A                     89        106        NTR CAMION',
'LIGNE   No PROD. / PROD. NO     QUANTITÉ / QUANTITY            PRIX UNITAIRE',
'LINE    CODE EMPL. / LOC. BIN   DESCRIPTION    U/M    CMDÉE/ORD.  EXP./SHIP EN SOUFF. B/O',
'',
'019     ADBLZ105RS2               ADAPT TÊTE GICLEUR FEM                      UN       50.00        50.00          .00           3.5500                             177.50',
'        No Item Client..          ART00540',
'002     PBLZ1                     TUYAU 1" X 15\' PVCC                         FT      720.00       720.00          .00           1.3300                             957.60',
'                                  BLAZEMASTER',
'        No Item Client..          ART00159',
'001     G1460310                  TIGE FILETÉ 3/8" X 10\'                      FT      200.00       200.00          .00             .3200                              64.00',
].join('\n');
test('realistic Flocor text-layout columns create complete order drafts',()=>{
 const out=extractFlocorLayoutLines(layout,{kind:'order'});
 assert.equal(out.matched_format,true);
 assert.equal(out.items.length,3);
 assert.equal(out.items[0].item_code,'ART00540');
 assert.equal(out.items[0].quantity,50);
 assert.equal(out.items[1].item_code,'ART00159');
 assert.equal(out.items[2].unit_cost,0.32);
 assert.equal(out.items[2].amount,64);
 assert.equal(out.items[2].arithmetic_warning,false);
});
test('Flocor text-layout PO and job name are read but never treated as verified',()=>{
 const header=extractFlocorHeader(layout);
 assert.deepEqual(header,{po_number:'P02330',shipping_project_name:'Chantier Démo A'});
 const hints=extractDocumentHints(layout,'order');
 assert.equal(hints.po_number,'P02330');
 assert.equal(hints.shipping_project_name,'Chantier Démo A');
 assert.equal(hints.suggested_lines.length,3);
 assert.equal(hints.requires_review,true);
});
test('delivery adapter uses shipped and explicit B/O, never ordered as received',()=>{
 const changed=layout.replace('50.00        50.00          .00','50.00        30.00         20.00');
 const out=extractFlocorLayoutLines(changed,{kind:'delivery'});
 assert.equal(out.items[0].ordered_qty,50);
 assert.equal(out.items[0].shipped_qty,30);
 assert.equal(out.items[0].supplier_bo_qty,20);
});
test('Flocor partial shipment net amount is flagged for review before cost commitment',()=>{
 const changed=layout.replace('50.00        50.00          .00           3.5500                             177.50',
 '50.00        30.00         20.00           3.5500                             106.50');
 const out=extractFlocorLayoutLines(changed,{kind:'order'});
 assert.equal(out.items[0].arithmetic_warning,true);
 assert.equal(out.items[0].amount,106.50);
 assert.ok(out.warnings.some(x=>x.includes('BO exclu')));
});
test('source without Flocor header is not parsed as a Flocor order',()=>{
 assert.equal(extractFlocorLayoutLines('P02330\nART00429 100 UN').matched_format,false);
 assert.equal(safeSupplierNumber('.00'),0);
 assert.equal(safeSupplierNumber('.3200'),0.32);
});

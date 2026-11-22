import test from 'node:test';
import assert from 'node:assert/strict';
import {extractCdEstimateHeader,extractCdEstimateLines} from '../src/utils/cdEstimateLayoutParser.js';

const estimate=[
'2026-056 Chantier Démo B [ MULTI-SCÉNARIO ]                           Page 1 de 6',
'Description                                   Quantité       Prix      Esc%   Coût net          Matériel',
'BOULONNERIE ET ANCRAGES BÉTON',
'CD 00402 ANCRAGE A BETON KH-EZ-I 3/8"                  6474 UN      159,56 / CT     0      159,56 / CT          10 329,91',
'CD 01161 BOLT BOULON ZINC                                16 UN        1,19 / UN     0        1,19 / UN              19,04',
'LOCATION D EQUIPEMENTS',
'CD 01635 LIFT LOCATION                                   1 SM      310,00 / SM     0      310,00 / SM             310,00',
'PRIX FIXE',
'CD 00000 PRIX FIXE TEL QUE SOUMIS                       -1 UN   100 000,00 / UN     0   100 000,00 / UN     -100 000,00',
].join('\n');
test('CD estimation header proposes project name without pretending to verify',()=>{
 assert.deepEqual(extractCdEstimateHeader(estimate),{shipping_project_name:'Chantier Démo B'});
 assert.equal(extractCdEstimateHeader('unrelated PDF'),null);
});
test('unit price per CT is converted for review using row amount divided by units',()=>{
 const found=extractCdEstimateLines(estimate);
 assert.equal(found.matched_format,true);
 assert.equal(found.items[0].item_code,'CD 00402');
 assert.equal(found.items[0].quantity,6474);
 assert.equal(found.items[0].unit,'UN');
 assert.equal(found.items[0].source_price_unit,'CT');
 assert.equal(found.items[0].unit_cost,1.5956);
 assert.equal(found.items[0].amount,10329.91);
 assert.equal(found.items[0].included,true);
 assert.ok(found.warnings.some(w=>w.includes('CT')));
});
test('rentals and fixed-price negatives never silently enter material budget',()=>{
 const found=extractCdEstimateLines(estimate);
 const rental=found.items.find(x=>x.description.includes('LIFT'));
 assert.equal(rental.included,false);
 assert.equal(found.items.some(x=>x.description.includes('PRIX FIXE')),false);
 assert.ok(found.warnings.some(w=>w.includes('hors achats')));
});
test('draft cannot be inferred from a standalone supplier confirmation',()=>{
 assert.equal(extractCdEstimateLines('P02330 DJ4 S.E.C.').matched_format,false);
});

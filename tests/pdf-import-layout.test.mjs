import test from 'node:test';
import assert from 'node:assert/strict';
import {rebuildPdfPageLayout} from '../src/utils/pdfTextLayout.js';

test('out-of-order positioned text becomes a stable invoice-like row',()=>{
 const txt=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
 const result=rebuildPdfPageLayout([
   txt('75.00',380,500),txt('UN',320,500),txt('019',45,500),
   txt('ADBLZ105RS2',105,500),txt('50.00',340,500),
   txt('ADAPT TÊTE',195,500),txt('COMMANDE DE VTE',90,740)
 ]);
 const lines=result.split('\n');
 assert.equal(lines.length,2);
 assert.match(lines[0],/COMMANDE DE VTE/);
 assert.match(lines[1],/019\s{2,}ADBLZ105RS2\s{2,}ADAPT TÊTE\s{2,}UN\s+50\.00\s+75\.00/);
});
test('empty glyph runs are ignored and adjacent rows cannot be combined',()=>{
 const txt=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
 const result=rebuildPdfPageLayout([txt('Té CPVC',120,470),txt('',140,470),
 txt('ART00429',30,470),txt('ART00159',30,450)]);
 assert.equal(result.split('\n').length,2);
 assert.match(result,/ART00429/);
 assert.match(result,/ART00159/);
});

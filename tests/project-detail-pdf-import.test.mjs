import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';

const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('the project overview opens separate detail windows and returns via X',()=>{
 const source=read('components/ProjectMonitoringModal.jsx');
 const modal=read('components/ProjectDetailModal.jsx');
 assert.match(source,/ProjectDetailModal/);
 assert.match(source,/detailView !== 'overview'/);
 assert.match(source,/onClose=\{closeDetail\}/);
 assert.match(source,/SitePerformancePanel site=\{selectedSite\}/);
 assert.match(source,/PurchaseBudgetPanel site=\{selectedSite\}/);
 assert.doesNotMatch(source,/\{detailView==='ipmo' && \(/);
 assert.match(modal,/role="dialog"/);
 assert.match(modal,/aria-modal="true"/);
 assert.match(modal,/<X size=\{23\}/);
 assert.match(modal,/event\.key === 'Escape'/);
 assert.match(modal,/restoreFocusRef/);
 assert.ok(transformSync(source,{loader:'jsx'}).code.length>100);
 assert.ok(transformSync(modal,{loader:'jsx'}).code.length>100);
});
test('both tabs provide a PDF import and still preserve Excel/CSV fallback',()=>{
 const panel=read('components/PurchaseBudgetPanel.jsx');
 assert.match(panel,/Importer le budget PDF automatiquement/);
 assert.match(panel,/Importer une confirmation PDF automatiquement/);
 assert.match(panel,/importDigitalPdf\(event\.target\.files\?\.\[0\],'budget'\)/);
 assert.match(panel,/importDigitalPdf\(event\.target\.files\?\.\[0\],'order'\)/);
 assert.match(panel,/assessDigitalPdf/);
 assert.match(panel,/bt_purchase_import_budget/);
 assert.match(panel,/bt_purchase_create_order/);
 assert.match(panel,/setPdfIssues/);
 assert.ok(panel.includes('Excel / CSV'));
 assert.ok(transformSync(panel,{loader:'jsx'}).code.length>100);
});
test('PDF text extraction stays in a local bundled worker, never external OCR',()=>{
 const reader=read('utils/digitalPdfReader.js');
 assert.match(reader,/pdfjs-dist\/build\/pdf\.mjs/);
 assert.match(reader,/pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url/);
 assert.match(reader,/sha256/);
 assert.doesNotMatch(reader,/https?:\/\//);
 assert.doesNotMatch(reader,/fetch\(/);
});

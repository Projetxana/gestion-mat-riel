import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

import {
  getPhotoExtension, photoResolutionWarning,
  MAX_REPORT_PHOTO_BYTES
} from '../src/utils/dailyReportMedia.js';

const read = path => readFileSync(new URL(path, import.meta.url),'utf8');
const dashboard = read('../src/pages/Dashboard.jsx');
const delivery = read('../src/components/DeliveryNoteModal.jsx');
const daily = read('../src/components/DailyReportModal.jsx');
const media = read('../src/utils/dailyReportMedia.js');

test('home Caméra launches the real delivery note scanner, not DailyReport', () => {
  assert.match(dashboard, /import DeliveryNoteModal from ['"]\.\.\/components\/DeliveryNoteModal['"]/);
  assert.match(dashboard, /import DailyReportModal from ['"]\.\.\/components\/DailyReportModal['"]/);
  assert.match(dashboard, /\{showCamera && <DeliveryNoteModal/);
  assert.match(dashboard, /\{showDailyReport && <DailyReportModal/);
});

test('delivery note capture uses native still photography, not low-res video frames', () => {
  assert.match(delivery, /<Camera size=\{22\} \/> Prendre une photo/);
  assert.match(delivery, /type="file" accept="image\/\*" capture="environment"/);
  assert.match(delivery, /Array\.from\(event\.target\.files \|\| \[\]\)/);
  assert.match(delivery, /void addPhotos\(files, true\)/);
  assert.match(delivery, /prepareReportPhoto/);
  assert.doesNotMatch(delivery, /getUserMedia|video\.videoWidth|<video|canvas\.toBlob/);
  assert.match(media, /blob: file/);
  assert.match(media, /const width = image\.naturalWidth/);
});

test('camera still automatically opens in a full screen portal with a clear zoom UI', () => {
  assert.match(delivery, /if \(showImmediately\) openPreview\(firstNewIndex\)/);
  assert.match(delivery, /\{previewPhoto && createPortal\(/);
  assert.match(delivery, /fixed inset-0 z-\[9999\]/);
  assert.match(delivery, /Aperçu grand format de \$\{documentMode\.previewLabel\}/);
  assert.match(delivery, /Math\.min\(4, z \+ 0\.5\)/);
  assert.match(delivery, /Voir en grand/);
  assert.match(delivery, /Conserver la photo/);
  assert.match(delivery, /retakePhoto/);
  assert.match(delivery, /Supprimer/);
});

test('sending requires reviewing photos and explicit confirmation', () => {
  assert.match(delivery, /onClick=\{openReview\}/);
  assert.match(delivery, /Vérifier les photos et envoyer/);
  assert.match(delivery, /onClick=\{handleSend\}/);
  assert.match(delivery, /if \(!reviewOpen \|\| previewIndex !== null \|\| busy \|\| !photos\.length\) return/);
  assert.match(delivery, /Confirmer l’envoi/);
  assert.match(delivery, /Vérifier avant l'envoi/);
  assert.doesNotMatch(delivery, /onClick=\{handleSend\}[^]+?Shutter Button/);
});

test('delivery attachments preserve the image bytes, MIME and Atoom recipient', () => {
  assert.match(delivery, /recipient: DELIVERY_RECIPIENT/);
  assert.match(delivery, /const DELIVERY_RECIPIENT = 'materiaux@cd\.atoomerp\.com'/);
  assert.match(delivery, /\.upload\(filename, photo\.blob, \{ contentType: mime, upsert: false \}\)/);
  assert.match(delivery, /getPhotoExtension\(mime\)/);
  assert.match(delivery, /send-email/);
  assert.equal(getPhotoExtension('image/jpeg'),'jpg');
  assert.equal(getPhotoExtension('image/png'),'png');
  assert.equal(MAX_REPORT_PHOTO_BYTES,16*1024*1024);
  assert.equal(photoResolutionWarning(4000,3000),'');
  assert.match(photoResolutionWarning(800,600),/Résolution faible/);
});

test('invoice module shares full resolution camera with a distinct invoice email', () => {
  const invoice=read('../src/components/InvoiceModal.jsx');
  assert.match(dashboard, /import InvoiceModal from ['"]\.\.\/components\/InvoiceModal['"]/);
  assert.match(dashboard, /\{showInvoiceModal && <InvoiceModal/);
  assert.match(invoice, /<DeliveryNoteModal onClose=\{onClose\} mode="invoice"/);
  assert.doesNotMatch(invoice, /getUserMedia|video\.videoWidth|canvas\.toBlob|<video/);

  // The default camera must still be the delivery-note workflow.
  assert.match(delivery, /mode = 'delivery'/);
  assert.match(delivery, /invoice: \{/);
  assert.match(delivery, /title: 'Scanner factures'/);
  assert.match(delivery, /prefix: 'facture'/);
  assert.match(delivery, /subject: 'Factures'/);
  assert.match(delivery, /emailHeading: 'Nouvelles Factures'/);
  assert.match(delivery, /subject: \x60\$\{documentMode\.subject\}/);
  assert.match(delivery, /const filename = \x60\$\{documentMode\.prefix\}_/);
  assert.match(delivery, /recipient: DELIVERY_RECIPIENT/);
  assert.match(delivery, /fixed inset-0 z-\[9999\]/);
  assert.match(delivery, /Confirmer l’envoi/);
  assert.match(delivery, /\.upload\(filename, photo\.blob, \{ contentType: mime, upsert: false \}\)/);
  assert.ok(transformSync(invoice,{loader:'jsx'}).code.length>100);
});

test('the daily report mail also retains a defined photo count', () => {
  const send=daily.slice(daily.indexOf('const handleSend = async'));
  assert.match(send,/const totalPhotos = sections\.reduce\(/);
  assert.match(daily,/\{photoPreview && currentPreviewPhoto && createPortal\(/);
  assert.match(daily,/fixed inset-0 z-\[9999\]/);
  assert.match(daily,/Voir en grand/);
  assert.match(send,/processedCount \/ totalPhotos/);
  assert.ok(transformSync(daily,{loader:'jsx'}).code.length>100);
});

test('delivery JSX transpiles and the normal dashboard keeps both actions', () => {
  assert.ok(transformSync(delivery,{loader:'jsx'}).code.length>100);
  assert.ok(transformSync(dashboard,{loader:'jsx'}).code.length>100);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {
    getPhotoExtension,
    humanFileSize,
    photoResolutionWarning,
    MAX_REPORT_PHOTO_BYTES
} from '../src/utils/dailyReportMedia.js';

const panel = readFileSync(new URL('../src/components/DailyReportModal.jsx', import.meta.url), 'utf8');
const media = readFileSync(new URL('../src/utils/dailyReportMedia.js', import.meta.url), 'utf8');

test('native phone camera captures a true still image, not a low-resolution video frame', () => {
    assert.match(panel, /type="file" accept="image\/\*" capture="environment"/);
    assert.doesNotMatch(panel, /getUserMedia|video\.videoWidth|video\.videoHeight|<video/);
    assert.match(panel, /Array\.from\(e\.target\.files \|\| \[\]\)/);
    assert.match(panel, /prepareReportPhoto/);
    assert.match(panel, /addFilesToSection\(section\.id, files, true\)/);
    assert.match(panel, /if \(previewImmediately\) showPhoto\(sectionId, firstNewIndex\)/);
    assert.match(media, /blob: file/);
    assert.match(media, /width: image\.naturalWidth|const width = image\.naturalWidth/);
    assert.match(media, /'image\/jpeg', 0\.96/);
    assert.match(media, /Safari may supply HEIC\/HEIF/);
});

test('photos are shown full size with dimensions, zoom, retake and delete', () => {
    assert.match(panel, /Vérifier la netteté de la photo/);
    assert.match(panel, /currentPreviewPhoto\.width/);
    assert.match(panel, /currentPreviewPhoto\.height/);
    assert.match(panel, /setPhotoZoom\(z => Math\.min\(3/);
    assert.match(panel, /replacePreviewPhoto/);
    assert.match(panel, /removePhotoFromSection/);
    assert.match(panel, /Photo vérifiée/);
    assert.match(panel, /showPhoto\(section\.id, pIndex\)/);
});

test('a report cannot be sent without opening its confirmation screen', () => {
    assert.match(panel, /onClick=\{openSendReview\}/);
    assert.match(panel, /Vérifier les photos et envoyer/);
    assert.match(panel, /if \(!showSendReview \|\| isUploading \|\| !validateReport\(\)\) return;/);
    assert.match(panel, /Vérifier avant d’envoyer/);
    assert.match(panel, /Confirmer l’envoi/);
    assert.match(panel, /Destinataire/);
    assert.match(panel, /onClick=\{handleSend\}/);
});

test('reviewed photo bytes are uploaded directly with their actual MIME and extension', () => {
    assert.match(panel, /\.upload\(photoStoragePath, photo\.blob/);
    assert.match(panel, /contentType: photo\.mimeType/);
    assert.match(panel, /getPhotoExtension\(photo\.mimeType/);
    assert.doesNotMatch(panel, /\.upload\(fileName, blob\)/);
    assert.match(media, /if \(jpeg \|\| png\) \{/);
    assert.match(media, /blob: file/);
    assert.equal(getPhotoExtension('image/jpeg'), 'jpg');
    assert.equal(getPhotoExtension('image/png'), 'png');
    assert.equal(getPhotoExtension('image/webp'), 'webp');
});

test('a 2x resolution report cover is sent independently from original photos', () => {
    assert.match(panel, /const pixelScale = 2/);
    assert.match(panel, /canvas\.width = width \* pixelScale/);
    assert.match(panel, /'image\/jpeg', 0\.96/);
    assert.match(panel, /docStoragePath/);
    assert.match(panel, /photoStoragePath/);
    assert.doesNotMatch(panel, /Généré par Antigravity/);
});

test('photo readability and filesize helpers give actionable warnings', () => {
    assert.equal(MAX_REPORT_PHOTO_BYTES, 16 * 1024 * 1024);
    assert.equal(photoResolutionWarning(4032, 3024), '');
    assert.match(photoResolutionWarning(640, 480), /Résolution faible/);
    assert.equal(humanFileSize(2 * 1024 * 1024), '2.0 Mo');
});

test('report JSX compiles and keeps the established mail workflow', () => {
    assert.ok(transformSync(panel, {loader:'jsx'}).code.length > 100);
    assert.match(panel, /supabase\.storage/);
    assert.match(panel, /\/functions\/v1\/send-email/);
    assert.match(panel, /setUploadProgress/);
    assert.match(panel, /addLog/);
});

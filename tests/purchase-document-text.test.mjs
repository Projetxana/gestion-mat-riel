import test from 'node:test';
import assert from 'node:assert/strict';
import {
 extractDocumentHints,getDocumentSiteStatus,inboundAliasToken,
 allowedDocumentMime,isAuthenticatedCloudflareMail,
} from '../src/utils/purchaseDocumentText.js';

test('Flocor label fields yield PO and shipping project as draft only',()=>{
 const doc='FOURNISSEUR: FLOCOR\nCustomer PO#: P02281\nJob Name: DJ4 S.E.C.\n' +
 'Supplier Order Number: 7252931\nOrdered Shipped B/O\nCAP 2: 4 4 0';
 const hints=extractDocumentHints(doc,'order');
 assert.equal(hints.po_number,'P02281');
 assert.equal(hints.shipping_project_name,'DJ4 S.E.C.');
 assert.equal(hints.supplier_order_number,'7252931');
 assert.equal(hints.requires_review,true);
 assert.equal(hints.has_quantity_columns,true);
 assert.equal(getDocumentSiteStatus(hints,{name:'DJ4 S.E.C.'}),'candidate');
 assert.equal(getDocumentSiteStatus(hints,{name:'Orélis Jarry'}),'review');
});
test('incomplete scan yields review not guessed values',()=>{
 const hints=extractDocumentHints('Quelques chiffres 1234 et produits\nTé CPVC', 'delivery');
 assert.equal(hints.po_number,'');
 assert.equal(hints.shipping_project_name,'');
 assert.equal(hints.requires_review,true);
 assert.equal(hints.warnings.length>=2,true);
});
test('inbox alias requires exact domain and unguessable token shape',()=>{
 const token='0123456789abcdef0123456789abcdef';
 assert.equal(inboundAliasToken('commandes+'+token+'@achats.buildtrackapp.ca','achats.buildtrackapp.ca'),token);
 assert.equal(inboundAliasToken('commandes+'+token+'@evil.example','achats.buildtrackapp.ca'),'');
 assert.equal(inboundAliasToken('commandes+1@achats.buildtrackapp.ca','achats.buildtrackapp.ca'),'');
 assert.equal(inboundAliasToken('commandes+'+token+'@achats.buildtrackapp.ca.evil.example','achats.buildtrackapp.ca'),'');
});
test('only PDF and supported raster photos, with matching extension/MIME',()=>{
 assert.equal(allowedDocumentMime('application/pdf','c.pdf'),true);
 assert.equal(allowedDocumentMime('image/jpeg','c.jpg'),true);
 assert.equal(allowedDocumentMime('image/png','c.pdf'),false);
 assert.equal(allowedDocumentMime('text/html','c.html'),false);
});
test('DMARC trust requires Cloudflare first authentication results',()=>{
 assert.equal(isAuthenticatedCloudflareMail('mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass'),true);
 assert.equal(isAuthenticatedCloudflareMail('attacker; dmarc=pass'),false);
 assert.equal(isAuthenticatedCloudflareMail('mx.cloudflare.net; dmarc=fail'),false);
});

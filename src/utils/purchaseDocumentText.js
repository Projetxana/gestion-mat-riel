// Conservative document cues extracted from Cloudflare Markdown conversion.
// These are *suggestions only*. No price or quantity may be committed without review.
import { normalizeToken } from './purchaseBudget.js';
import { extractSupplierTableLines } from './purchaseDocumentLines.js';
import { extractFlocorHeader,extractFlocorLayoutLines } from './flocorLayoutParser.js';
import {extractCdEstimateHeader,extractCdEstimateLines} from './cdEstimateLayoutParser.js';

const field = (text, names) => {
  for (const name of names) {
    // Keep candidate on the same line; never use DOTALL across page boundaries.
    const re = new RegExp('(?:^|\\n)\\s*(?:[#*|>\\-]\\s*)?(?:' + name + ')\\s*[:#\\-]\\s*([^\\n|]{2,140})', 'im');
    const match = text.match(re);
    if (match) return match[1].replace(/[*_#]/g, '').trim();
  }
  return '';
};
const clean = value => String(value ?? '').trim().replace(/[^\p{L}\p{N}\s.'#&+/-]/gu, '').slice(0, 140);

export const extractDocumentHints = (input, type = 'order') => {
  const text = String(input ?? '').replace(/\r\n?/g, '\n').slice(0, 120000);
  const flocorHeader = extractFlocorHeader(text);
  const estimateHeader = type==='budget'?extractCdEstimateHeader(text):null;
  const poNumber = clean(field(text, [
    'customer\\s*po\\s*(?:no\\.?|number|#)?',
    'no\\.?\\s*commande\\s*client',
    'n[o°]\\s*de\\s*po',
    'po\\s*client', 'purchase\\s*order',
    'p\\.?o\\.?\\s*(?:number|#|no\\.?)'
  ]) || flocorHeader?.po_number);
  const shippingProject = clean(field(text, [
    'job\\s*name', 'nom\\s*(?:du\\s*)?projet',
    'chantier\\s*(?:de\\s*livraison)?', 'ship\\s*to\\s*(?:project|job)',
    'adresse\\s*livraison', 'delivery\\s*address',
  ]) || flocorHeader?.shipping_project_name || estimateHeader?.shipping_project_name);
  const supplierOrder = clean(field(text, [
    'supplier\\s*order\\s*(?:number|#|no\\.?)*',
    'commande\\s*fournisseur',
    'order\\s*confirmation\\s*(?:number|#|no\\.?)'
  ]));
  // Candidate quantities/prices come only from recognized tables and ALWAYS require review.
  let lineSuggestions = type==='budget'
      ? extractCdEstimateLines(text)
      : extractSupplierTableLines(text, { kind: type === 'delivery' ? 'delivery' : 'order' });
  if(type!=='budget' && !lineSuggestions.items.length){
    const flocor=extractFlocorLayoutLines(text,{kind:type === 'delivery' ? 'delivery' : 'order'});
    if(flocor.matched_format)lineSuggestions={
      items:flocor.items, warnings:flocor.warnings,
    };
  }
  const numbers = text.match(/(?:B\/O|back.?order|en souffrance|ordered|shipped|expédiée|commandée)/ig) || [];
  return {
    type: ['budget','delivery'].includes(type) ? type : 'order',
    po_number: poNumber,
    shipping_project_name: shippingProject,
    supplier_order_number: supplierOrder,
    has_quantity_columns: numbers.length >= 2,
    suggested_lines: lineSuggestions.items,
    suggested_line_count: lineSuggestions.items.length,
    line_warnings: lineSuggestions.warnings,
    requires_review: true,
    warnings: [
      ...(!poNumber && type !== 'budget' ? ['Numéro de PO non identifié'] : []),
      ...(!shippingProject ? ['Nom de chantier de livraison non identifié'] : []),
      ...lineSuggestions.warnings,
      'Comparer les articles et les quantités au document original avant validation',
    ],
    text_excerpt: text.slice(0, 8000),
  };
};

export const getDocumentSiteStatus = (hints, site) => {
  const actual = normalizeToken(hints?.shipping_project_name);
  const expected = normalizeToken(site?.name);
  return actual.length >= 3 && expected.length >= 3 && actual === expected
    ? 'candidate' : 'review';
};

export const inboundAliasToken = (recipient, domain) => {
  const to = String(recipient || '').trim().toLowerCase();
  const expected = String(domain || '').trim().toLowerCase();
  if (!expected || !to.endsWith('@' + expected)) return '';
  const local = to.slice(0, -1 - expected.length);
  const match = /^commandes\+([0-9a-f]{32})$/.exec(local);
  return match ? match[1] : '';
};

export const allowedDocumentMime = (mime, filename) => {
  const ext = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (mime === 'application/pdf' && ext === 'pdf') ||
    (mime === 'image/jpeg' && ['jpg', 'jpeg'].includes(ext)) ||
    (mime === 'image/png' && ext === 'png') ||
    (mime === 'image/webp' && ext === 'webp');
};

export const isAuthenticatedCloudflareMail = header => {
  const line = String(header || '').trim().split(/\r?\n/, 1)[0];
  return /^mx\.cloudflare\.net\s*;/i.test(line) && /\bdmarc\s*=\s*pass\b/i.test(line);
};

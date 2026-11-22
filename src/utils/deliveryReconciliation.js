import { normalizePurchaseOrder, normalizeToken, normalizeCatalogCode } from './purchaseBudget.js';

// A PO is an order identifier, not proof of the shipping project.
export const matchDeliveryToOrder = ({ poNumber, supplier, companyId, siteId }, orders = []) => {
    const po = normalizePurchaseOrder(poNumber);
    if (!po || !companyId || !siteId) return { status: 'review', order: null };
    const candidates = orders.filter(order =>
        String(order.company_id) === String(companyId) &&
        String(order.site_id) === String(siteId) &&
        normalizePurchaseOrder(order.po_number) === po
    );
    const supplierKey = normalizeToken(supplier);
    const filtered = supplierKey
        ? candidates.filter(order => normalizeToken(order.supplier) === supplierKey)
        : candidates;
    return filtered.length === 1
        ? { status: 'matched', order: filtered[0] }
        : { status: 'review', order: null };
};

export const summarizeDeliveries = (orderLines = [], notes = [], deliveryLines = []) => {
    const verifiedById = new Map(notes
        .filter(note => note.status === 'verified' && note.order_id && note.verified_at)
        .map(note => [String(note.id), note]));
    const results = orderLines.map(line => {
        const records = deliveryLines.filter(entry =>
            String(entry.order_line_id) === String(line.id) &&
            String(entry.order_id) === String(line.order_id) &&
            verifiedById.has(String(entry.delivery_id))
        );
        const receivedQty = records.reduce((total, item) => total + Number(item.shipped_qty || 0), 0);
        const quantity = Number(line.quantity || 0);
        const remainingQty = Math.max(0, quantity - receivedQty);
        const latest = [...records].sort((a, b) =>
            Date.parse(verifiedById.get(String(b.delivery_id)).verified_at) -
            Date.parse(verifiedById.get(String(a.delivery_id)).verified_at))[0];
        const supplierBoQty = latest?.supplier_bo_qty == null ? null : Number(latest.supplier_bo_qty);
        return {
            orderLineId: line.id,
            orderId: line.order_id,
            itemCode: line.item_code,
            name: line.description,
            unit: line.unit,
            orderedQty: quantity,
            receivedQty,
            remainingQty,
            supplierBoQty,
            status: receivedQty > quantity ? 'over_delivery'
                : remainingQty === 0 ? 'complete'
                : supplierBoQty > 0 ? 'supplier_bo'
                : 'remaining',
        };
    });
    return results;
};

// Adapter for a reviewed Flocor row: no price fields, never a financial entry.
export const deliveryReviewPayload = rows => {
    if (!Array.isArray(rows) || !rows.length || rows.length > 500) {
        throw new Error('Sélectionnez 1 à 500 lignes du bon de livraison.');
    }
    const seen = new Set();
    return rows.map(row => {
        const key = String(row.order_line_id);
        const shipped = Number(row.shipped_qty);
        const supplierBo = row.supplier_bo_qty == null || row.supplier_bo_qty === ''
            ? null : Number(row.supplier_bo_qty);
        if (!/^\d+$/.test(key) || seen.has(key) ||
            !Number.isFinite(shipped) || shipped < 0 || Math.round(shipped * 1000) !== shipped * 1000 ||
            (supplierBo !== null && (!Number.isFinite(supplierBo) || supplierBo < 0 ||
            Math.round(supplierBo * 1000) !== supplierBo * 1000)) ||
            !(shipped > 0 || supplierBo > 0)) {
            throw new Error('Une ligne de livraison est invalide ou présente en double.');
        }
        seen.add(key);
        return { order_line_id: Number(key), shipped_qty: shipped, supplier_bo_qty: supplierBo };
    });
};

export const matchingDeliveryItemCodes = (supplierCode, clientCode) =>
    Boolean(normalizeCatalogCode(clientCode)) &&
    normalizeCatalogCode(supplierCode) === normalizeCatalogCode(clientCode);

// The fingerprint deduplicates identical image bytes, not two different photos
// of the same paper; the latter must be flagged by manual review.
export const fingerprintDeliveryPhotos = async (photos, cryptoApi = globalThis.crypto) => {
    if (!cryptoApi?.subtle || !Array.isArray(photos) || !photos.length) {
        throw new Error('Impossible de sécuriser cette soumission. Réessayez dans Safari.');
    }
    const hashes = [];
    for (const photo of photos) {
        const blob = photo?.blob || photo;
        if (!blob?.arrayBuffer) throw new Error('Image de livraison invalide.');
        const bytes = await blob.arrayBuffer();
        const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
        hashes.push(Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''));
    }
    const combined = new TextEncoder().encode(hashes.join(':'));
    const digest = await cryptoApi.subtle.digest('SHA-256', combined);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
};

import { parseDecimal } from './purchaseBudget.js';

export function groupPurchaseDocuments(orders, lines) {
    const totals = new Map();
    for (const line of lines) {
        const id = String(line.order_id);
        totals.set(id, (totals.get(id) || 0) + Math.round(Number(line.amount) * 100));
    }
    const groups = new Map();
    for (const order of orders) {
        const key = JSON.stringify([order.supplier.trim().toLowerCase(), order.po_number.replace(/\s+/g, '').toUpperCase()]);
        if (!groups.has(key)) {
            groups.set(key, { key, supplier: order.supplier, po_number: order.po_number, documents: [], total: 0 });
        }
        const group = groups.get(key);
        group.documents.push(order);
        group.total += totals.get(String(order.id)) || 0;
    }
    return [...groups.values()].map(group => ({ ...group, total: group.total / 100 }));
}

const parseCreditNumber = value => {
    const raw = String(value ?? '').trim();
    const signed = raw.endsWith('-') ? '-' + raw.slice(0, -1) : raw;
    return parseDecimal(signed.replace(/^(-?)([.,])/, (_, sign, separator) => sign + '0' + separator));
};

export const isPurchaseCredit = text =>
    /^\s*(?:note\s+de\s+cr[ée]dit|avoir|credit\s+(?:note|memo))\b/im.test(String(text || '').slice(0, 2000));

export function extractFlocorCredit(text) {
    const source = String(text || '');
    if (!isPurchaseCredit(source) || !/\bFLOCOR\b/i.test(source.slice(0, 3000))) return null;

    const reference = source.match(/NOTE[ \t]+DE[ \t]+CR[ÉE]DIT\s+CONFIRMATION\s+(\d{5,})\b/i)?.[1] || '';
    const header = source.match(/^[ \t]*(P\d{4,})[ \t]{2,}(.+?)[ \t]{2,}\d{1,3}[ \t]+\d{1,3}[ \t]+(\d{5,})\b/im);
    const rows = [];
    let anchors = 0;
    for (const line of source.split(/\r?\n/)) {
        if (/^\s*\d{3}\s+\S+\s+/.test(line)) anchors += 1;
        const match = line.match(/^\s*\d{3}\s+(\S+)\s+(.+?)\s+(UN|FT|PI|EA|PC)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,]+)(?:\s+([\d.,]+%?))?\s+([\d.,-]+)\s*$/i);
        if (!match) continue;
        const quantity = parseCreditNumber(match[4]);
        const shipped = parseCreditNumber(match[5]);
        const pending = parseCreditNumber(match[6]);
        const unit_cost = parseCreditNumber(match[7]);
        const amount = parseCreditNumber(match[9]);
        if (quantity >= 0 || quantity !== shipped || pending !== 0 || unit_cost < 0 || amount >= 0 ||
            !Number.isFinite(unit_cost) || !Number.isFinite(amount) ||
            Math.abs(Math.round(quantity * unit_cost * 100) - Math.round(amount * 100)) > 2) continue;
        rows.push({ item_code: match[1], description: match[2], unit: match[3], quantity, unit_cost, amount });
    }

    const total = parseCreditNumber(source.match(/Sous-total\s*\/\s*Sub-Total[ \t]+([\d.,-]+)/i)?.[1]);
    const complete = Boolean(reference && header && rows.length && anchors === rows.length &&
        Number.isFinite(total) && Math.round(total * 100) === rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0));
    return {
        reference,
        po_number: header?.[1] || '',
        shipping_project_name: header?.[2] || '',
        original_supplier_order_number: header?.[3] || '',
        rows, total, complete,
    };
}

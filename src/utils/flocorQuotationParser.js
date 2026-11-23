// Flocor QUOTATION / SOUMISSION, not a purchase-order confirmation.
// Values are proposals for a budget revision and must never auto-create orders.
import { safeSupplierNumber } from './purchaseDocumentLines.js';

const rowPattern = /^\s*(\d{2,4})\s+(\d+(?:[.,]\d{1,2})?)\s+(UN|FT|PI|EA|PC|LG|CT)\s+([A-Z0-9][A-Z0-9._/-]{1,49}),\s*(.+?)\s{2,}([\d,]*\d\.\d{4}|\.\d{4})\s{2,}([\d,]*\d\.\d{2}|\.\d{2})\s*$/i;
const rowAnchor = /^\s*\d{2,4}\s+\d+(?:[.,]\d+)?\s+(?:UN|FT|PI|EA|PC|LG|CT)\s+\S/i;
const nonItem = /^(?:TOTAL|CONTINUED|PRINTED ON|IMPRIM[ÉE]E LE|FLOCOR|QUOTATION|SOUMISSION|DESCRIPTION\b|SEQ\.|#\s*\d|SITE WEB|T[ÉE]L[ÉE]PHONE|FAX\b|DEBUT PROJET|D[ÉE]BUT PROJET|FIN DE PROJET|D[ÉE]LAI|PRIX NETS|PRIX SUJETS|FAB DORVAL|SOUS.TOTAL|SUB.TOTAL|GST|PST|TPS|TVQ|SIGNATURE|VALIDIT[ÉE]|PAGE\b|ACTIONS GOUVERNEMENTALES|RESPONSABLE|AUTRES FRAIS|OTHER FEES|SHIPPING|TRANSPORT)\b/i;
const moneyCents = value => Math.round(Number(value) * 100);

export const extractFlocorQuotationHeader = text => {
    const source = String(text || '').slice(0, 120000);
    if (!/\bFLOCOR\b/i.test(source.slice(0, 1500)) ||
        !/\bQUOTATION\b/i.test(source.slice(0, 1500)) ||
        !/\bSOUMISSION\b/i.test(source.slice(0, 1500))) return null;
    const project = source.match(/^\s*#\s*(\d{3,6})\s+(.+?)(?:\s{2,}.*)?$/m);
    if (!project) return null;
    const number = source.slice(0, 1600).match(/\b(20\d{5})\b/);
    const date = source.slice(0, 2000).match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
    return {
        quote_number: number?.[1] || '',
        quotation_date: date?.[0] || '',
        project_number: project[1],
        shipping_project_name: project[2].trim(),
    };
};

export const extractFlocorQuotationLines = (text, { maxLines = 500 } = {}) => {
    const source = String(text || '').slice(0, 120000);
    const header = extractFlocorQuotationHeader(source);
    if (!header) return { matched_format:false, items:[], warnings:[] };
    const items = [], warnings = [];
    let anchorCount = 0, invalidCount = 0, pageNumber = 0;
    for (const page of source.split('\f')) {
        pageNumber++;
        let last = null, continuations = 0;
        for (const line of page.split(/\r?\n/)) {
            const match = rowPattern.exec(line);
            if (rowAnchor.test(line)) anchorCount++;
            if (match) {
                const [,seq,rawQty,unit,item_code,rawDescription,rawPrice,rawAmount] = match;
                const quantity = safeSupplierNumber(rawQty);
                const unit_cost = safeSupplierNumber(rawPrice);
                const amount = safeSupplierNumber(rawAmount);
                const valid = quantity > 0 && unit_cost !== null && amount !== null;
                if (!valid) invalidCount++;
                if (items.length >= maxLines) {
                    warnings.push('Limite de lignes atteinte : contrôler le PDF intégral');
                    continue;
                }
                last = {
                    source_sequence:Number(seq), source_page:pageNumber,
                    item_code, description:rawDescription.trim(), quantity, unit,
                    unit_cost, amount, included:true, requires_review:true,
                    is_complete:valid,
                    arithmetic_warning:valid &&
                        Math.abs(moneyCents(quantity*unit_cost)-moneyCents(amount))>2,
                };
                items.push(last);
                continuations=0;
                continue;
            }
            const note = line.trim();
            if (!last || !note || nonItem.test(note)) {
                if (nonItem.test(note)) last=null;
                continue;
            }
            const alias = note.match(/^Alias\s*:\s*(ART\d+(?:\.\d+)?)\b/i);
            if (alias) {
                last.customer_alias=alias[1];
                last.description=(last.description+' (Alias '+alias[1]+')').slice(0,500);
                continue;
            }
            // Keep wrapped product specifications, never document terms/headers.
            if (continuations < 3 && note.length <= 95 &&
                !/^(?:QUANTIT[ÉE]|VENTES PR[ÉE]ALABLES|NOUS|LA COMMANDE|AVANT|LIVRAISON|DROITS|VIGUEUR|PR[ÉE]AVIS|IMPOS[ÉE]E|R[ÉE]VISER|FLOCOR|DECEMBRE|30 JOURS)/i.test(note) &&
                !/\b(?:SOUS.TOTAL|TOTAL\s*\+\s*TAXES)\b/i.test(note)) {
                last.description=(last.description+' '+note).slice(0,500);
                continuations++;
            }
        }
    }
    const subtotalBlock=source.match(/\bSub-total\s*\/[\s\S]{0,120}?([\d,]*\d\.\d{2})\b/i);
    const printed_material_total=subtotalBlock
        ? safeSupplierNumber(subtotalBlock[1]) : null;
    const sumCents=items.reduce((sum,row)=>sum+
        (Number.isFinite(Number(row.amount))?moneyCents(row.amount):0),0);
    if (!items.length) warnings.push('Aucune ligne de soumission reconnue');
    if (anchorCount!==items.length)
        warnings.push('Lignes de produits incomplètes : '+anchorCount+
            ' repères pour '+items.length+' articles reconnus');
    if (invalidCount || items.some(row=>row.arithmetic_warning))
        warnings.push('Certains prix, quantités ou montants ne concordent pas');
    if (printed_material_total===null)
        warnings.push('Sous-total du PDF non identifié');
    else if (Math.abs(sumCents-moneyCents(printed_material_total))>2)
        warnings.push('Somme des produits différente du sous-total imprimé');
    return {
        matched_format:true, items, warnings, source_line_count:anchorCount,
        printed_material_total, calculated_total:sumCents/100,
        quotation_header:header,
    };
};

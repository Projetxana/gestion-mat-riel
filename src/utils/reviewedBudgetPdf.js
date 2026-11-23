// Unrecognized PDF layouts are suggestions for human review, never auto-imports.
// A reviewed import remains local until an administrator explicitly confirms it.
import { normalizeToken, parseDecimal, parsePurchaseRows } from './purchaseBudget.js';
import { safeSupplierNumber } from './purchaseDocumentLines.js';

const cents = number => Math.round(Number(number) * 100);
const unitPattern = /^(UN|EA|PC|PCS|PI|FT|LG|CT|M|M2|M3|KG|L)$/i;
const ignored = /^(?:TOTAL|SOUS.TOTAL|SUB.TOTAL|TAXES|TPS|TVQ|GST|QST|TRANSPORT|FRAIS|LIVRAISON|PAGE|DATE|DESCRIPTION|ARTICLE|QUANTIT[ÉE]|PRIX)\b/i;

// Generic text-layout fallback. It is deliberately NOT a trusted supplier parser.
// Only obvious quantity / unit / unit price / amount columns are proposed.
export const extractGenericBudgetCandidates = (text, { maxLines = 500 } = {}) => {
    const items = [];
    const rows = String(text || '').slice(0, 200000).split(/\r?\n/);
    for (const source of rows) {
        const cells = source.trim().split(/\s{2,}/).filter(Boolean);
        if (cells.length < 4 || ignored.test(cells[0])) continue;
        const last = cells.length - 1;
        const amount = safeSupplierNumber(cells[last]);
        const unitCost = safeSupplierNumber(cells[last - 1]);
        if (amount === null || unitCost === null) continue;
        let unit = '';
        let quantity = null;
        let before = last - 2;
        if (unitPattern.test(cells[before] || '')) {
            unit = cells[before].toUpperCase();
            quantity = safeSupplierNumber(cells[before - 1]);
            before -= 2;
        } else if (/^([\d., ]+)\s+(UN|EA|PC|PCS|PI|FT|LG|CT|M|M2|M3|KG|L)$/i.test(cells[before] || '')) {
            const match = cells[before].match(/^([\d., ]+)\s+(UN|EA|PC|PCS|PI|FT|LG|CT|M|M2|M3|KG|L)$/i);
            quantity = safeSupplierNumber(match[1]);
            unit = match[2].toUpperCase();
            before -= 1;
        } else {
            quantity = safeSupplierNumber(cells[before]);
            unit = 'UN';
            before -= 1;
        }
        if (!(quantity > 0) || before < 0 || items.length >= maxLines) continue;
        const details = cells.slice(0, before + 1);
        const hasCode = details.length > 1 && /^[A-Z0-9][A-Z0-9_.\/-]{2,39}$/i.test(details[0]);
        const item_code = hasCode ? details.shift() : '';
        const description = details.join(' ').slice(0, 500);
        if (!description || ignored.test(description)) continue;
        items.push({
            item_code, description, quantity, unit, unit_cost: unitCost, amount,
            included: true, is_complete: true,
            arithmetic_warning: Math.abs(cents(quantity * unitCost) - cents(amount)) > 2,
            requires_review: true,
        });
    }
    return items;
};

export const prepareReviewedBudgetPdf = (parsed, site, text = '') => {
    const document = parsed?.document || {};
    if (!site?.id || site.status !== 'active' || !site.company_id ||
        !document.digital_text || !document.all_pages_processed ||
        !Number.isInteger(document.page_count) || document.page_count < 1 ||
        !/^[a-f0-9]{64}$/i.test(String(document.sha256 || ''))) {
        throw new Error('PDF non exploitable : fichier numérique complet et chantier actif requis.');
    }
    const suggested = Array.isArray(parsed?.hints?.suggested_lines)
        ? parsed.hints.suggested_lines : [];
    const candidates = suggested.length ? suggested : extractGenericBudgetCandidates(text);
    const selected = candidates.filter(row => row.included !== false);
    if (candidates.length > 5000) throw new Error('Plus de 5 000 lignes : utilisez Excel/CSV.');
    return {
        rows: (candidates.length ? candidates : [{
            item_code: '', description: '', quantity: '', unit: 'UN',
            unit_cost: '', amount: '', included: true,
        }]).map(row => ({
            item_code: String(row.item_code ?? ''),
            description: String(row.description ?? ''),
            quantity: row.quantity ?? '',
            unit: String(row.unit || 'UN'),
            unit_cost: row.unit_cost ?? '',
            amount: row.amount ?? '',
            included: row.included !== false,
        })),
        genericCandidates: !suggested.length ? selected.length : 0,
        extractedProject: String(parsed?.hints?.shipping_project_name || ''),
        printedMaterialTotal: Number.isFinite(Number(document.printed_material_total)) &&
            document.printed_material_total !== null ? Number(document.printed_material_total) : null,
        issues: [...(parsed?.issues || []).map(issue => issue.message),
            ...(parsed?.evidence?.warnings || [])].filter(Boolean),
        sourceExcerpt: String(text || '').slice(0, 12000),
    };
};

export const validateReviewedBudgetPdf = ({
    rows, expectedCount, printedMaterialTotal = null, enteredTotal = '',
    acceptDifference = false, acceptMissingTotal = false,
    confirmed = false, site, extractedProject = '', siteConfirmation = '',
} = {}) => {
    if (!site?.id || site.status !== 'active' || !site.company_id)
        throw new Error('Le chantier doit être actif pour importer une estimation.');
    const matches = Boolean(normalizeToken(extractedProject)) &&
        normalizeToken(extractedProject) === normalizeToken(site.name);
    if (!matches && String(siteConfirmation || '').trim().toLocaleLowerCase('fr-CA') !==
        String(site.name || '').trim().toLocaleLowerCase('fr-CA')) {
        throw new Error('Confirmez le nom exact du chantier sélectionné.');
    }
    if (!confirmed) throw new Error('Confirmez avoir comparé toutes les lignes au PDF original.');
    const included = (rows || []).filter(row => row.included !== false);
    if (!included.length || included.length > 5000)
        throw new Error('Le budget doit contenir entre 1 et 5 000 articles.');
    const parsed = parsePurchaseRows(included, { kind: 'budget' });
    if (!/^\d+$/.test(String(expectedCount).trim()) ||
        Number(expectedCount) !== parsed.length) {
        throw new Error('Confirmez le nombre exact de lignes matérielles retenues.');
    }
    for (const [index, row] of parsed.entries()) {
        if (Math.abs(cents(row.quantity * row.unit_cost) - cents(row.amount)) > 2) {
            throw new Error('Ligne ' + (index + 1) +
                ' : quantité × prix ne correspond pas au montant. Corrigez la ligne.');
        }
    }
    const expected = printedMaterialTotal !== null
        ? Number(printedMaterialTotal)
        : enteredTotal === '' ? null : parseDecimal(enteredTotal);
    if (expected === null && !acceptMissingTotal)
        throw new Error('Indiquez le total du document ou confirmez son absence.');
    if (expected !== null && (!Number.isFinite(expected) || expected < 0))
        throw new Error('Total du document invalide.');
    const sum = parsed.reduce((total, row) => total + cents(row.amount), 0);
    if (expected !== null && Math.abs(sum - cents(expected)) > 2 && !acceptDifference)
        throw new Error('Le total des articles diffère du PDF : confirmez explicitement cet écart.');
    return { rows: parsed, amount: sum / 100 };
};

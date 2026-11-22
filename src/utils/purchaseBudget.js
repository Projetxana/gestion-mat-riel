// Purchase onboarding: deterministic helpers, no PDF/OCR inference and no tenant changes.
// All amounts represent pre-tax CAD purchase commitments; delivery notes never add cost.
export const normalizeToken = value => String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');

export const normalizePurchaseOrder = value => normalizeToken(value);

export const normalizeCatalogCode = value => {
    const raw = normalizeToken(value);
    return raw.replace(/^(CD|ART)(?=\d{4,})/, '');
};

export const projectFromShippingName = (shippingName, sites, companyId, aliases = []) => {
    const query = normalizeToken(shippingName);
    if (query.length < 3) return { status: 'review', site: null };
    const candidates = (sites || []).filter(site =>
        String(site.company_id) === String(companyId) && site.status === 'active' &&
        [site.name, ...(aliases.filter(a => String(a.site_id) === String(site.id) && String(a.company_id) === String(companyId)).map(a => a.name))]
            .some(name => normalizeToken(name) === query)
    );
    if (candidates.length !== 1) return { status: 'review', site: null };
    return { status: 'matched', site: candidates[0] };
};

const columnName = name => normalizeToken(name);
const columnAliases = {
    item_code: ['CODE', 'CODEARTICLE', 'ITEMCODE', 'ARTICLE', 'REFERENCES', 'REFERENCE'],
    description: ['DESCRIPTION', 'DESIGNATION', 'PRODUIT', 'PRODUCT'],
    quantity: ['QUANTITE', 'QUANTITY', 'QTE', 'QTY'],
    unit: ['UNITE', 'UNITEDEMESURE', 'UNIT', 'UOM', 'UM'],
    unit_cost: ['PRIXUNITAIRE', 'UNITCOST', 'UNITPRICE', 'COUTUNITAIRE', 'PRIX'],
    amount: ['MONTANT', 'TOTAL', 'COUTTOTAL', 'AMOUNT', 'NETAMOUNT'],
};

export const parseDecimal = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let raw = String(value ?? '').trim().replace(/[\s\u00a0\u202f$]/g, '');
    if (!raw) return NaN;
    // Canadian French and English monetary formats: 1 234,50 or 1,234.50.
    const comma = raw.lastIndexOf(',');
    const dot = raw.lastIndexOf('.');
    if (comma > dot) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (dot > comma && comma >= 0) raw = raw.replace(/,/g, '');
    else if (comma >= 0) raw = raw.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return NaN;
    return Number(raw);
};

const readColumn = (record, key) => {
    const row = Object.fromEntries(Object.entries(record).map(([k, v]) => [columnName(k), v]));
    const matched = columnAliases[key].find(alias => Object.hasOwn(row, alias));
    return matched ? row[matched] : undefined;
};

export const parsePurchaseRows = (rows, { kind = 'budget' } = {}) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Le fichier ne contient aucune ligne.');
    if (!['budget', 'order'].includes(kind)) throw new Error('Type d’import invalide.');
    if (rows.length > 5000) throw new Error('Maximum de 5 000 lignes par import.');
    const parsed = [];
    const failures = [];
    rows.forEach((record, index) => {
        const description = String(readColumn(record, 'description') ?? '').trim();
        const item_code = String(readColumn(record, 'item_code') ?? '').trim();
        const unit = String(readColumn(record, 'unit') ?? 'UN').trim().toUpperCase();
        const quantity = parseDecimal(readColumn(record, 'quantity'));
        const unit_cost = parseDecimal(readColumn(record, 'unit_cost'));
        const rawAmount = readColumn(record, 'amount');
        const amount = rawAmount === undefined || String(rawAmount).trim() === ''
            ? Math.round(quantity * unit_cost * 100) / 100 : parseDecimal(rawAmount);
        if (!description || !Number.isFinite(quantity) || quantity <= 0 ||
            !Number.isFinite(unit_cost) || unit_cost < 0 ||
            !Number.isFinite(amount) || amount < 0 || !unit) {
            failures.push(index + 2);
            return;
        }
        parsed.push({ item_code, description, unit, quantity, unit_cost, amount });
    });
    if (failures.length) throw new Error(
        'Lignes invalides : ' + failures.slice(0, 12).join(', ') +
        (failures.length > 12 ? '…' : '') +
        '. Vérifiez quantités, coûts, montants et descriptions.'
    );
    if (!parsed.length) throw new Error('Aucun article exploitable.');
    return parsed;
};

export const calculatePurchaseBudget = (budgetLines = [], orderLines = []) => {
    const cents = values => values.reduce((sum, line) => sum + Math.round(Number(line.amount ?? 0) * 100), 0);
    const budgetCents = cents(budgetLines);
    const committedCents = cents(orderLines);
    return {
        initial: budgetCents / 100,
        committed: committedCents / 100,
        varianceCommitted: (committedCents - budgetCents) / 100,
        uncommitted: Math.max(0, budgetCents - committedCents) / 100,
    };
};

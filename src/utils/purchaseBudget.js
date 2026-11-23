// Purchase onboarding: deterministic helpers, no PDF/OCR inference and no tenant changes.
// All amounts represent pre-tax CAD purchase commitments; delivery notes never add cost.
export const normalizeToken = value => String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');

export const normalizePurchaseOrder = value => normalizeToken(value);

export const shippingProjectVerification = (shippingName, siteName, overrideSiteName = '') => {
    const expected = normalizeToken(siteName);
    const observed = normalizeToken(shippingName);
    const match = expected.length >= 3 && expected === observed;
    const manualOverride = !match && expected.length >= 3 &&
        overrideSiteName.trim().toLocaleLowerCase('fr-CA') === String(siteName ?? '').trim().toLocaleLowerCase('fr-CA');
    return { match, requiresOverride: !match, canAccept: match || manualOverride };
};



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

const normalizedUnit = value => {
    const unit = normalizeToken(value);
    if (['FT', 'PI', 'PIED', 'PIEDS', 'FOOT', 'FEET'].includes(unit)) return 'PI';
    if (['UN', 'EA', 'EACH', 'PCS', 'PC', 'UNIT'].includes(unit)) return 'UN';
    return unit;
};

export const comparePurchaseItems = (budgetLines = [], orderLines = [], purchaseLinks = []) => {
    const keyOf = line => {
        const code = normalizeCatalogCode(line.item_code);
        return code ? code + ':' + normalizedUnit(line.unit) : null;
    };
    const budgetByKey = new Map();
    const orderedByKey = new Map();
    const unmatched = [];
    const outsideBudget = [];
    const budgetKeyById = new Map();
    const linkByOrderLineId = new Map((purchaseLinks || []).map(link => [String(link.order_line_id), link]));
    for (const line of budgetLines) {
        const key = keyOf(line);
        if (!key) continue;
        const entry = budgetByKey.get(key) || {
            key, description: line.description, item_code: line.item_code,
            unit: normalizedUnit(line.unit), estimatedQty: 0, orderedQty: 0,
            estimatedAmount: 0, orderedAmount: 0,
        };
        entry.estimatedQty += Number(line.quantity || 0);
        entry.estimatedAmount += Number(line.amount || 0);
        budgetByKey.set(key, entry);
        if (line.id != null) budgetKeyById.set(String(line.id), key);
    }
    for (const line of orderLines) {
        const link = line.id == null ? null : linkByOrderLineId.get(String(line.id));
        if (link?.disposition === 'outside_budget') {
            outsideBudget.push(line);
            continue;
        }
        // A saved, admin-verified correspondence takes precedence over the
        // supplier's product code. No quantities or costs are rewritten.
        const key = link?.disposition === 'linked'
            ? budgetKeyById.get(String(link.budget_line_id))
            : keyOf(line);
        if (!key || !budgetByKey.has(key) || (
            link?.disposition === 'linked' &&
            normalizedUnit(budgetLines.find(b=>String(b.id)===String(link.budget_line_id))?.unit) !== normalizedUnit(line.unit)
        )) {
            unmatched.push(line);
            continue;
        }
        const entry = orderedByKey.get(key) || { quantity: 0, amount: 0 };
        entry.quantity += Number(line.quantity || 0);
        entry.amount += Number(line.amount || 0);
        orderedByKey.set(key, entry);
    }
    const matched = [...budgetByKey.values()].map(entry => {
        const order = orderedByKey.get(entry.key) || { quantity: 0, amount: 0 };
        return {
            ...entry, orderedQty: order.quantity, orderedAmount: order.amount,
            remainingQty: Math.max(0, entry.estimatedQty - order.quantity),
            exceeded: order.quantity > entry.estimatedQty,
        };
    });
    return { matched, unmatched, outsideBudget };
};

// Candidate matches are suggestions, NEVER automatic write operations. A
// different vendor SKU may identify the same article as the local CD code.
export const suggestBudgetCorrespondences = (orderLine, budgetLines = []) => {
    const tokens = value => {
        const normalized = String(value ?? '').normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '').toUpperCase()
            .replace(/(\d+)\s*(?:"|PO\b|POUCE[S]?\b)/g, '$1PO')
            .replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/);
        return new Set(tokens.filter(t=>t.length>=2 && ![
            'DE','DES','DU','LE','LA','LES','EN','ET','AVEC','NOIR','GALV','STD'
        ].includes(t)));
    };
    const from=tokens(orderLine.description);
    const sourceCode=normalizeCatalogCode(orderLine.item_code);
    return budgetLines.filter(b=>normalizedUnit(b.unit)===normalizedUnit(orderLine.unit))
        .map(b=>{
            const target=tokens(b.description);
            const intersection=[...from].filter(w=>target.has(w)).length;
            const union=new Set([...from,...target]).size||1;
            const shared=intersection/union;
            const codeEqual=sourceCode && sourceCode===normalizeCatalogCode(b.item_code);
            const quantityEqual=Number(orderLine.quantity)===Number(b.quantity);
            const score=(codeEqual?10:0) + shared*4 + (quantityEqual?0.35:0);
            return {...b,score,codeEqual:Boolean(codeEqual)};
        })
        .sort((a,b)=>b.score-a.score || String(a.item_code).localeCompare(String(b.item_code)));
};

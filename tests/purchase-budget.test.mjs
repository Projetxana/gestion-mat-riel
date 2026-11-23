import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculatePurchaseBudget,
    comparePurchaseItems,
    normalizePurchaseOrder,
    normalizeCatalogCode,
    parseDecimal,
    parsePurchaseRows,
    projectFromShippingName,
    shippingProjectVerification,
} from '../src/utils/purchaseBudget.js';

test('Canadian currency formats are handled without changing values', () => {
    assert.equal(parseDecimal('1 234,50'), 1234.5);
    assert.equal(parseDecimal('1,234.50'), 1234.5);
    assert.equal(parseDecimal('0,32'), 0.32);
    assert.ok(Number.isNaN(parseDecimal('inconnu')));
});

test('PO identifies an order, not its project; client catalog aliases normalize', () => {
    assert.equal(normalizePurchaseOrder(' p 02281 '), 'P02281');
    assert.equal(normalizeCatalogCode('CD 00429'), normalizeCatalogCode('ART00429'));
});

test('shipping project exact/alias match is tenant-scoped and fails closed on ambiguity', () => {
    const sites = [
        { id: 10, name: 'DJ4 S.E.C.', status: 'active', company_id: 'company-a' },
        { id: 11, name: 'DJ4 S.E.C.', status: 'active', company_id: 'company-b' },
        { id: 12, name: 'Archives', status: 'archived', company_id: 'company-a' },
    ];
    const aliases = [{site_id:10, company_id:'company-a', name:'District Sainte-Julie'}];
    assert.equal(projectFromShippingName('DJ4 S.E.C.', sites, 'company-a').site.id, 10);
    assert.equal(projectFromShippingName('District Sainte-Julie', sites, 'company-a', aliases).site.id, 10);
    assert.equal(projectFromShippingName('District Sainte-Julie', sites, 'company-b', aliases).status, 'review');
    assert.equal(projectFromShippingName('Archives', sites, 'company-a').status, 'review');
    assert.equal(projectFromShippingName('Inconnu', sites, 'company-a').status, 'review');
});

test('line import accepts recognized columns and calculates missing net amounts', () => {
    const lines = parsePurchaseRows([
        { Code: 'ART00429', Description: 'Té CPVC', Quantite: '40', Unite: 'UN', 'Prix unitaire': '3,80', Montant: '' },
        { Code: 'ART00159', Description: 'Tuyau CPVC', Quantite: 200, Unite: 'PI', 'Prix unitaire': '1,33', Montant: '266,00' },
    ]);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].amount, 152);
    assert.equal(lines[1].amount, 266);
});

test('invalid monetary lines and negative quantities fail the entire import atomically', () => {
    assert.throws(() => parsePurchaseRows([
        { Description: 'Té CPVC', Quantite: -1, 'Prix unitaire': 5, Montant: -5 },
    ]), /Lignes invalides/);
    assert.throws(() => parsePurchaseRows([]), /aucune ligne/);
});

test('budget accounting uses confirmed orders only; receptions have no cost effect', () => {
    const budgetLines = [{amount:300}, {amount:200}];
    const orderedLines = [{amount:180}, {amount:100}];
    const totals = calculatePurchaseBudget(budgetLines, orderedLines);
    assert.deepEqual(totals, {initial:500, committed:280, varianceCommitted:-220, uncommitted:220});
});

test('A1 Cash & Carry global spending includes unquoted purchases without changing Flocor budget',()=>{
    const flocorBudget=[{amount:57062.03}];
    const confirmedOrders=[{amount:37726.82},{amount:217.18}];
    const totals=calculatePurchaseBudget(flocorBudget,confirmedOrders);
    assert.equal(totals.initial,57062.03);
    assert.equal(totals.committed,37944);
    assert.equal(totals.uncommitted,19118.03);
    assert.equal(totals.varianceCommitted,-19118.03);
    // No extra line is added to the Flocor source budget.
    assert.equal(flocorBudget.length,1);
});
test('mismatched shipping site is blocked without explicit site-name override', () => {
    assert.equal(shippingProjectVerification('DJ4 S.E.C.', 'DJ4 SEC').canAccept, true);
    assert.equal(shippingProjectVerification('Orélis Jarry', 'DJ4 S.E.C.').canAccept, false);
    assert.equal(shippingProjectVerification('Orélis Jarry', 'DJ4 S.E.C.', 'DJ4 S.E.C.').canAccept, true);
    assert.equal(shippingProjectVerification('Orélis Jarry', 'DJ4 S.E.C.', 'Orélis Jarry').canAccept, false);
});

test('order lines reconcile only on verified catalog code and compatible unit', () => {
    const estimate = [
        { item_code: 'CD 00429', description: 'Té CPVC', unit: 'UN', quantity: 100, amount: 380 },
        { item_code: 'CD 00159', description: 'Tuyau CPVC', unit: 'PI', quantity: 700, amount: 900 },
    ];
    const ordered = [
        { item_code: 'ART00429', description: 'Té CPVC', unit: 'UN', quantity: 35, amount: 140 },
        { item_code: 'ART00159', description: 'Tuyau CPVC', unit: 'FT', quantity: 150, amount: 200 },
        { item_code: 'FL999', description: 'Té CPVC', unit: 'UN', quantity: 40, amount: 100 },
        { item_code: 'ART00429', description: 'Té CPVC', unit: 'PI', quantity: 3, amount: 50 },
    ];
    const {matched, unmatched} = comparePurchaseItems(estimate, ordered);
    assert.equal(matched.find(row => row.key === '00429:UN')?.remainingQty, 65);
    assert.equal(matched.find(row => row.key === '00159:PI')?.remainingQty, 550);
    assert.equal(unmatched.length, 2);
});

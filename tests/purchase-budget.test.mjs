import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculatePurchaseBudget,
    normalizePurchaseOrder,
    normalizeCatalogCode,
    parseDecimal,
    parsePurchaseRows,
    projectFromShippingName,
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

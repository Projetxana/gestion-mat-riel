import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePurchaseBudget, comparePurchaseItems } from '../src/utils/purchaseBudget.js';
import { extractFlocorCredit, groupPurchaseDocuments } from '../src/utils/purchaseDocumentIdentity.js';
import { compareSupplierPrices } from '../src/utils/supplierPriceWatch.js';

const creditText = `Note de crédit
CONFIRMATION
1234567
FLOCOR INC
P12345                     Exemple ABC         89          106            1234566
001  SAMPLE    Article de retour    UN     2.00-    2.00-     .00     39.5300          79.06-
Sous-total / Sub-Total         79.06-
TOTAL DU/DUE                   90.90-`;

test('credit parser verifies signed lines against the printed pre-tax subtotal', () => {
    const result = extractFlocorCredit(creditText);
    assert.equal(result.complete, true);
    assert.equal(result.reference, '1234567');
    assert.equal(result.original_supplier_order_number, '1234566');
    assert.equal(result.rows[0].quantity, -2);
    assert.equal(result.total, -79.06);
    assert.equal(extractFlocorCredit(creditText.replace('Sub-Total         79.06-', 'Sub-Total         78.06-')).complete, false);
    assert.equal(extractFlocorCredit(creditText.replace('2.00-    2.00-', '2.00-    1.00-')).complete, false);
});

test('distinct PDFs under one PO sum confirmations and credits in cents', () => {
    const orders = ['one', 'two', 'credit'].map(id => ({ id, supplier: 'Flocor', po_number: 'P12345' }));
    const credit = extractFlocorCredit(creditText).rows[0];
    const lines = [
        { ...credit, id: 1, order_id: 'one', quantity: 3, amount: 118.59 },
        { ...credit, id: 2, order_id: 'two', quantity: 2, amount: 79.06 },
        { ...credit, id: 3, order_id: 'credit' },
    ];
    const group = groupPurchaseDocuments(orders, lines)[0];
    assert.equal(group.documents.length, 3);
    assert.equal(group.total, 118.59);
    const budget = [{ ...credit, id: 10, quantity: 10, amount: 395.30 }];
    assert.equal(calculatePurchaseBudget(budget, lines).committed, 118.59);
    assert.equal(comparePurchaseItems(budget, lines).matched[0].orderedQty, 3);
    assert.equal(compareSupplierPrices({ orders, orderLines: lines }).lines.length, 2);
});

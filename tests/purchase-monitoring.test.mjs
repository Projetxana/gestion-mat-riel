import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePurchaseOverview } from '../src/utils/purchaseMonitoring.js';

test('purchase indicator uses confirmed order commitments / initial budget', () => {
    const value=summarizePurchaseOverview(true,[{amount:1250},{amount:750}],[{amount:400},{amount:600}]);
    assert.equal(value.initial,2000);
    assert.equal(value.committed,1000);
    assert.equal(value.uncommitted,1000);
    assert.equal(value.percent,50);
    assert.equal(value.status,'ready');
});

test('do not label missing budgets as 0 percent progress', () => {
    const value=summarizePurchaseOverview(false,[],[{amount:250}]);
    assert.equal(value.percent,null);
    assert.equal(value.committed,250);
    assert.equal(value.status,'missing_budget');
});

test('overcommit remains visible and exceeds 100 percent rather than disappearing', () => {
    const value=summarizePurchaseOverview(true,[{amount:700}],[{amount:950}]);
    assert.equal(value.percent,135.7);
    assert.equal(value.exceeded,true);
    assert.equal(value.uncommitted,0);
});

test('received quantities must not become a second purchase commitment', () => {
    const before=summarizePurchaseOverview(true,[{amount:1000}],[{amount:200}]);
    const after=summarizePurchaseOverview(true,[{amount:1000}],[{amount:200}]);
    assert.deepEqual(before,after);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const read = name => readFileSync(new URL('../src/components/'+name,import.meta.url),'utf8');

test('Suivi projets keeps existing modal and drills down without leaving the project list route',()=>{
    const modal=read('ProjectMonitoringModal.jsx');
    assert.match(modal,/openProject\(project\.id\)/);
    assert.match(modal,/selectedProject && selectedSite/);
    assert.match(modal,/SitePerformancePanel site=\{selectedSite\}/);
    assert.match(modal,/PurchaseBudgetPanel site=\{selectedSite\}/);
    assert.match(modal,/Détail avancement \/ IPMO/);
    assert.match(modal,/Détail des achats/);
    assert.doesNotMatch(modal,/navigate\('\/sites\//);
    assert.ok(transformSync(modal,{loader:'jsx',target:'es2022'}).code.length>100);
});

test('the IPMO drilldown reuses existing task-by-task physical progress editor',()=>{
    const panel=read('SitePerformancePanel.jsx');
    assert.match(panel,/Validation de l'avancement des tâches/);
    assert.match(panel,/bt_publish_performance_report/);
    assert.match(panel,/onReportSaved\?\.\(\)/);
});

test('purchases drilldown stays admin-only and refreshes summary after financial changes',()=>{
    const purchases=read('PurchaseBudgetPanel.jsx');
    const monitoring=read('ProjectMonitoringModal.jsx');
    assert.match(purchases,/if \(!site \|\| !isAdmin \|\| !isCorrectTenant\) return null;/);
    assert.match(purchases,/onPurchasesChanged\?\.\(\)/);
    assert.match(monitoring,/canReadPurchases/);
    assert.match(monitoring,/Commandes \/ budget initial/);
});

test('missing purchases schema must show unavailable rather than falsely reporting zero spend',()=>{
    const modal=read('ProjectMonitoringModal.jsx');
    assert.match(modal,/status:'unavailable'/);
    assert.match(modal,/Le module Achats n’est pas encore activé sur cette base/);
    assert.match(modal,/status:'loading'/);
});

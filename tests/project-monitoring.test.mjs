import test from 'node:test';
import assert from 'node:assert/strict';
import { latestReportsBySite, summarizeProjectMonitoring, monitoringProjects } from '../src/utils/projectMonitoring.js';

const company = 'c-1';
const firstSite = { id: 12, name: 'A1 Cash & Carry', status: 'active', company_id: company, planned_hours: 912 };
const otherSite = { id: 8, name: 'DJ 3', status: 'active', company_id: company, planned_hours: 2208 };
const one = { id: 1, company_id: company, site_id: 12, planned_hours: 912, physical_percent: 20,
 earned_hours: 182.4, consumed_hours: 200, performance_index: 0.912, validated_at: '2026-11-19T10:00:00Z' };
const latest = { ...one, id: 2, physical_percent: 25.61, earned_hours: 233.6,
 consumed_hours: 180, performance_index: 1.298, validated_at: '2026-11-20T03:19:00Z' };

test('latest validation wins, including when reports arrive out of order', () => {
  const bySite = latestReportsBySite([one,latest],company);
  assert.equal(bySite.get('12').id,2);
  assert.equal(latestReportsBySite([latest,one],company).get('12').id,2);
});

test('missing validation is not presented as an excellent budget gap', () => {
  const value = summarizeProjectMonitoring(otherSite);
  assert.equal(value.budget,2208);
  assert.equal(value.physicalPercent,null);
  assert.equal(value.consumedHours,null);
  assert.equal(value.ipmo,null);
  assert.equal(value.productivityGap,null);
  assert.equal(value.status,'unreviewed');
});

test('validated snapshot computes separate physical progress and budget consumed', () => {
  const value = summarizeProjectMonitoring(firstSite, [], latest);
  assert.equal(value.physicalPercent,25.61);
  assert.ok(Math.abs(value.consumedPercent - (180 / 912 * 100)) < 0.0001);
  assert.equal(value.ipmo,1.298);
  assert.ok(Math.abs(value.productivityGap - 53.6) < 0.00001);
});

test('unverified history never fabricates an index or hours saved', () => {
  const value = summarizeProjectMonitoring(firstSite, [], {
    ...latest, id: 4, consumed_hours: null, performance_index: null
  });
  assert.equal(value.physicalPercent,25.61);
  assert.equal(value.consumedPercent,null);
  assert.equal(value.ipmo,null);
  assert.equal(value.productivityGap,null);
  assert.equal(value.status,'unverified');
});

test('filters other companies, archived sites, unbudgeted shells and foreign reports', () => {
 const foreign = { ...latest, id: 5, company_id:'other', site_id:12 };
 const all = monitoringProjects([firstSite,otherSite,
    {...firstSite,id:90,company_id:'other'},
    {...firstSite,id:99,status:'archived'},
    {...firstSite,id:88,planned_hours:0}],
    [], [foreign,latest], company);
 assert.deepEqual(all.map(x=>x.name),['DJ 3','A1 Cash & Carry']);
 assert.equal(all.find(x=>x.id===12).report.id,2);
});

test('bad/missing budget rejects invalid percent ratios', () => {
  const value = summarizeProjectMonitoring({...firstSite,planned_hours:0},[],{
    ...latest,planned_hours:0
  });
  assert.equal(value.consumedPercent,null);
  assert.equal(value.ipmo,null);
});

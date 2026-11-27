import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSessionsByEmployee, formatDuration, durationInMinutes } from '../src/utils/weeklyApproval.js';

const session = (id, user, start, lengthMinutes, approved = false, correctedStart = null) => ({
    id, user_id: user, punch_start_at: start,
    punch_end_at: new Date(Date.parse(start) + lengthMinutes * 60000).toISOString(),
    corrected_start_at: correctedStart,
    corrected_end_at: correctedStart
      ? new Date(Date.parse(correctedStart) + lengthMinutes * 60000).toISOString()
      : null,
    approved,
});

test('one employee card per week, with a single list of pending ids', () => {
    const rows = [
        session(1, 'alex', '2026-11-16T08:00:00-05:00', 480),
        session(2, 'alex', '2026-11-17T08:00:00-05:00', 435, true),
        session(3, 'nikolai', '2026-11-16T08:00:00-05:00', 510),
    ];
    const result = groupSessionsByEmployee(rows, id => ({alex:'Alex',nikolai:'Nikolai'}[id]));
    assert.equal(result.length, 2);
    assert.deepEqual(result[0].pendingIds, [1]);
    assert.equal(result[0].approvedCount, 1);
    assert.equal(result[0].pendingCount, 1);
    assert.equal(result[0].days.length, 2);
    assert.equal(formatDuration(result[0].totalMinutes), '15:15');
    assert.equal(formatDuration(result[1].totalMinutes), '8:30');
});

test('corrected effective times define totals and day grouping', () => {
    const old = session(4, 'alex', '2026-11-16T08:00:00-05:00', 480);
    old.corrected_start_at = '2026-11-17T07:00:00-05:00';
    old.corrected_end_at = '2026-11-17T14:15:00-05:00';
    assert.equal(durationInMinutes(old), 435);
    const group = groupSessionsByEmployee([old], ()=>'Alex')[0];
    assert.equal(group.days[0].key,'2026-11-17');
    assert.equal(formatDuration(group.totalMinutes), '7:15');
});

test('validated employees and all-approved groups have no pending ids', () => {
    const group = groupSessionsByEmployee([
        session(8,'alex','2026-11-18T08:00:00-05:00',495,true),
        session(9,'alex','2026-11-19T08:00:00-05:00',450,true),
    ], ()=>'Alex')[0];
    assert.equal(group.pendingCount,0);
    assert.equal(group.approvedCount,2);
    assert.equal(formatDuration(group.totalMinutes),'15:45');
});


test('removing two pending overlapping sessions recalculates day and week totals without changing the retained session', () => {
    const rows = [
        session(101, 'alain', '2026-11-26T08:00:00-05:00', 630),
        session(102, 'alain', '2026-11-26T08:00:00-05:00', 540),
        session(103, 'alain', '2026-11-26T08:00:00-05:00', 540),
        session(104, 'alain', '2026-11-25T08:00:00-05:00', 480, true),
    ];
    const before = groupSessionsByEmployee(rows, () => 'Alain')[0];
    assert.equal(formatDuration(before.days.find(day => day.key === '2026-11-26').totalMinutes), '28:30');
    const after = groupSessionsByEmployee(rows.filter(row => ![102, 103].includes(row.id)), () => 'Alain')[0];
    assert.equal(formatDuration(after.days.find(day => day.key === '2026-11-26').totalMinutes), '10:30');
    assert.equal(formatDuration(after.totalMinutes), '18:30');
    assert.deepEqual(after.pendingIds, [101]);
    assert.equal(after.approvedCount, 1);
});


import { manualEntriesOverlap, findManualEntryConflict } from '../src/utils/manualEntryConflicts.js';

const manual = (hours, overrides = {}) => ({
    company_id: 'cd', user_id: 'alain', site_id: 1, section_id: 7, manual_entry: true,
    punch_start_at: '2026-11-26T13:00:00Z',
    punch_end_at: new Date(Date.parse('2026-11-26T13:00:00Z') + hours * 3600000).toISOString(),
    ...overrides,
});

test('manual overlap prevents identical and changed duration resubmissions on the same task', () => {
    assert.equal(manualEntriesOverlap(manual(9), manual(9)), true);
    assert.equal(manualEntriesOverlap(manual(10.5), manual(9)), true);
    assert.ok(findManualEntryConflict([manual(10.5)], [manual(9)]));
    assert.ok(findManualEntryConflict([manual(9), manual(10.5)]));
});

test('different tasks, companies, sites, employees and GPS punches are not false positives', () => {
    for (const change of [{section_id:8},{company_id:'other'},{site_id:2},
        {user_id:'other'},{manual_entry:false}]) {
        assert.equal(manualEntriesOverlap(manual(9), manual(9, change)), false);
    }
    assert.equal(findManualEntryConflict([manual(4), manual(4,{section_id:8})]), null);
});

test('adjacent periods and unrelated historical duplicates remain allowed; corrected times are respected', () => {
    const adjacent = manual(2,{punch_start_at:'2026-11-26T22:00:00Z',punch_end_at:'2026-11-27T00:00:00Z'});
    assert.equal(manualEntriesOverlap(manual(9), adjacent), false);
    assert.equal(findManualEntryConflict([manual(3,{section_id:8})], [manual(9),manual(9)]), null);
    const corrected = manual(9,{corrected_start_at:'2026-11-25T13:00:00Z',corrected_end_at:'2026-11-25T22:00:00Z'});
    assert.equal(manualEntriesOverlap(manual(9), corrected), false);
});

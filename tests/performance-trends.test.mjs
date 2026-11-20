import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuebecMondayKey, buildWeeklyPerformanceTrends, formatWeeklyLabel } from '../src/utils/performanceTrends.js';

const report = (id, date, progress, ipmo = 1.2, extra = {}) => ({
    id, validated_at: date, physical_percent: progress, performance_index: ipmo,
    consumed_hours: ipmo == null ? null : 100, planned_hours: 200,
    earned_hours: ipmo == null ? null : 120, ...extra,
});

test('Toronto-local Mondays, including UTC midnight and DST transitions', () => {
    assert.equal(getQuebecMondayKey('2026-11-23T01:30:00Z'), '2026-11-16'); // Sunday 20:30 Montreal
    assert.equal(getQuebecMondayKey('2026-11-23T05:01:00Z'), '2026-11-23'); // Monday 00:01
    assert.equal(getQuebecMondayKey('2026-03-09T03:30:00Z'), '2026-03-02'); // Sunday DST
    assert.equal(getQuebecMondayKey('2026-03-09T04:30:00Z'), '2026-03-09'); // Monday DST
    assert.equal(getQuebecMondayKey('invalid'), null);
    assert.ok(formatWeeklyLabel('2026-11-16').includes('nov'));
});

test('nine same-week validations do not unlock charts', () => {
    const records = Array.from({length: 9}, (_,i) =>
        report(i+1, '2026-11-' + String(16+(i%5)).padStart(2,'0') + 'T15:00:00Z', i+10));
    const result = buildWeeklyPerformanceTrends(records);
    assert.equal(result.physical.length, 1);
    assert.equal(result.ipmo.length, 1);
    assert.equal(result.showPhysical, false);
    assert.equal(result.showIpmo, false);
});

test('physical curve appears at two distinct weeks, IPMO at three reliable weeks', () => {
    const points = [
        report(1,'2026-11-16T13:00:00Z',10,0.95),
        report(2,'2026-11-23T13:00:00Z',30,null),
    ];
    const two = buildWeeklyPerformanceTrends(points);
    assert.equal(two.showPhysical,true);
    assert.equal(two.showIpmo,false);
    const three = buildWeeklyPerformanceTrends([
        ...points,
        report(3,'2026-11-30T13:00:00Z',50,1.15),
        report(4,'2026-12-07T13:00:00Z',70,1.25),
    ]);
    assert.equal(three.showPhysical,true);
    assert.equal(three.showIpmo,true);
    assert.deepEqual(three.ipmo.map(row=>row.week), ['2026-11-16','2026-11-30','2026-12-07']);
});

test('latest validation in a week wins, even when it suspends IPMO', () => {
    const result = buildWeeklyPerformanceTrends([
        report(1,'2026-11-16T13:00:00Z',20,1.4),
        report(2,'2026-11-19T13:00:00Z',25,null),
        report(3,'2026-11-23T13:00:00Z',45,1.2),
        report(4,'2026-11-30T13:00:00Z',60,1.1),
    ]);
    assert.deepEqual(result.physical.map(row => row.value), [25,45,60]);
    assert.deepEqual(result.ipmo.map(row => row.value), [1.2,1.1]);
    assert.equal(result.showPhysical,true);
    assert.equal(result.showIpmo,false);
});

test('reject untrustworthy indices and impossible physical percentages', () => {
    const result = buildWeeklyPerformanceTrends([
        report(1,'2026-11-16T13:00:00Z',-4,1.4),
        report(2,'2026-11-23T13:00:00Z',120,1.4),
        report(3,'2026-11-30T13:00:00Z',30,1.2,{consumed_hours:null}),
        report(4,'2026-12-07T13:00:00Z',35,0),
        report(5,'2026-12-14T13:00:00Z',40,1.7,{planned_hours:0}),
    ]);
    assert.deepEqual(result.physical.map(row=>row.value),[30,35,40]);
    assert.equal(result.showPhysical,true);
    assert.equal(result.ipmo.length,2);
    assert.equal(result.showIpmo,false);
});

test('keep the most recent twelve distinct weekly points in chronological order', () => {
    const dates = Array.from({length:15},(_,i)=>new Date(Date.UTC(2026,0,5+i*7,13)).toISOString());
    const result = buildWeeklyPerformanceTrends(dates.map((date,i)=>report(i+1,date,i+1)));
    assert.equal(result.physical.length,12);
    assert.equal(result.ipmo.length,12);
    assert.equal(result.physical[0].value,4);
    assert.equal(result.physical.at(-1).value,15);
});

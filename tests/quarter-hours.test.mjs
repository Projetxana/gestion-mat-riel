import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalizedHours, isValidQuarterHour, formatDecimalHours, stepQuarterHour } from '../src/utils/quarterHours.js';

test('French decimal commas and dot variants mean decimal hours, not HH:MM', () => {
    const cases = [
        ['7', 7], ['7,25', 7.25], ['7,5', 7.5], ['7,50', 7.5],
        ['7,75', 7.75], ['8,5', 8.5], ['8.25', 8.25],
    ];
    for (const [input, expected] of cases) {
        assert.equal(parseLocalizedHours(input), expected, input);
        assert.equal(isValidQuarterHour(parseLocalizedHours(input)), true, input);
    }
});

test('reject invalid or non-quarter input, instead of truncating comma decimals', () => {
    for (const value of ['7,15', '7,3', 'abc', '7:15', '1,234', '-1', '25', '0', '']) {
        const parsed = parseLocalizedHours(value);
        assert.equal(isValidQuarterHour(parsed), false, value);
    }
});

test('display decimals with French commas, without rounding quarters to halves', () => {
    assert.equal(formatDecimalHours(7.25), '7,25');
    assert.equal(formatDecimalHours(7.5), '7,5');
    assert.equal(formatDecimalHours(8.75), '8,75');
    assert.equal(formatDecimalHours(0), '0');
});

test('plus/minus advances 15 minutes and stops at bounds', () => {
    assert.equal(stepQuarterHour('7,25', 1), '7,5');
    assert.equal(stepQuarterHour('7,25', -1), '7');
    assert.equal(stepQuarterHour('8,5', 1), '8,75');
    assert.equal(stepQuarterHour('0,25', -1), '');
    assert.equal(stepQuarterHour('24', 1), '24');
    assert.equal(stepQuarterHour('', 1), '0,25');
});

test('quarter-hour timestamps retain exact duration', () => {
    const start = new Date('2026-11-19T08:00:00-05:00').getTime();
    for (const hours of [7.25, 8.5, 8.75, 0.25]) {
        const end = start + hours * 3_600_000;
        const minutes = (end - start) / 60_000;
        assert.equal(minutes, hours * 60);
        assert.equal(minutes % 15, 0);
    }
});

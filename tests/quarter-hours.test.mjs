import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseLocalizedHours, isValidQuarterHour, formatHoursHHMM,
    normalizeHoursInput, stepQuarterHour,
} from '../src/utils/quarterHours.js';

test('comma and dot decimals are parsed as hours, never as minutes', () => {
    const cases = [
        ['7', 7], ['7,25', 7.25], ['7,5', 7.5],
        ['7,75', 7.75], ['8,5', 8.5], ['8.25', 8.25],
        ['7:15', 7.25], ['7:30', 7.5], ['8:45', 8.75],
        ['0:15', 0.25], ['24:00', 24],
    ];
    for (const [input, expected] of cases) {
        assert.equal(parseLocalizedHours(input), expected, input);
        assert.equal(isValidQuarterHour(parseLocalizedHours(input)), true, input);
    }
});

test('complete decimal quarters automatically become H:MM during typing', () => {
    const cases = [
        ['7,25', '7:15'], ['8,5', '8:30'], ['7,75', '7:45'],
        ['7,50', '7:30'], ['8.25', '8:15'], ['0,25', '0:15'],
        ['7,', '7,'], ['7,2', '7,2'], ['8', '8'], ['7:15', '7:15'],
    ];
    for (const [input, expected] of cases) {
        assert.equal(normalizeHoursInput(input), expected, input);
    }
});

test('day, week and overtime totals show durations, not decimal hours', () => {
    assert.equal(formatHoursHHMM(7.25), '7:15');
    assert.equal(formatHoursHHMM(7.5), '7:30');
    assert.equal(formatHoursHHMM(8.75), '8:45');
    assert.equal(formatHoursHHMM(8), '8:00');
    assert.equal(formatHoursHHMM(7.25 + 8 + 8 + 8), '31:15');
    assert.equal(formatHoursHHMM(40.25), '40:15');
    assert.equal(formatHoursHHMM(40.25 - 40), '0:15');
    assert.equal(formatHoursHHMM(0), '0:00');
});

test('existing saved sessions preserve minute precision on reloading', () => {
    const duration = (new Date('2026-11-19T16:20:00Z') -
        new Date('2026-11-19T08:00:00Z')) / 3_600_000;
    assert.equal(formatHoursHHMM(duration), '8:20');
    assert.equal(parseLocalizedHours('8:20'), 8 + 20 / 60);
    assert.equal(isValidQuarterHour(parseLocalizedHours('8:20')), false);
});

test('reject invalid or non-quarter values before saving', () => {
    for (const value of ['7,15', '7,3', 'abc', '7:10', '7:60', '1,234', '-1', '25', '0', '0:00', '']) {
        const parsed = parseLocalizedHours(value);
        assert.equal(isValidQuarterHour(parsed), false, value);
    }
});

test('plus/minus changes exactly fifteen minutes, max 24 h', () => {
    assert.equal(stepQuarterHour('7,25', 1), '7:30');
    assert.equal(stepQuarterHour('7:15', -1), '7:00');
    assert.equal(stepQuarterHour('8,5', 1), '8:45');
    assert.equal(stepQuarterHour('8:30', 1), '8:45');
    assert.equal(stepQuarterHour('0:15', -1), '');
    assert.equal(stepQuarterHour('24:00', 1), '24:00');
    assert.equal(stepQuarterHour('', 1), '0:15');
});

test('database timestamps preserve the exact quarter-hour duration', () => {
    const start = new Date('2026-11-19T08:00:00-05:00').getTime();
    for (const input of ['7,25', '8:30', '8,75', '0:15']) {
        const hours = parseLocalizedHours(input);
        const end = start + hours * 3_600_000;
        const minutes = (end - start) / 60_000;
        assert.equal(minutes, hours * 60);
        assert.equal(minutes % 15, 0);
    }
});

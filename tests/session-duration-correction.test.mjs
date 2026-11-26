import test from 'node:test';
import assert from 'node:assert/strict';
import { originalDuration, currentDuration, prepareDurationCorrection, prepareSessionCorrection } from '../src/utils/sessionDurationCorrection.js';

const original = {
    punch_start_at: '2026-11-16T08:00:00-05:00',
    punch_end_at: '2026-11-16T16:00:00-05:00',
    corrected_start_at: null,
    corrected_end_at: null,
    site_id: 12,
    section_id: 138,
};

test('displays the original entered hours and the current corrected hours separately', () => {
    assert.equal(originalDuration(original), '8:00');
    assert.equal(currentDuration(original), '8:00');
    const revised = { ...original, corrected_end_at: '2026-11-16T15:15:00-05:00' };
    assert.equal(originalDuration(revised), '8:00');
    assert.equal(currentDuration(revised), '7:15');
});

test('French decimal duration updates corrected end only, keeping date/project/task unchanged', () => {
    for (const [input, end] of [
        ['7,25', '2026-11-16T20:15:00.000Z'],
        ['7:15', '2026-11-16T20:15:00.000Z'],
        ['8,5', '2026-11-16T21:30:00.000Z'],
    ]) {
        const result = prepareDurationCorrection(original, input, 'Heures entrées par erreur');
        assert.equal(result.error, undefined);
        assert.deepEqual(Object.keys(result.updates).sort(), ['approved', 'corrected_end_at', 'correction_reason']);
        assert.equal(result.updates.corrected_end_at, end);
        assert.equal(result.updates.approved, false);
        assert.equal(original.punch_end_at, '2026-11-16T16:00:00-05:00');
        assert.equal(original.site_id, 12);
        assert.equal(original.section_id, 138);
    }
});

test('preexisting corrected start is preserved without changing day', () => {
    const previous = {
        ...original,
        corrected_start_at: '2026-11-17T09:00:00-05:00',
        corrected_end_at: '2026-11-17T17:00:00-05:00',
    };
    const result = prepareDurationCorrection(previous, '7:45', 'Mauvaise durée');
    assert.equal(result.updates.corrected_end_at, '2026-11-17T21:45:00.000Z');
    assert.equal(originalDuration(previous), '8:00');
    assert.equal(currentDuration(previous), '8:00');
    assert.equal('corrected_start_at' in result.updates, false);
});

test('rejects invalid intervals, unchanged time or missing reason', () => {
    assert.match(prepareDurationCorrection(original, '7,3', 'Erreur').error, /15 minutes/);
    assert.match(prepareDurationCorrection(original, '7:16', 'Erreur').error, /15 minutes/);
    assert.match(prepareDurationCorrection(original, '0:00', 'Erreur').error, /15 minutes/);
    assert.match(prepareDurationCorrection(original, '25:00', 'Erreur').error, /15 minutes/);
    assert.match(prepareDurationCorrection(original, '8:00', 'Erreur').error, /Aucune modification/);
    assert.match(prepareDurationCorrection(original, '7:15', 'x').error, /motif/);
});

const sites = [{id:12,status:'active'},{id:13,status:'active'},{id:14,status:'archived'}];
const tasks = [{id:138,project_id:12},{id:139,project_id:12},{id:140,project_id:13},{id:141,project_id:14}];
const draft = {hours:'8:00',siteId:'13',taskId:'140',reason:'Erreur de chantier'};
test('reassignment alone preserves exact timestamps and resets approval', () => {
    assert.deepEqual(prepareSessionCorrection(original,draft,sites,tasks).updates,
      {site_id:13,section_id:140,correction_reason:'Erreur de chantier',approved:false});
});
test('task-only correction and combined duration correction', () => {
    assert.equal(prepareSessionCorrection(original,{...draft,siteId:'12',taskId:'139'},sites,tasks).updates.section_id,139);
    assert.equal(prepareSessionCorrection(original,{...draft,hours:'7:15'},sites,tasks).updates.corrected_end_at,'2026-11-16T20:15:00.000Z');
});
test('rejects mismatched task, archived destination and missing reason', () => {
    assert.match(prepareSessionCorrection(original,{...draft,taskId:'138'},sites,tasks).error,/tâche/);
    assert.match(prepareSessionCorrection(original,{...draft,siteId:'14',taskId:'141'},sites,tasks).error,/actif/);
    assert.match(prepareSessionCorrection(original,{...draft,reason:''},sites,tasks).error,/motif/);
    assert.match(prepareSessionCorrection({...original,punch_end_at:null},draft,sites,tasks).error,/Terminez/);
});

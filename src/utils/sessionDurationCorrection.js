import { parseLocalizedHours, isValidQuarterHour, formatHoursHHMM } from './quarterHours.js';

// Clock-in and clock-out timestamps are never modified. This module changes
// only corrected_end_at, relative to the existing effective start timestamp.
export const sessionDurationMinutes = (startAt, endAt) => {
    const start = Date.parse(startAt);
    const end = Date.parse(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return Math.round((end - start) / 60000);
};

export const originalDuration = (session) =>
    durationLabel(sessionDurationMinutes(session.punch_start_at, session.punch_end_at));

export const currentDuration = (session) =>
    durationLabel(sessionDurationMinutes(
        session.corrected_start_at || session.punch_start_at,
        session.corrected_end_at || session.punch_end_at
    ));

const durationLabel = (minutes) => minutes == null
    ? '—'
    : formatHoursHHMM(minutes / 60);

export const prepareDurationCorrection = (session, entered, reason) => {
    const hours = parseLocalizedHours(entered);
    if (!isValidQuarterHour(hours)) {
        return { error: 'Saisissez une durée de 0:15 à 24:00 par tranches de 15 minutes.' };
    }

    const startAt = session.corrected_start_at || session.punch_start_at;
    const previousEndAt = session.corrected_end_at || session.punch_end_at;
    const start = Date.parse(startAt);
    const previousEnd = Date.parse(previousEndAt);
    if (!Number.isFinite(start) || !Number.isFinite(previousEnd)) {
        return { error: 'Les heures originales sont manquantes ou invalides.' };
    }

    const nextMinutes = Math.round(hours * 60);
    const nextEnd = start + nextMinutes * 60000;
    if (Math.abs(nextEnd - previousEnd) < 30000) {
        return { error: 'Aucune modification de durée détectée.' };
    }
    if (String(reason ?? '').trim().length < 3) {
        return { error: 'Indiquez un motif de correction (3 caractères minimum).' };
    }
    return {
        updates: {
            corrected_end_at: new Date(nextEnd).toISOString(),
            correction_reason: String(reason).trim(),
            approved: false,
        },
        correctedDuration: formatHoursHHMM(nextMinutes / 60),
    };
};

 // Reassignment is independent of duration: preserve exact timestamps when unchanged.
export const prepareSessionCorrection = (session, draft, sites, tasks) => {
    const reason = String(draft.reason ?? '').trim();
    const siteChanged = String(draft.siteId ?? '') !== String(session.site_id ?? '');
    const taskChanged = String(draft.taskId ?? '') !== String(session.section_id ?? '');
    const assignmentChanged = siteChanged || taskChanged;
    const unchangedHours = String(draft.hours).trim() === currentDuration(session);
    if (!assignmentChanged && !unchangedHours) return prepareDurationCorrection(session, draft.hours, reason);
    if (!assignmentChanged) return { error: 'Aucune modification détectée.' };
    if (reason.length < 3) return { error: 'Indiquez un motif de correction (3 caractères minimum).' };
    if (!session.punch_end_at) return { error: 'Terminez le pointage avant de le réaffecter.' };
    const site = sites.find(s => String(s.id) === String(draft.siteId));
    const task = tasks.find(t => String(t.id) === String(draft.taskId) && String(t.project_id) === String(draft.siteId));
    if (!site || (siteChanged && ['archived','deleted','inactive'].includes(String(site.status).toLowerCase()))) return { error: 'Sélectionnez un chantier actif.' };
    if (!task) return { error: 'Sélectionnez une tâche du chantier choisi.' };
    const updates = { site_id: site.id, section_id: task.id, correction_reason: reason, approved: false };
    if (!unchangedHours) {
        const duration = prepareDurationCorrection(session, draft.hours, reason);
        if (duration.error && !duration.error.startsWith('Aucune modification')) return duration;
        if (duration.updates) Object.assign(updates, duration.updates);
    }
    return { updates };
};

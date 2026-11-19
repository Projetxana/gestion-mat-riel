/**
 * Numeric entry uses decimal hours ("7,25" = 7 h 15); displayed values
 * use clock-style durations ("7:15"). Both forms remain accepted when saved.
 * These are durations, not times of day, so totals can exceed 24 hours.
 */
export const parseLocalizedHours = (raw) => {
    const text = String(raw ?? '').trim();
    const clock = /^(\d+):([0-5]\d)$/.exec(text);
    if (clock) {
        return Number(clock[1]) + Number(clock[2]) / 60;
    }

    if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) return null;
    const hours = Number(text.replace(',', '.'));
    return Number.isFinite(hours) ? hours : null;
};

export const isValidQuarterHour = (hours) =>
    Number.isFinite(hours) &&
    hours > 0 &&
    hours <= 24 &&
    Number.isInteger(Math.round(hours * 60) / 15) &&
    Math.abs(hours * 60 - Math.round(hours * 60)) < 0.000001;

// The display is always a duration in H:MM, not an hour decimal.
export const formatHoursHHMM = (hours) => {
    if (!Number.isFinite(hours) || hours < 0) return '0:00';
    const minutes = Math.round(hours * 60);
    return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0');
};

// Keep intermediate typing intact ("7," / "7,2"). Once a valid decimal
// quarter is complete, immediately display H:MM without waiting for blur.
export const normalizeHoursInput = (raw) => {
    const text = String(raw ?? '');
    if (/^\d+[,.](?:25|50?|75)$/.test(text.trim())) {
        const hours = parseLocalizedHours(text);
        if (isValidQuarterHour(hours)) return formatHoursHHMM(hours);
    }
    return text;
};

// Retain an exported decimal formatter for any legacy integrations.
export const formatDecimalHours = (hours) =>
    Number(hours).toLocaleString('fr-CA', {
        useGrouping: false,
        maximumFractionDigits: 2,
    });

export const stepQuarterHour = (raw, deltaQuarters) => {
    const parsed = parseLocalizedHours(raw) ?? 0;
    const nextQuarters = Math.max(0, Math.min(96, Math.round(parsed * 4) + deltaQuarters));
    return nextQuarters === 0 ? '' : formatHoursHHMM(nextQuarters / 4);
};

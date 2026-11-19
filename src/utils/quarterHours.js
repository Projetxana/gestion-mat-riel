/**
 * Hours are decimal hours, never HH:MM:
 * 7,25 = 7 h 15, 7,5 = 7 h 30, 7,75 = 7 h 45.
 * Keep parsing independent from input type=number because mobile Safari
 * may report an empty value when the user types a French decimal comma.
 */
export const parseLocalizedHours = (raw) => {
    const text = String(raw ?? '').trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const hours = Number(text);
    return Number.isFinite(hours) ? hours : null;
};

export const isValidQuarterHour = (hours) =>
    Number.isFinite(hours) &&
    hours > 0 &&
    hours <= 24 &&
    Number.isInteger(hours * 4);

export const formatDecimalHours = (hours) =>
    Number(hours).toLocaleString('fr-CA', {
        useGrouping: false,
        maximumFractionDigits: 2,
    });

export const stepQuarterHour = (raw, deltaQuarters) => {
    const parsed = parseLocalizedHours(raw) ?? 0;
    const nextQuarters = Math.max(0, Math.min(96, Math.round(parsed * 4) + deltaQuarters));
    return nextQuarters === 0 ? '' : formatDecimalHours(nextQuarters / 4);
};

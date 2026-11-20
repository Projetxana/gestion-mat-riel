// Display-only grouping for the admin's weekly review.
// All employee/week scoping and the final approval are rechecked in Supabase.
export const effectiveStartAt = (session) =>
    session.corrected_start_at || session.punch_start_at;

export const effectiveEndAt = (session) =>
    session.corrected_end_at || session.punch_end_at;

export const durationInMinutes = (session) => {
    const start = Date.parse(effectiveStartAt(session));
    const end = Date.parse(effectiveEndAt(session));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.round((end - start) / 60000);
};

export const formatDuration = (minutes) => {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
};

export const localDateKey = (timestamp) => {
    const date = new Date(timestamp);
    const pad = value => String(value).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
};

export const groupSessionsByEmployee = (sessions, getUserName) => {
    const map = new Map();
    for (const session of sessions || []) {
        const userId = String(session.user_id || '');
        if (!userId) continue;
        if (!map.has(userId)) {
            map.set(userId, { userId, name: getUserName(userId), sessions: [] });
        }
        map.get(userId).sessions.push(session);
    }

    return [...map.values()].map(group => {
        const sessionsSorted = [...group.sessions].sort((a, b) =>
            Date.parse(effectiveStartAt(a)) - Date.parse(effectiveStartAt(b)));
        const dayMap = new Map();
        let totalMinutes = 0;
        let approvedCount = 0;
        const pendingIds = [];
        for (const session of sessionsSorted) {
            const start = effectiveStartAt(session);
            const dayKey = localDateKey(start);
            if (!dayMap.has(dayKey)) {
                dayMap.set(dayKey, {
                    key: dayKey,
                    label: new Date(start).toLocaleDateString('fr-CA', {
                        weekday: 'long', day: 'numeric', month: 'long'
                    }),
                    sessions: [],
                    totalMinutes: 0,
                });
            }
            const minutes = durationInMinutes(session);
            totalMinutes += minutes;
            dayMap.get(dayKey).totalMinutes += minutes;
            dayMap.get(dayKey).sessions.push(session);
            if (session.approved === true) {
                approvedCount += 1;
            } else {
                pendingIds.push(Number(session.id));
            }
        }
        return {
            userId: group.userId,
            name: group.name,
            sessions: sessionsSorted,
            days: [...dayMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
            totalMinutes,
            approvedCount,
            pendingIds,
            pendingCount: pendingIds.length,
        };
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
};

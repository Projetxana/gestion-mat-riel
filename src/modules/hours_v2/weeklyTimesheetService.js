import { supabase } from '../../supabaseClient';

/**
 * 1. getCurrentWeekRange()
 * Retourne { start: Date, end: Date } (Lundi 00:00 -> Dimanche 23:59)
 * Basé sur la date actuelle.
 */
export const getCurrentWeekRange = () => {
    const now = new Date();
    const day = now.getDay(); // 0 (Sun) to 6 (Sat)

    // Calculate Monday
    // If today is Sunday (0), go back 6 days. Else go back day-1.
    const diffToMonday = day === 0 ? 6 : day - 1;

    const start = new Date(now);
    start.setDate(now.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

/**
 * 2. buildWeeklySnapshot()
 * Lit time_sessions, groupe, calcule, crée/met à jour weekly_timesheets et entries.
 * @param {string} userId - ID de l'utilisateur (Optionnel, sinon tous ?) -> On suppose par USER pour l'instant ou global ?
 * Le prompt dit "Lire time_sessions de la semaine", "Grouper par user_id...".
 * On va le faire pour TOUS les users actifs si userId n'est pas fourni, ou juste un.
 * Pour simplifier et être robuste, on va traiter UNE date de référence (par défaut today).
 */
export const buildWeeklySnapshot = async (referenceDate = new Date()) => {
    // 1. Get Range for the reference date
    const day = referenceDate.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const start = new Date(referenceDate);
    start.setDate(referenceDate.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    // 2. Fetch all time_sessions for this range
    const { data: sessions, error } = await supabase
        .from('time_sessions')
        .select('user_id, site_id, section_id, punch_start_at, punch_end_at, manual_entry')
        .gte('punch_start_at', start.toISOString())
        .lte('punch_start_at', end.toISOString());

    if (error) throw error;
    if (!sessions || sessions.length === 0) return { message: 'No sessions found' };

    // 3. Group by user_id -> site_id -> section_id
    const grouped = {};

    sessions.forEach(session => {
        if (!session.punch_end_at) return; // Skip active sessions (snapshot takes completed only?) OR calc until now?
        // Prompt says "Calculer heures = (end - start)". Implies completed.

        const userId = session.user_id;
        const siteId = session.site_id || 'unknown';
        const sectionId = session.section_id || 'unknown';
        const source = session.manual_entry ? 'manual' : 'punch';

        if (!grouped[userId]) grouped[userId] = [];

        // Find existing entry in group
        let entry = grouped[userId].find(e => e.site_id === siteId && e.section_id === sectionId && e.source === source);

        if (!entry) {
            entry = { site_id: siteId, section_id: sectionId, source, totalMs: 0 };
            grouped[userId].push(entry);
        }

        const duration = new Date(session.punch_end_at) - new Date(session.punch_start_at);
        entry.totalMs += duration;
    });

    const { data: companyId } = await supabase.rpc('get_user_company_id');

    const results = [];

    // 4. Process each user
    for (const userId of Object.keys(grouped)) {
        // A. Check/Create Weekly Timesheet
        // Check if exists
        const { data: existing, error: findError } = await supabase
            .from('weekly_timesheets')
            .select('id, leader_validated, admin_validated')
            .eq('user_id', userId)
            .eq('week_start', start.toISOString()) // exact match on start? or range? usually date match
            .single(); // might return null or error

        let timesheetId;

        // Date only string for DB? or ISO? DB is DATE type. ISO string usually works if YYYY-MM-DD.
        // Let's format to YYYY-MM-DD for safety if type is DATE.
        const weekStartStr = start.toISOString().split('T')[0];
        const weekEndStr = end.toISOString().split('T')[0];

        if (existing) {
            // IF VALIDATED, DO NOT TOUCH? Prompt doesn't say.
            // "validateByAdmin... Seulement si..." implies workflow.
            // If validated, maybe we shouldn't overwrite?
            // "C'est un SNAPSHOT".
            if (existing.leader_validated || existing.admin_validated) {
                console.log(`Skipping validated timesheet for user ${userId}`);
                continue;
            }
            timesheetId = existing.id;

            // Delete old entries to rebuild snapshot
            await supabase.from('weekly_timesheet_entries').delete().eq('timesheet_id', timesheetId);
        } else {
            // Create
            const { data: newTs, error: createError } = await supabase
                .from('weekly_timesheets')
                .insert([{
                    user_id: userId,
                    week_start: weekStartStr,
                    week_end: weekEndStr,
                    leader_validated: false,
                    admin_validated: false,
                    company_id: companyId ?? null
                }])
                .select()
                .single();

            if (createError) throw createError;
            timesheetId = newTs.id;
        }

        // B. Insert Entries
        const entriesPayload = grouped[userId].map(g => ({
            timesheet_id: timesheetId,
            site_id: g.site_id === 'unknown' ? null : g.site_id,
            section_id: g.section_id === 'unknown' ? null : g.section_id,
            source: g.source,
            hours: Number((g.totalMs / (1000 * 60 * 60)).toFixed(2)),
            company_id: companyId ?? null
        }));

        if (entriesPayload.length > 0) {
            const { error: insertError } = await supabase
                .from('weekly_timesheet_entries')
                .insert(entriesPayload);

            if (insertError) throw insertError;
        }

        results.push({ userId, entries: entriesPayload.length });
    }

    return results;
};

/**
 * 3. getWeeklyTimesheetForUser(user_id)
 * Retourne toutes les entrées + total heures
 */
export const getWeeklyTimesheetForUser = async (userId, weekStart = null) => {
    // Determine week
    let weekStartStr;
    if (weekStart) {
        weekStartStr = weekStart; // Expecting YYYY-MM-DD
    } else {
        const { start } = getCurrentWeekRange();
        weekStartStr = start.toISOString().split('T')[0];
    }

    // Fetch Timesheet
    const { data: timesheet, error } = await supabase
        .from('weekly_timesheets')
        .select(`
            *,
            weekly_timesheet_entries (*)
        `)
        .eq('user_id', userId)
        .eq('week_start', weekStartStr)
        .single();

    if (error) return { error: error.message };
    if (!timesheet) return { message: 'No timesheet found' };

    // Calculate Total
    const totalHours = timesheet.weekly_timesheet_entries.reduce((acc, entry) => acc + (Number(entry.hours) || 0), 0);

    return {
        ...timesheet,
        total_hours: Number(totalHours.toFixed(2))
    };
};

/**
 * 4. validateByLeader(timesheet_id, user)
 * Passe leader_validated à true + timestamp
 * Condition: user.role === 'user' && user.level === 'chef_equipe'
 */
export const validateByLeader = async (timesheetId, user) => {
    // STRICT RULE: Only 'chef_equipe' can validate (or legacy 'leader' role)
    if (!user || !((user.role === 'user' && user.level === 'chef_equipe') || user.role === 'leader')) {
        return { error: 'Action non autorisée. Réservé aux Chefs d\'équipe.' };
    }

    const { data, error } = await supabase
        .from('weekly_timesheets')
        .update({
            leader_validated: true,
            leader_validated_at: new Date().toISOString()
        })
        .eq('id', timesheetId)
        .select()
        .single();

    if (error) return { error: error.message };
    return { success: true, timesheet: data };
};

/**
 * 5. validateByAdmin(timesheet_id, user)
 * Seulement si leader_validated = true
 * Condition: user.role === 'admin'
 */
export const validateByAdmin = async (timesheetId, user) => {
    if (!user || user.role !== 'admin') {
        return { error: 'Action non autorisée. Réservé aux Administrateurs.' };
    }

    // Check first
    const { data: current, error: fetchError } = await supabase
        .from('weekly_timesheets')
        .select('leader_validated')
        .eq('id', timesheetId)
        .single();

    if (fetchError) return { error: fetchError.message };
    if (!current.leader_validated) {
        return { error: 'Validation Leader requise avant validation Admin.' };
    }

    const { data, error } = await supabase
        .from('weekly_timesheets')
        .update({
            admin_validated: true,
            admin_validated_at: new Date().toISOString()
        })
        .eq('id', timesheetId)
        .select()
        .single();

    if (error) return { error: error.message };
    return { success: true, timesheet: data };
};

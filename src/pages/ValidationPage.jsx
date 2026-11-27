import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Pencil, ShieldCheck, X, ChevronDown, ChevronUp, UsersRound, Trash2 } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { groupSessionsByEmployee, formatDuration } from '../utils/weeklyApproval';
import { originalDuration, currentDuration, prepareSessionCorrection } from '../utils/sessionDurationCorrection';
import { parseLocalizedHours, isValidQuarterHour, formatHoursHHMM, normalizeHoursInput } from '../utils/quarterHours';

const mondayOf = (date) => {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    return day;
};

const displayDate = (date) => new Date(date).toLocaleDateString('fr-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
});

const hoursDuration = (start, end) => {
    if (!start || !end) return '—';
    const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
    if (!Number.isFinite(minutes) || minutes <= 0) return '—';
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

const effectiveStart = (session) => session.corrected_start_at || session.punch_start_at;
const effectiveEnd = (session) => session.corrected_end_at || session.punch_end_at;

export default function ValidationPage() {
    const {
        currentUser, currentCompanyId, companyRoleLoading,
        users, sites, projectTasks, mergeTimeSessions, deleteTimeSession,
    } = useAppContext();
    const isAdmin = currentUser?.role === 'admin';
    const [week, setWeek] = useState(() => mondayOf(new Date()));
    const [filter, setFilter] = useState('pending');
    const [expandedUser, setExpandedUser] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    const deleteLock = React.useRef(false);
    const [draft, setDraft] = useState(null);
    const [audit, setAudit] = useState([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const weekEnd = useMemo(() => {
        const date = new Date(week);
        date.setDate(date.getDate() + 7);
        return date;
    }, [week]);

    const getUserName = useCallback((id) => {
        const item = (users || []).find((user) =>
            String(user.auth_user_id || '') === String(id) || String(user.id) === String(id));
        return item?.name || item?.email || 'Employé non identifié';
    }, [users]);

    const loadSessions = useCallback(async () => {
        if (!isAdmin || !currentCompanyId) return;
        setLoading(true);
        setError('');
        // DB applies the same effective-start week boundaries used for atomic
        // approval. A corrected date can move an entry between weeks.
        const { data, error: loadError } = await supabase.rpc('bt_review_week_sessions', {
            p_company_id: currentCompanyId,
            p_week_start: week.toISOString(),
            p_week_end: weekEnd.toISOString(),
        });
        if (loadError) {
            setError('Impossible de charger les pointages : ' + loadError.message);
        } else {
            setRows(data || []);
        }
        setLoading(false);
    }, [isAdmin, currentCompanyId, week, weekEnd]);

    useEffect(() => {
        setDeleteTarget(null);
        setDeleteError('');
        void loadSessions();
    }, [loadSessions]);

    const employeeGroups = useMemo(
        () => groupSessionsByEmployee(rows, getUserName),
        [rows, getUserName]
    );
    const pendingGroups = useMemo(
        () => employeeGroups.filter(group => group.pendingCount > 0),
        [employeeGroups]
    );
    const approvedGroups = useMemo(
        () => employeeGroups.filter(group => group.pendingCount === 0),
        [employeeGroups]
    );
    const displayed = filter === 'approved' ? approvedGroups : pendingGroups;

    const refreshRow = (updated) => {
        setRows(previous => previous.map(row =>
            String(row.id) === String(updated.id) ? updated : row
        ));
        mergeTimeSessions([updated]);
    };

    const readAudit = async (sessionId) => {
        const { data, error: auditError } = await supabase
            .from('bt_time_session_audit')
            .select('id, action, reason, created_at, before_values, after_values')
            .eq('company_id', currentCompanyId)
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false })
            .limit(8);
        if (auditError) {
            setError('Historique des corrections indisponible : ' + auditError.message);
        }
        setAudit(data || []);
    };

    const openEditor = (session) => {
        setError('');
        setMessage('');
        setEditingId(session.id);
        setDraft({
            hours: currentDuration(session),
            siteId: String(session.site_id ?? ''),
            taskId: String(session.section_id ?? ''),
            reason: '',
        });
        void readAudit(session.id);
    };

    const saveCorrection = async (session) => {
        if (!isAdmin || !draft || busyId != null) return;
        setError('');
        setMessage('');

        const prepared = prepareSessionCorrection(session, draft, (sites || []).filter(s => String(s.company_id) === String(currentCompanyId)), projectTasks || []);
        if (prepared.error) {
            setError(prepared.error);
            return;
        }
        setBusyId(session.id);
        const updates = prepared.updates;
        const { data, error: saveError } = await supabase.from('time_sessions')
            .update(updates)
            .eq('id', session.id)
            .eq('company_id', currentCompanyId)
            .select('*');
        setBusyId(null);
        if (saveError || data?.length !== 1) {
            setError(saveError?.message || 'Correction non confirmée : aucune ligne modifiée.');
            return;
        }
        refreshRow(data[0]);
        setEditingId(null);
        setDraft(null);
        setMessage('Correction enregistrée, pointage placé en attente de validation.');
        setFilter('pending');
        setExpandedUser(String(session.user_id));
    };

    const requestDelete = (session) => {
        if (!isAdmin || !currentCompanyId || busyId != null || editingId != null || loading ||
            session.approved === true || !session.punch_end_at ||
            String(session.company_id) !== String(currentCompanyId)) return;
        setDeleteError('');
        setError('');
        setMessage('');
        setDeleteTarget(session);
    };

    const removePendingSession = async () => {
        const session = deleteTarget;
        if (!session || deleteLock.current || !isAdmin || !currentCompanyId ||
            busyId != null || editingId != null || loading ||
            session.approved === true || !session.punch_end_at ||
            String(session.company_id) !== String(currentCompanyId)) return;
        deleteLock.current = true;
        setBusyId('delete:' + session.id);
        setDeleteError('');
        setError('');
        setMessage('');
        try {
            const result = await deleteTimeSession(session.id, session);
            if (!result?.success) {
                setDeleteError(result?.error || 'Suppression non confirmée. Annulez puis actualisez avant de réessayer.');
                return;
            }
            setRows(previous => previous.filter(row => String(row.id) !== String(session.id)));
            setDeleteTarget(null);
            await loadSessions();
            setMessage('Saisie supprimée. Les totaux ont été actualisés.');
        } catch (caught) {
            setDeleteError(caught?.message || 'Impossible de supprimer la saisie.');
        } finally {
            deleteLock.current = false;
            setBusyId(null);
        }
    };

    const approveWeek = async (group) => {
        if (!isAdmin || busyId != null || group.pendingCount === 0 || editingId != null || deleteTarget != null) return;
        const messageText = 'Valider la semaine de ' + group.name
            + ' ?\n' + group.pendingCount + ' saisie(s) en attente, '
            + formatDuration(group.totalMinutes) + ' h au total.\n'
            + 'La validation concerne uniquement les entrées encore en attente.';
        if (!window.confirm(messageText)) return;
        setBusyId('week:' + group.userId);
        setError('');
        setMessage('');
        try {
            const { data, error: updateError } = await supabase.rpc('bt_approve_employee_week', {
                p_company_id: currentCompanyId,
                p_employee_id: group.userId,
                p_week_start: week.toISOString(),
                p_week_end: weekEnd.toISOString(),
                p_expected_ids: group.pendingIds,
            });
            if (updateError || Number(data) !== group.pendingCount) {
                setError(updateError?.message || 'Validation non confirmée. Actualisez puis réessayez.');
                await loadSessions();
                return;
            }
            await loadSessions();
            setExpandedUser(null);
            setMessage(group.pendingCount + ' saisie(s) validée(s) pour ' + group.name + '.');
        } catch (caught) {
            setError(caught?.message || 'Erreur de validation de la semaine.');
        } finally {
            setBusyId(null);
        }
    };

    if (companyRoleLoading || !currentCompanyId) {
        return <p className="p-6 text-slate-300">Chargement de l'entreprise…</p>;
    }
    if (!isAdmin) return <Navigate to="/timetracking" replace />;

    const siteName = id => (sites || []).find(s => String(s.id) === String(id))?.name || 'Chantier inconnu';
    const taskName = id => (projectTasks || []).find(t => String(t.id) === String(id))?.name || 'Tâche non identifiée';

    return (
        <div className="mx-auto max-w-5xl px-3 sm:px-5 pb-28 space-y-5 text-slate-100">
            <header className="flex flex-wrap justify-between items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex gap-2 items-center"><ShieldCheck className="text-blue-400" /> Validation des heures</h1>
                    <p className="text-sm text-slate-400 mt-1">Une carte par employé · Détails et corrections sur demande</p>
                </div>
                <Link to="/timetracking" className="text-blue-300 hover:underline text-sm">Retour aux heures</Link>
            </header>

            <div className="rounded-xl bg-slate-800 p-3 flex items-center justify-between gap-2">
                <button type="button" className="rounded-lg bg-slate-700 min-h-11 px-4" onClick={() => setWeek(previous => {
                    const value = new Date(previous); value.setDate(value.getDate() - 7); return value;
                })} disabled={busyId != null || deleteTarget != null} aria-label="Semaine précédente">←</button>
                <span className="text-center text-sm font-semibold">
                    {displayDate(week)} – {displayDate(new Date(weekEnd.getTime() - 86400000))}
                </span>
                <button type="button" className="rounded-lg bg-slate-700 min-h-11 px-4" onClick={() => setWeek(previous => {
                    const value = new Date(previous); value.setDate(value.getDate() + 7); return value;
                })} disabled={busyId != null || deleteTarget != null} aria-label="Semaine suivante">→</button>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <button type="button" disabled={busyId != null || deleteTarget != null} onClick={() => { setFilter('pending'); setEditingId(null); setExpandedUser(null); }}
                    aria-pressed={filter === 'pending'}
                    className={`px-4 py-2.5 rounded-lg font-semibold ${filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    À valider ({pendingGroups.length})
                </button>
                <button type="button" disabled={busyId != null || deleteTarget != null} onClick={() => { setFilter('approved'); setEditingId(null); setExpandedUser(null); }}
                    aria-pressed={filter === 'approved'}
                    className={`px-4 py-2.5 rounded-lg font-semibold ${filter === 'approved' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    Validées ({approvedGroups.length})
                </button>
                <button type="button" disabled={busyId != null || deleteTarget != null} onClick={() => void loadSessions()} className="ml-auto text-sm text-blue-300 underline">Actualiser</button>
            </div>

            {error && <p role="alert" className="rounded-lg bg-red-950/60 border border-red-900 p-3 text-red-200">{error}</p>}
            {message && <p role="status" className="rounded-lg bg-emerald-950/40 p-3 text-emerald-200">{message}</p>}
            {loading && <p role="status" className="text-slate-400">Chargement des heures…</p>}

            {!loading && displayed.length === 0 &&
                <p className="rounded-xl bg-slate-800 p-6 text-slate-300">Aucun employé {filter === 'pending' ? 'en attente de validation' : 'avec une semaine entièrement validée'} pour cette semaine.</p>}


            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                <UsersRound size={17} />
                <span>{displayed.length} employé(s) · {formatDuration(displayed.reduce((sum, group) => sum + group.totalMinutes, 0))} h</span>
                <span className="text-slate-500">Clique sur un employé pour afficher et corriger ses journées.</span>
            </div>
            <div className="space-y-3">
                {displayed.map(group => {
                    const expanded = expandedUser === group.userId;
                    const regionId = 'weekly-review-' + group.userId.replace(/[^a-zA-Z0-9_-]/g,'');
                    return (
                        <section key={group.userId} className="rounded-xl border border-slate-700 bg-slate-800/90 overflow-hidden">
                            <div className="flex flex-col sm:flex-row sm:items-stretch gap-2 p-3 sm:p-4">
                                <button type="button"
                                    aria-expanded={expanded}
                                    disabled={busyId != null || deleteTarget != null}
                                    aria-controls={regionId}
                                    onClick={() => {
                                        setExpandedUser(previous => previous === group.userId ? null : group.userId);
                                        setEditingId(null);
                                        setDraft(null);
                                    }}
                                    className="flex-1 flex flex-wrap items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-slate-700/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 min-h-12"
                                >
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <span className="text-lg font-bold text-white">{group.name}</span>
                                        <span className="text-sm text-slate-400">
                                            {group.days.length} jour(s) · {group.sessions.length} saisie(s)
                                            {group.pendingCount > 0 && group.approvedCount > 0 ? ' · ' + group.approvedCount + ' déjà validée(s)' : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <div className="text-xl font-bold text-white tabular-nums">{formatDuration(group.totalMinutes)} h</div>
                                            <div className={group.pendingCount > 0 ? 'text-xs font-semibold text-amber-300' : 'text-xs font-semibold text-emerald-300'}>
                                                {group.pendingCount > 0 ? group.pendingCount + ' à valider' : 'Semaine validée'}
                                            </div>
                                        </div>
                                        {expanded ? <ChevronUp size={21} className="text-blue-300" /> : <ChevronDown size={21} className="text-blue-300" />}
                                    </div>
                                </button>
                                {group.pendingCount > 0 && (
                                    <button type="button"
                                        disabled={busyId != null || editingId != null || deleteTarget != null || loading}
                                        onClick={() => void approveWeek(group)}
                                        className="sm:self-center min-h-11 rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                                    >
                                        <CheckCircle2 size={17} className="inline mr-2" />
                                        {busyId === 'week:' + group.userId ? 'Validation…' : 'Valider la semaine'}
                                    </button>
                                )}
                            </div>
                            {expanded && (
                                <div id={regionId} className="border-t border-slate-700/70 px-3 pb-4 pt-3 sm:px-5 space-y-4">
                                    {group.days.map(day => (
                                        <div key={day.key} className="space-y-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-300">
                                                <h3 className="font-semibold capitalize">{day.label}</h3>
                                                <strong className="tabular-nums">{formatDuration(day.totalMinutes)} h</strong>
                                            </div>
                                            {day.sessions.map(session => {
                    const start = effectiveStart(session);
                    const end = effectiveEnd(session);
                    const corrected = Boolean(session.corrected_start_at || session.corrected_end_at || session.correction_reason);
                    const isEditing = editingId === session.id && draft;
                    return (
                        <section key={session.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 sm:p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <h2 className="font-bold">{getUserName(session.user_id)}</h2>
                                        {corrected && <span className="rounded-md bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">Corrigée</span>}
                                        {session.manual_entry && <span className="text-xs text-slate-400">Saisie manuelle</span>}
                                    </div>
                                    <p className="text-sm text-slate-300">{siteName(session.site_id)} · {taskName(session.section_id)}</p>
                                    <p className="text-xs text-slate-400">{displayDate(start)} · {new Date(start).toLocaleTimeString('fr-CA', {hour:'2-digit',minute:'2-digit'})} – {new Date(end).toLocaleTimeString('fr-CA', {hour:'2-digit',minute:'2-digit'})}</p>
                                </div>
                                <strong className="flex gap-1.5 items-center text-lg"><Clock size={17} className="text-blue-300" /> {hoursDuration(start, end)}</strong>
                            </div>

                            {session.correction_reason && <p className="text-xs text-amber-200">Dernier motif : {session.correction_reason}</p>}
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={busyId != null || deleteTarget != null}
                                    onClick={() => isEditing ? (setEditingId(null), setDraft(null)) : openEditor(session)}
                                    className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-slate-100 font-semibold disabled:opacity-50">
                                    <Pencil size={15} className="inline mr-1" /> {isEditing ? 'Fermer la correction' : 'Corriger'}
                                </button>
                                {session.approved !== true && session.punch_end_at && String(session.company_id) === String(currentCompanyId) && (
                                    <button type="button" disabled={busyId != null || editingId != null || loading || deleteTarget != null}
                                        onClick={() => requestDelete(session)}
                                        aria-label={'Supprimer la saisie de ' + getUserName(session.user_id) + ' du ' + displayDate(start) + ' de ' + hoursDuration(start, end) + ' h'}
                                        className="min-h-11 rounded-lg border border-red-800 px-4 py-2 text-red-300 font-semibold hover:bg-red-950/50 disabled:opacity-50">
                                        <Trash2 size={16} className="inline mr-1" /> {busyId === 'delete:' + session.id ? 'Suppression…' : 'Supprimer'}
                                    </button>
                                )}
                                <span className={session.approved === true
                                    ? 'rounded-lg bg-emerald-950/50 px-3 py-2 text-sm font-semibold text-emerald-300'
                                    : 'rounded-lg bg-amber-950/40 px-3 py-2 text-sm font-semibold text-amber-300'}>
                                    {session.approved === true ? 'Validée' : 'En attente'}
                                </span>
                            </div>

                            {deleteTarget && String(deleteTarget.id) === String(session.id) && (
                                <div role="group" aria-label="Confirmation de suppression"
                                    className="rounded-lg border border-red-700 bg-red-950/40 p-3 space-y-3">
                                    <p className="font-semibold text-red-200">Supprimer définitivement cette saisie ?</p>
                                    <p className="text-sm text-slate-200">{getUserName(session.user_id)} · {displayDate(start)} · {hoursDuration(start, end)} h</p>
                                    <p className="text-sm text-slate-300">Les autres saisies seront conservées. Les heures consommées seront recalculées.</p>
                                    {deleteError && <p role="alert" className="text-sm text-red-200 break-words">{deleteError}</p>}
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" disabled={busyId != null || loading}
                                            onClick={() => void removePendingSession()}
                                            className="min-h-11 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                                            {busyId === 'delete:' + session.id ? 'Suppression…' : 'Confirmer la suppression'}
                                        </button>
                                        <button type="button" disabled={busyId != null}
                                            onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                                            className="min-h-11 rounded-lg bg-slate-700 px-4 py-2 font-semibold disabled:opacity-50">
                                            Annuler
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isEditing && <div className="border-t border-slate-700 pt-4 space-y-3">
                                <p className="text-sm text-slate-300">
                                    Corrige la durée, le chantier ou la tâche. La date et l’employé restent inchangés. Le pointage sera à nouveau soumis à validation.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="text-sm flex flex-col gap-1">Chantier
                                        <select value={draft.siteId} disabled={busyId != null}
                                            onChange={event => setDraft(previous => ({ ...previous, siteId: event.target.value, taskId: '' }))}
                                            className="min-h-11 rounded-lg bg-slate-950 border border-slate-600 p-2 text-white">
                                            <option value="">Sélectionner un chantier</option>
                                            {(sites || []).filter(s => String(s.company_id) === String(currentCompanyId) && (String(s.id) === String(session.site_id) || !['archived','deleted','inactive'].includes(String(s.status).toLowerCase()))).map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-sm flex flex-col gap-1">Tâche
                                        <select value={draft.taskId} disabled={busyId != null || !draft.siteId}
                                            onChange={event => setDraft(previous => ({ ...previous, taskId: event.target.value }))}
                                            className="min-h-11 rounded-lg bg-slate-950 border border-slate-600 p-2 text-white">
                                            <option value="">Sélectionner une tâche</option>
                                            {(projectTasks || []).filter(t => String(t.project_id) === draft.siteId).map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                                        </select>
                                    </label>
                                </div>
                                <div className="space-y-3 rounded-xl bg-slate-800/70 p-3 sm:p-4">
                                    <div className="flex items-center justify-between gap-3 border-b border-slate-700 pb-3">
                                        <span className="text-sm font-medium text-slate-300">Heures saisies</span>
                                        <strong className="text-xl tabular-nums text-slate-100">{originalDuration(session)} h</strong>
                                    </div>
                                    <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-slate-200">
                                        <span>Heures corrigées</span>
                                        <span className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                aria-label="Heures corrigées de la journée"
                                                value={draft.hours}
                                                onChange={event => setDraft(previous => ({
                                                    ...previous, hours: normalizeHoursInput(event.target.value),
                                                }))}
                                                onBlur={() => {
                                                    const value = parseLocalizedHours(draft.hours);
                                                    if (isValidQuarterHour(value)) {
                                                        setDraft(previous => ({
                                                            ...previous, hours: formatHoursHHMM(value),
                                                        }));
                                                    }
                                                }}
                                                placeholder="8:00"
                                                className="min-h-11 w-28 rounded-lg border border-slate-500 bg-slate-950 p-2 text-center text-lg font-bold tabular-nums text-white"
                                            />
                                            <span className="text-slate-400">h</span>
                                        </span>
                                    </label>
                                </div>
                                <label className="text-sm flex flex-col gap-1">Motif de correction (obligatoire)
                                    <textarea rows={2} required value={draft.reason}
                                        onChange={event => setDraft(previous => ({ ...previous, reason: event.target.value }))}
                                        placeholder="Ex. Mauvais chantier ou heure de fin mal saisie"
                                        className="rounded-lg bg-slate-950 border border-slate-600 p-3 text-white" />
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" disabled={busyId != null}
                                        onClick={() => void saveCorrection(session)}
                                        className="min-h-11 rounded-lg bg-blue-600 px-5 py-2 font-semibold disabled:opacity-50">
                                        {busyId === session.id ? 'Enregistrement…' : 'Enregistrer la correction'}
                                    </button>
                                    <button type="button" disabled={busyId != null}
                                        onClick={() => { setEditingId(null); setDraft(null); }}
                                        className="min-h-11 rounded-lg bg-slate-700 px-4 py-2 flex items-center gap-2"><X size={16}/> Annuler</button>
                                </div>
                                {audit.length > 0 && <div className="border-t border-slate-700 pt-3">
                                    <h3 className="text-sm font-semibold text-slate-200 mb-2">Historique des interventions</h3>
                                    {audit.map(entry => <p key={entry.id} className="text-xs text-slate-400 py-1">
                                        {displayDate(entry.created_at)} · {entry.action === 'corrected' ? 'Correction' : entry.action === 'approved' ? 'Validation' : 'Retour en attente'}
                                        {entry.reason ? ` — ${entry.reason}` : ''}
                                        {entry.before_values && entry.after_values && (String(entry.before_values.site_id) !== String(entry.after_values.site_id) || String(entry.before_values.section_id) !== String(entry.after_values.section_id)) && <span className="block">{siteName(entry.before_values.site_id)} · {taskName(entry.before_values.section_id)} → {siteName(entry.after_values.site_id)} · {taskName(entry.after_values.section_id)}</span>}
                                    </p>)}
                                </div>}
                            </div>}
                        </section>
                    );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
            <p className="text-xs text-slate-500">Seul un administrateur de l'entreprise peut corriger, valider ou supprimer depuis cet écran. Seules les saisies terminées en attente peuvent être supprimées ici. L'historique des corrections est conservé dans Supabase.</p>
        </div>
    );
}

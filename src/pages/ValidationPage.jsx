import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Pencil, ShieldCheck, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';

const mondayOf = (date) => {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    return day;
};

const displayDate = (date) => new Date(date).toLocaleDateString('fr-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
});

const localInputDateTime = (date) => {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

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
        users, sites, projectTasks, mergeTimeSessions,
    } = useAppContext();
    const isAdmin = currentUser?.role === 'admin';
    const [week, setWeek] = useState(() => mondayOf(new Date()));
    const [filter, setFilter] = useState('pending');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [editingId, setEditingId] = useState(null);
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
        const { data, error: loadError } = await supabase
            .from('time_sessions')
            .select('*')
            .eq('company_id', currentCompanyId)
            .gte('punch_start_at', week.toISOString())
            .lt('punch_start_at', weekEnd.toISOString())
            .not('punch_end_at', 'is', null)
            .order('punch_start_at', { ascending: false });
        if (loadError) {
            setError('Impossible de charger les pointages : ' + loadError.message);
        } else {
            setRows(data || []);
        }
        setLoading(false);
    }, [isAdmin, currentCompanyId, week, weekEnd]);

    useEffect(() => {
        void loadSessions();
    }, [loadSessions]);

    const displayed = useMemo(() => rows.filter(row =>
        filter === 'approved' ? row.approved === true : row.approved !== true
    ), [rows, filter]);

    const refreshRow = (updated) => {
        setRows(previous => previous.map(row =>
            String(row.id) === String(updated.id) ? updated : row
        ));
        mergeTimeSessions([updated]);
    };

    const readAudit = async (sessionId) => {
        const { data, error: auditError } = await supabase
            .from('bt_time_session_audit')
            .select('id, action, reason, created_at')
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
            start: localInputDateTime(effectiveStart(session)),
            end: localInputDateTime(effectiveEnd(session)),
            siteId: String(session.site_id || ''),
            sectionId: String(session.section_id || ''),
            reason: '',
        });
        void readAudit(session.id);
    };

    const updateDraftSite = (siteId) =>
        setDraft(previous => ({ ...previous, siteId, sectionId: '' }));

    const saveCorrection = async (session) => {
        if (!isAdmin || !draft || busyId != null) return;
        setError('');
        setMessage('');
        const start = new Date(draft.start);
        const end = new Date(draft.end);
        const durationMs = end.getTime() - start.getTime();
        if (!draft.start || !draft.end || !Number.isFinite(durationMs)
            || durationMs <= 0 || durationMs > 24 * 3600000) {
            setError('Vérifie les dates et les heures : la durée doit être comprise entre 1 minute et 24 heures.');
            return;
        }
        if (!draft.siteId || !draft.sectionId || !(projectTasks || []).some(task =>
            String(task.id) === draft.sectionId && String(task.project_id) === draft.siteId)) {
            setError('Choisis un chantier et une tâche appartenant à ce chantier.');
            return;
        }
        if (draft.reason.trim().length < 3) {
            setError('Indique le motif de la correction (3 caractères minimum).');
            return;
        }
        const didChange = start.getTime() !== new Date(effectiveStart(session)).getTime()
            || end.getTime() !== new Date(effectiveEnd(session)).getTime()
            || draft.siteId !== String(session.site_id || '')
            || draft.sectionId !== String(session.section_id || '');
        if (!didChange) {
            setError('Aucune modification détectée.');
            return;
        }
        setBusyId(session.id);
        const updates = {
            corrected_start_at: start.toISOString(),
            corrected_end_at: end.toISOString(),
            site_id: Number(draft.siteId),
            section_id: Number(draft.sectionId),
            correction_reason: draft.reason.trim(),
            approved: false,
        };
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
    };

    const approve = async (session) => {
        if (!isAdmin || busyId != null) return;
        if (!window.confirm(`Valider les heures de ${getUserName(session.user_id)} (${hoursDuration(effectiveStart(session), effectiveEnd(session))}) ?`)) return;
        setBusyId(session.id);
        setError('');
        setMessage('');
        const { data, error: updateError } = await supabase.from('time_sessions')
            .update({ approved: true })
            .eq('id', session.id)
            .eq('company_id', currentCompanyId)
            .select('*');
        setBusyId(null);
        if (updateError || data?.length !== 1) {
            setError(updateError?.message || 'Validation non confirmée par le serveur.');
            return;
        }
        refreshRow(data[0]);
        setMessage('Heures validées par un administrateur.');
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
                    <p className="text-sm text-slate-400 mt-1">Accès administrateur · Correction avec historique et motif obligatoire</p>
                </div>
                <Link to="/timetracking" className="text-blue-300 hover:underline text-sm">Retour aux heures</Link>
            </header>

            <div className="rounded-xl bg-slate-800 p-3 flex items-center justify-between gap-2">
                <button type="button" className="rounded-lg bg-slate-700 min-h-11 px-4" onClick={() => setWeek(previous => {
                    const value = new Date(previous); value.setDate(value.getDate() - 7); return value;
                })} aria-label="Semaine précédente">←</button>
                <span className="text-center text-sm font-semibold">
                    {displayDate(week)} – {displayDate(new Date(weekEnd.getTime() - 86400000))}
                </span>
                <button type="button" className="rounded-lg bg-slate-700 min-h-11 px-4" onClick={() => setWeek(previous => {
                    const value = new Date(previous); value.setDate(value.getDate() + 7); return value;
                })} aria-label="Semaine suivante">→</button>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => { setFilter('pending'); setEditingId(null); }}
                    aria-pressed={filter === 'pending'}
                    className={`px-4 py-2.5 rounded-lg font-semibold ${filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    À valider ({rows.filter(row => row.approved !== true).length})
                </button>
                <button type="button" onClick={() => { setFilter('approved'); setEditingId(null); }}
                    aria-pressed={filter === 'approved'}
                    className={`px-4 py-2.5 rounded-lg font-semibold ${filter === 'approved' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    Validées ({rows.filter(row => row.approved === true).length})
                </button>
                <button type="button" onClick={() => void loadSessions()} className="ml-auto text-sm text-blue-300 underline">Actualiser</button>
            </div>

            {error && <p role="alert" className="rounded-lg bg-red-950/60 border border-red-900 p-3 text-red-200">{error}</p>}
            {message && <p role="status" className="rounded-lg bg-emerald-950/40 p-3 text-emerald-200">{message}</p>}
            {loading && <p role="status" className="text-slate-400">Chargement des heures…</p>}

            {!loading && displayed.length === 0 &&
                <p className="rounded-xl bg-slate-800 p-6 text-slate-300">Aucune session {filter === 'pending' ? 'en attente' : 'validée'} pour cette semaine.</p>}

            <div className="space-y-3">
                {displayed.map(session => {
                    const start = effectiveStart(session);
                    const end = effectiveEnd(session);
                    const corrected = Boolean(session.corrected_start_at || session.corrected_end_at);
                    const isEditing = editingId === session.id && draft;
                    const tasksForSite = (projectTasks || []).filter(t => String(t.project_id) === draft?.siteId);
                    return (
                        <section key={session.id} className="rounded-xl border border-slate-700 bg-slate-800/90 p-4 space-y-3">
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
                                <button type="button" disabled={busyId != null}
                                    onClick={() => isEditing ? (setEditingId(null), setDraft(null)) : openEditor(session)}
                                    className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-slate-100 font-semibold disabled:opacity-50">
                                    <Pencil size={15} className="inline mr-1" /> {isEditing ? 'Fermer la correction' : 'Corriger'}
                                </button>
                                {session.approved !== true && <button type="button" disabled={busyId != null}
                                    onClick={() => void approve(session)}
                                    className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-white font-semibold disabled:opacity-50">
                                    <CheckCircle2 size={16} className="inline mr-1" /> {busyId === session.id ? 'Validation…' : 'Valider'}
                                </button>}
                            </div>

                            {isEditing && <div className="border-t border-slate-700 pt-4 space-y-3">
                                <p className="text-sm text-slate-300">Les horaires pointés d'origine restent conservés. Toute correction remet l'entrée en attente.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="text-sm flex flex-col gap-1">Début corrigé
                                        <input type="datetime-local" required step="60" value={draft.start}
                                            onChange={event => setDraft(previous => ({ ...previous, start: event.target.value }))}
                                            className="min-h-11 w-full rounded-lg bg-slate-950 border border-slate-600 p-2 text-white" />
                                    </label>
                                    <label className="text-sm flex flex-col gap-1">Fin corrigée
                                        <input type="datetime-local" required step="60" value={draft.end}
                                            onChange={event => setDraft(previous => ({ ...previous, end: event.target.value }))}
                                            className="min-h-11 w-full rounded-lg bg-slate-950 border border-slate-600 p-2 text-white" />
                                    </label>
                                    <label className="text-sm flex flex-col gap-1">Chantier
                                        <select value={draft.siteId} required
                                            onChange={event => updateDraftSite(event.target.value)}
                                            className="min-h-11 rounded-lg bg-slate-950 border border-slate-600 p-2 text-white">
                                            <option value="">Choisir le chantier</option>
                                            {(sites || []).filter(site => String(site.company_id) === String(currentCompanyId))
                                                .map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-sm flex flex-col gap-1">Tâche
                                        <select value={draft.sectionId} required
                                            onChange={event => setDraft(previous => ({ ...previous, sectionId: event.target.value }))}
                                            className="min-h-11 rounded-lg bg-slate-950 border border-slate-600 p-2 text-white">
                                            <option value="">Choisir la tâche</option>
                                            {tasksForSite.map(task => <option key={task.id} value={task.id}>{task.name}</option>)}
                                        </select>
                                    </label>
                                </div>
                                <label className="text-sm flex flex-col gap-1">Motif de correction (obligatoire)
                                    <textarea rows={2} required value={draft.reason}
                                        onChange={event => setDraft(previous => ({ ...previous, reason: event.target.value }))}
                                        placeholder="Ex. Heure de fin mal saisie"
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
                                    </p>)}
                                </div>}
                            </div>}
                        </section>
                    );
                })}
            </div>
            <p className="text-xs text-slate-500">Seul un administrateur de l'entreprise peut corriger ou valider. Les pointages originaux et l'historique des corrections sont conservés dans Supabase.</p>
        </div>
    );
}

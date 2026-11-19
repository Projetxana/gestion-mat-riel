import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../supabaseClient';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Copy, Clock, CheckCircle, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseLocalizedHours, isValidQuarterHour, formatHoursHHMM, normalizeHoursInput, stepQuarterHour } from '../utils/quarterHours';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Get Monday of the week containing the given date
const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
};

const getWeekDays = (weekStart) => {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
    });
};

const formatDateLabel = (date) => {
    const day = date.getDate();
    const month = MONTHS_FR[date.getMonth()];
    return `${day} ${month}`;
};

const formatDateISO = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const TASK_COLORS = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'
];

const WeeklyTimeEntry = () => {
    const { sites, projectTasks, currentUser, currentCompanyId, timeSessions, mergeTimeSessions, deleteTimeSession } = useAppContext();
    const navigate = useNavigate();

    const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
    const [entries, setEntries] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [deletingEntryId, setDeletingEntryId] = useState(null);

    // Cache: preserve unsaved entries when navigating between weeks
    const entriesCache = React.useRef({});

    const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
    const activeSites = useMemo(() =>
        sites.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name)),
        [sites]
    );

    // Initialize empty entries for a week
    function initWeekEntries(start) {
        const days = getWeekDays(start);
        const result = {};
        days.forEach(d => {
            result[formatDateISO(d)] = [{ id: crypto.randomUUID(), hours: '', siteId: '', taskId: '' }];
        });
        return result;
    }

    // DB rows always win for saved entries; keep only unsaved drafts in the cache.
    // This prevents an old cached row from reappearing after a confirmed DELETE.
    const loadWeekEntries = React.useCallback((start) => {
        const weekKey = formatDateISO(start);
        const drafts = entriesCache.current[weekKey] || {};
        const days = getWeekDays(start);
        const weekEnd = new Date(start);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekSessions = (timeSessions || []).filter(session => {
            if (!session.punch_start_at || !session.manual_entry) return false;
            if (currentUser && String(session.user_id) !== String(currentUser.id)) return false;
            const date = new Date(session.punch_start_at);
            return date >= start && date < weekEnd;
        });

        const result = {};
        for (const day of days) {
            const dateKey = formatDateISO(day);
            const savedEntries = weekSessions
                .filter(session => formatDateISO(new Date(session.punch_start_at)) === dateKey)
                .map(session => {
                    const hours = (new Date(session.punch_end_at) - new Date(session.punch_start_at)) / 3600000;
                    return {
                        id: `db-${session.id}`,
                        dbId: session.id,
                        hours: formatHoursHHMM(hours),
                        siteId: String(session.site_id || ''),
                        taskId: String(session.section_id || ''),
                        saved: true,
                    };
                });
            const dayDrafts = (drafts[dateKey] || []).filter(entry => !entry.saved);
            result[dateKey] = savedEntries.length || dayDrafts.length
                ? [...savedEntries, ...dayDrafts]
                : [{ id: crypto.randomUUID(), hours: '', siteId: '', taskId: '' }];
        }
        setEntries(result);
    }, [timeSessions, currentUser?.id]);

    React.useEffect(() => {
        loadWeekEntries(weekStart);
    }, [weekStart, loadWeekEntries]);

    // Never cache saved records: the canonical source is the Supabase time_sessions table.
    React.useEffect(() => {
        const drafts = {};
        for (const [dateKey, dayEntries] of Object.entries(entries)) {
            const unsaved = dayEntries.filter(entry =>
                !entry.saved && (entry.hours || entry.siteId || entry.taskId)
            );
            if (unsaved.length) drafts[dateKey] = unsaved;
        }
        const weekKey = formatDateISO(weekStart);
        if (Object.keys(drafts).length) entriesCache.current[weekKey] = drafts;
        else delete entriesCache.current[weekKey];
    }, [entries, weekStart]);

    // Week navigation — save current to cache, then switch
    const prevWeek = () => {
        const newStart = new Date(weekStart);
        newStart.setDate(newStart.getDate() - 7);
        setWeekStart(newStart);
    };

    const nextWeek = () => {
        const newStart = new Date(weekStart);
        newStart.setDate(newStart.getDate() + 7);
        setWeekStart(newStart);
    };

    // Week label
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekLabel = `${weekStart.getDate()} ${MONTHS_FR[weekStart.getMonth()]} au ${weekEnd.getDate()} ${MONTHS_FR[weekEnd.getMonth()]}`;

    // Entry management
    const updateEntry = (dateKey, entryId, field, value) => {
        setEntries(prev => ({
            ...prev,
            [dateKey]: prev[dateKey].map(e =>
                e.id === entryId
                    ? { ...e, [field]: value, ...(field === 'siteId' ? { taskId: '' } : {}) }
                    : e
            )
        }));
    };

    const addEntry = (dateKey) => {
        const dayEntries = entries[dateKey];
        const last = dayEntries[dayEntries.length - 1];
        setEntries(prev => ({
            ...prev,
            [dateKey]: [
                ...prev[dateKey],
                {
                    id: crypto.randomUUID(),
                    hours: '',
                    siteId: last?.siteId || '',
                    taskId: ''
                }
            ]
        }));
    };

    const removeEntry = async (dateKey, entryId) => {
        const entry = (entries[dateKey] || []).find(item => item.id === entryId);
        if (!entry || deletingEntryId) return;
        if (entry.saved && entry.dbId != null) {
            if (!window.confirm('Supprimer définitivement ces heures enregistrées ?')) return;
            setDeletingEntryId(entryId);
            try {
                const result = await deleteTimeSession(entry.dbId);
                if (!result?.success) {
                    alert(result?.error || 'La suppression n’a pas été confirmée.');
                    return;
                }
            } finally {
                setDeletingEntryId(null);
            }
        }
        setEntries(prev => {
            const filtered = (prev[dateKey] || []).filter(item => item.id !== entryId);
            return {
                ...prev,
                [dateKey]: filtered.length
                    ? filtered
                    : [{ id: crypto.randomUUID(), hours: '', siteId: '', taskId: '' }]
            };
        });
    };

    const copyDay = (fromDateKey, toDateKey) => {
        const source = entries[fromDateKey];
        if (!source || source.length === 0) return;
        setEntries(prev => ({
            ...prev,
            [toDateKey]: source.map(e => ({ ...e, id: crypto.randomUUID(), dbId: undefined, saved: false }))
        }));
    };

    // Get tasks for a site
    const getTasksForSite = (siteId) => {
        if (!siteId) return [];
        const live = projectTasks?.filter(pt => String(pt.project_id) === String(siteId)) || [];
        if (live.length > 0) return live;
        const site = sites.find(s => String(s.id) === String(siteId));
        return site?.tasks || [];
    };

    // Get task color
    const getTaskColor = (taskId) => {
        if (!taskId) return 'transparent';
        const allTasks = projectTasks || [];
        const idx = allTasks.findIndex(t => String(t.id) === String(taskId));
        return TASK_COLORS[idx % TASK_COLORS.length];
    };

    // Calculations
    const getDayTotal = (dateKey) =>
        (entries[dateKey] || []).reduce((sum, entry) => {
            const hours = parseLocalizedHours(entry.hours);
            // Preserve the totals of older, already-saved records as stored.
            // New entries must be in exact 15-minute increments.
            const valid = entry.saved
                ? hours != null && hours > 0 && hours <= 24
                : isValidQuarterHour(hours);
            return sum + (valid ? hours : 0);
        }, 0);

    const weekTotal = useMemo(() => {
        return Object.keys(entries).reduce((sum, key) => sum + getDayTotal(key), 0);
    }, [entries]);

    const normalHours = Math.min(weekTotal, 40);
    const overtimeHours = Math.max(0, weekTotal - 40);

    // Count invalid draft durations so that typing 7,3 or 7:15 never silently
    // saves a truncated value or discards a row without warning.
    const getInvalidHoursCount = () =>
        Object.values(entries).flat().filter(entry =>
            !entry.saved &&
            String(entry.hours ?? '').trim() !== '' &&
            parseLocalizedHours(entry.hours) !== 0 &&
            !isValidQuarterHour(parseLocalizedHours(entry.hours))
        ).length;

    // Get all valid NEW entries for submission (exclude already saved).
    const getValidEntries = () => {
        const valid = [];
        Object.entries(entries).forEach(([dateKey, dayEntries]) => {
            dayEntries.forEach(entry => {
                const hours = parseLocalizedHours(entry.hours);
                if (!entry.saved && isValidQuarterHour(hours) && entry.siteId && entry.taskId) {
                    valid.push({ date: dateKey, hours, siteId: entry.siteId, taskId: entry.taskId });
                }
            });
        });
        return valid;
    };

    // Count incomplete entries (hours set but missing task/site)
    const getIncompleteCount = () => {
        let count = 0;
        Object.values(entries).forEach(dayEntries => {
            dayEntries.forEach(e => {
                const hours = parseLocalizedHours(e.hours);
                if (!e.saved && isValidQuarterHour(hours) && (!e.siteId || !e.taskId)) count++;
            });
        });
        return count;
    };

    // Submit
    const handleSubmit = async () => {
        if (!currentUser?.id || !currentCompanyId || !currentUser?.role || currentUser.role === 'admin') {
            alert('Compte employé ou entreprise non disponible. Reconnectez-vous.');
            return;
        }
        if (isSubmitting) return;
        if (getInvalidHoursCount() > 0) {
            alert('Les heures doivent être saisies par tranches de 15 minutes : 7,25 ; 7,5 ; 7,75, etc. (maximum 24 h par entrée).');
            return;
        }
        const valid = getValidEntries();
        if (valid.length === 0) {
            alert('Aucune entrée valide à enregistrer.');
            return;
        }

        setIsSubmitting(true);

        try {
            // Build payloads — convert hours to start/end timestamps
            const payloads = valid.map(e => {
                const startAt = new Date(`${e.date}T08:00:00`);
                const endAt = new Date(startAt.getTime() + e.hours * 3600000);
                return {
                    user_id: currentUser?.id,
                    site_id: parseInt(e.siteId),
                    section_id: parseInt(e.taskId),
                    punch_start_at: startAt.toISOString(),
                    punch_end_at: endAt.toISOString(),
                    manual_entry: true,
                    company_id: currentCompanyId ?? null,
                    created_at: new Date().toISOString()
                };
            });

            const { data, error } = await supabase.from('time_sessions').insert(payloads).select();

            if (error) {
                alert(`Erreur: ${error.message}`);
                setIsSubmitting(false);
                return;
            }

            if (!data || data.length !== valid.length) {
                throw new Error('La sauvegarde n’a pas retourné toutes les heures attendues. Rechargez avant de réessayer.');
            }
            // Reflect saved sessions immediately in the home page without a browser refresh.
            mergeTimeSessions(data);
            delete entriesCache.current[formatDateISO(weekStart)];
            setShowSuccess(true);
            setTimeout(() => {
                navigate('/timetracking');
            }, 1500);
        } catch (err) {
            alert(`Erreur: ${err.message}`);
        }

        setIsSubmitting(false);
    };

    // Each press adjusts by exactly one quarter hour (15 minutes).
    const adjustHours = (dateKey, entryId, deltaQuarters) => {
        setEntries(prev => ({
            ...prev,
            [dateKey]: prev[dateKey].map(entry =>
                entry.id === entryId
                    ? { ...entry, hours: stepQuarterHour(entry.hours, deltaQuarters) }
                    : entry
            )
        }));
    };

    if (showSuccess) {
        return (
            <div className="max-w-md mx-auto flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 animate-pulse">
                    <CheckCircle size={48} className="text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Heures enregistrées !</h2>
                <p className="text-slate-400">{getValidEntries().length} entrées • {formatHoursHHMM(weekTotal)} h</p>
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto pb-64 md:pb-32">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <button onClick={() => navigate('/timetracking')} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="text-lg font-bold text-white">Ajouter des heures</h1>
                </div>
            </div>

            {/* Week selector */}
            <div className="flex items-center justify-between glass-panel px-4 py-3 mb-4">
                <button onClick={prevWeek} className="p-1 text-slate-400 hover:text-white transition-colors">
                    <ChevronLeft size={22} />
                </button>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <Clock size={16} className="text-blue-400" />
                    Semaine du {weekLabel}
                </div>
                <button onClick={nextWeek} className="p-1 text-slate-400 hover:text-white transition-colors">
                    <ChevronRight size={22} />
                </button>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-2 px-3 py-2 mb-5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />

            </div>

            {/* Day cards */}
            <div className="space-y-3">
                {weekDays.map((day, dayIdx) => {
                    const dateKey = formatDateISO(day);
                    const dayEntries = entries[dateKey] || [];
                    const dayTotal = getDayTotal(dateKey);
                    const isToday = formatDateISO(new Date()) === dateKey;
                    const prevDateKey = dayIdx > 0 ? formatDateISO(weekDays[dayIdx - 1]) : null;

                    return (
                        <div key={dateKey} className={`glass-panel overflow-hidden ${isToday ? 'ring-1 ring-blue-500/50' : ''}`}>
                            {/* Day header */}
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-bold ${isToday ? 'text-blue-400' : 'text-slate-200'}`}>
                                        {DAYS_FR[dayIdx]}
                                    </span>
                                    <span className="text-xs text-slate-500">{formatDateLabel(day)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {dayTotal > 0 && (
                                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                            {formatHoursHHMM(dayTotal)} h
                                        </span>
                                    )}
                                    {prevDateKey && getDayTotal(prevDateKey) > 0 && (
                                        <button
                                            onClick={() => copyDay(prevDateKey, dateKey)}
                                            className="p-1 text-slate-500 hover:text-blue-400 transition-colors"
                                            title={`Copier ${DAYS_FR[dayIdx - 1]}`}
                                        >
                                            <Copy size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Entry rows */}
                            <div className="px-3 py-2 space-y-2">
                                {dayEntries.map((entry) => {
                                    const tasks = getTasksForSite(entry.siteId);
                                    const parsedHours = parseLocalizedHours(entry.hours);
                                    const hasHours = parsedHours != null && parsedHours > 0;
                                    const isSaved = entry.saved;
                                    const hasInvalidHours = !isSaved &&
                                        String(entry.hours ?? '').trim() !== '' &&
                                        parsedHours !== 0 && !isValidQuarterHour(parsedHours);
                                    const isIncomplete = hasHours && (!entry.siteId || !entry.taskId);
                                    return (
                                        <div key={entry.id} className={`flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors ${hasInvalidHours ? 'bg-red-500/10 ring-1 ring-red-500/60' : isIncomplete ? 'bg-amber-500/10 ring-1 ring-amber-500/40' : ''} ${isSaved ? 'opacity-60' : ''}`}>
                                            {/* Hours stepper */}
                                            <div className="flex items-center bg-slate-800/60 rounded-lg border border-slate-700/50 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => adjustHours(dateKey, entry.id, -1)}
                                                    className="px-2 py-2 text-slate-400 hover:text-white text-sm font-bold"
                                                >−</button>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    autoComplete="off"
                                                    value={entry.hours}
                                                    onChange={(e) => updateEntry(dateKey, entry.id, 'hours', normalizeHoursInput(e.target.value))}
                                                    onBlur={() => {
                                                        const hours = parseLocalizedHours(entry.hours);
                                                        if (hours === 0 || isValidQuarterHour(hours)) {
                                                            updateEntry(dateKey, entry.id, 'hours',
                                                                hours === 0 ? '' : formatHoursHHMM(hours));
                                                        }
                                                    }}
                                                    aria-label="Durée en heures et minutes"
                                                    aria-invalid={hasInvalidHours}
                                                    title="Durée en heures et minutes"
                                                    placeholder="0"
                                                    className="w-12 text-center bg-transparent border-none text-sm font-bold text-white py-2 px-0 focus:outline-none"
                                                />
                                                <span className="text-xs text-slate-500 -ml-1 mr-1">h</span>
                                                <button
                                                    type="button"
                                                    onClick={() => adjustHours(dateKey, entry.id, 1)}
                                                    className="px-2 py-2 text-slate-400 hover:text-white text-sm font-bold"
                                                >+</button>
                                            </div>

                                            {/* Task select */}
                                            <div className="relative flex-1 min-w-0">
                                                <select
                                                    value={entry.taskId}
                                                    onChange={(e) => updateEntry(dateKey, entry.id, 'taskId', e.target.value)}
                                                    disabled={!entry.siteId}
                                                    className="w-full pl-6 pr-2 py-2 text-xs rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-200 truncate disabled:opacity-40"
                                                >
                                                    <option value="">Tâche...</option>
                                                    {tasks.map(t => (
                                                        <option key={t.id} value={t.id}>{t.name}</option>
                                                    ))}
                                                </select>
                                                <div
                                                    className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
                                                    style={{ backgroundColor: getTaskColor(entry.taskId) }}
                                                />
                                            </div>

                                            {/* Site select */}
                                            <div className="flex-1 min-w-0">
                                                <select
                                                    value={entry.siteId}
                                                    onChange={(e) => updateEntry(dateKey, entry.id, 'siteId', e.target.value)}
                                                    className="w-full px-2 py-2 text-xs rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-200 truncate"
                                                >
                                                    <option value="">Chantier...</option>
                                                    {activeSites.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Delete */}
                                            {dayEntries.length > 1 ? (
                                                <button
                                                    onClick={() => removeEntry(dateKey, entry.id)}
                                                    disabled={!!deletingEntryId}
                                                    className="p-1.5 text-red-400/60 hover:text-red-400 transition-colors shrink-0"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => addEntry(dateKey)}
                                                    className="p-1.5 text-blue-400/60 hover:text-blue-400 transition-colors shrink-0"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add task button */}
                            {dayEntries.length > 1 || (dayEntries.length === 1 && dayEntries[0].hours) ? (
                                <button
                                    onClick={() => addEntry(dateKey)}
                                    className="w-full px-4 py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 transition-colors flex items-center gap-1 border-t border-white/5"
                                >
                                    <Plus size={12} /> Ajouter une tâche
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {/* Weekly total card - fixed at bottom */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-white/10">
                <div className="max-w-lg mx-auto px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                    {/* Total bar */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <Clock size={20} className="text-blue-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Total semaine</p>
                                <p className="text-xl font-black text-white">{formatHoursHHMM(weekTotal)} h</p>
                            </div>
                        </div>
                        <div className="text-right text-xs space-y-0.5">
                            <p className="text-slate-400">Normales: <span className="text-white font-bold">{formatHoursHHMM(normalHours)} h</span></p>
                            {overtimeHours > 0 && (
                                <p className="text-amber-400">Supp: <span className="font-bold">{formatHoursHHMM(overtimeHours)} h</span></p>
                            )}
                        </div>
                    </div>

                    {/* Invalid values must never be silently truncated or submitted. */}
                    {getInvalidHoursCount() > 0 && (
                        <p role="alert" className="text-xs text-red-300 mb-2 flex items-center gap-1">
                            <Info size={12} />
                            Durée invalide : utilisez 0,25 h, 0,5 h, 0,75 h ou des heures entières (maximum 24 h).
                        </p>
                    )}

                    {/* Warning for incomplete entries */}
                    {getIncompleteCount() > 0 && (
                        <p className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                            <Info size={12} />
                            {getIncompleteCount()} entrée{getIncompleteCount() > 1 ? 's' : ''} incomplète{getIncompleteCount() > 1 ? 's' : ''} (tâche ou chantier manquant)
                        </p>
                    )}

                    {/* Submit button */}
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || getValidEntries().length === 0 || getInvalidHoursCount() > 0}
                        className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                            getValidEntries().length > 0 && getInvalidHoursCount() === 0
                                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                    >
                        {isSubmitting ? (
                            <>Enregistrement...</>
                        ) : (
                            <>
                                Enregistrer les heures ({formatHoursHHMM(weekTotal)} h)
                                <CheckCircle size={18} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WeeklyTimeEntry;

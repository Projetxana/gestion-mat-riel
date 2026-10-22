import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../supabaseClient';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Copy, Clock, CheckCircle, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
    const { sites, projectTasks, currentUser, currentCompanyId, timeSessions } = useAppContext();
    const navigate = useNavigate();

    const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
    const [entries, setEntries] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

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

    // Load entries from DB for a given week, merge with cache
    const loadWeekEntries = React.useCallback((start) => {
        const weekKey = formatDateISO(start);

        // 1. Check cache first (unsaved user input)
        if (entriesCache.current[weekKey]) {
            setEntries(entriesCache.current[weekKey]);
            return;
        }

        // 2. Load from existing timeSessions
        const days = getWeekDays(start);
        const weekEnd = new Date(start);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekSessions = (timeSessions || []).filter(s => {
            if (!s.punch_start_at || !s.manual_entry) return false;
            if (currentUser && String(s.user_id) !== String(currentUser.id)) return false;
            const d = new Date(s.punch_start_at);
            return d >= start && d < weekEnd;
        });

        if (weekSessions.length > 0) {
            // Build entries from existing sessions
            const result = {};
            days.forEach(d => {
                const dateKey = formatDateISO(d);
                const daySessions = weekSessions.filter(s => {
                    const sd = new Date(s.punch_start_at);
                    return formatDateISO(sd) === dateKey;
                });

                if (daySessions.length > 0) {
                    result[dateKey] = daySessions.map(s => {
                        const startMs = new Date(s.punch_start_at).getTime();
                        const endMs = new Date(s.punch_end_at).getTime();
                        const hours = Math.round((endMs - startMs) / 3600000 * 2) / 2;
                        return {
                            id: `db-${s.id}`,
                            dbId: s.id,
                            hours: hours.toString(),
                            siteId: String(s.site_id || ''),
                            taskId: String(s.section_id || ''),
                            saved: true
                        };
                    });
                } else {
                    result[dateKey] = [{ id: crypto.randomUUID(), hours: '', siteId: '', taskId: '' }];
                }
            });
            setEntries(result);
        } else {
            // 3. Empty week
            setEntries(initWeekEntries(start));
        }
    }, [timeSessions, currentUser]);

    // Load entries when week changes or timeSessions update
    React.useEffect(() => {
        loadWeekEntries(weekStart);
    }, [weekStart, loadWeekEntries]);

    // Save to cache whenever entries change
    React.useEffect(() => {
        if (Object.keys(entries).length > 0) {
            // Only cache if there's actual user input (not all empty)
            const hasInput = Object.values(entries).some(dayEntries =>
                dayEntries.some(e => e.hours || e.siteId || e.taskId)
            );
            if (hasInput) {
                entriesCache.current[formatDateISO(weekStart)] = entries;
            }
        }
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

    const removeEntry = (dateKey, entryId) => {
        setEntries(prev => {
            const filtered = prev[dateKey].filter(e => e.id !== entryId);
            if (filtered.length === 0) {
                return { ...prev, [dateKey]: [{ id: crypto.randomUUID(), hours: '', siteId: '', taskId: '' }] };
            }
            return { ...prev, [dateKey]: filtered };
        });
    };

    const copyDay = (fromDateKey, toDateKey) => {
        const source = entries[fromDateKey];
        if (!source || source.length === 0) return;
        setEntries(prev => ({
            ...prev,
            [toDateKey]: source.map(e => ({ ...e, id: crypto.randomUUID() }))
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
    const getDayTotal = (dateKey) => {
        return (entries[dateKey] || []).reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
    };

    const weekTotal = useMemo(() => {
        return Object.keys(entries).reduce((sum, key) => sum + getDayTotal(key), 0);
    }, [entries]);

    const normalHours = Math.min(weekTotal, 40);
    const overtimeHours = Math.max(0, weekTotal - 40);

    // Get all valid NEW entries for submission (exclude already saved)
    const getValidEntries = () => {
        const valid = [];
        Object.entries(entries).forEach(([dateKey, dayEntries]) => {
            dayEntries.forEach(e => {
                const h = parseFloat(e.hours);
                if (h > 0 && e.siteId && e.taskId && !e.saved) {
                    valid.push({ date: dateKey, hours: h, siteId: e.siteId, taskId: e.taskId });
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
                if (parseFloat(e.hours) > 0 && (!e.siteId || !e.taskId) && !e.saved) count++;
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

            setShowSuccess(true);
            // Clear cache for this week so it reloads from DB next time
            delete entriesCache.current[formatDateISO(weekStart)];
            setTimeout(() => {
                navigate('/timetracking');
            }, 1500);
        } catch (err) {
            alert(`Erreur: ${err.message}`);
        }

        setIsSubmitting(false);
    };

    // Stepper for hours
    const adjustHours = (dateKey, entryId, delta) => {
        setEntries(prev => ({
            ...prev,
            [dateKey]: prev[dateKey].map(e => {
                if (e.id !== entryId) return e;
                const current = parseFloat(e.hours) || 0;
                const next = Math.max(0, Math.round((current + delta) * 2) / 2); // 0.5 increments
                return { ...e, hours: next > 0 ? next.toString() : '' };
            })
        }));
    };

    if (showSuccess) {
        return (
            <div className="max-w-md mx-auto flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 animate-pulse">
                    <CheckCircle size={48} className="text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Heures enregistrées !</h2>
                <p className="text-slate-400">{getValidEntries().length} entrées • {weekTotal.toFixed(1)} h</p>
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto pb-32">
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
                <p className="text-xs text-blue-300">Saisissez le nombre d'heures par tâche et par chantier pour chaque jour.</p>
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
                                            {dayTotal.toFixed(1)} h
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
                                    const hasHours = parseFloat(entry.hours) > 0;
                                    const isIncomplete = hasHours && (!entry.siteId || !entry.taskId);
                                    const isSaved = entry.saved;
                                    return (
                                        <div key={entry.id} className={`flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors ${isIncomplete ? 'bg-amber-500/10 ring-1 ring-amber-500/40' : ''} ${isSaved ? 'opacity-60' : ''}`}>
                                            {/* Hours stepper */}
                                            <div className="flex items-center bg-slate-800/60 rounded-lg border border-slate-700/50 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => adjustHours(dateKey, entry.id, -0.5)}
                                                    className="px-2 py-2 text-slate-400 hover:text-white text-sm font-bold"
                                                >−</button>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    step="0.5"
                                                    min="0"
                                                    max="24"
                                                    value={entry.hours}
                                                    onChange={(e) => updateEntry(dateKey, entry.id, 'hours', e.target.value)}
                                                    placeholder="0"
                                                    className="w-10 text-center bg-transparent border-none text-sm font-bold text-white py-2 px-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                />
                                                <span className="text-xs text-slate-500 -ml-1 mr-1">h</span>
                                                <button
                                                    type="button"
                                                    onClick={() => adjustHours(dateKey, entry.id, 0.5)}
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
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-white/10 safe-area-bottom">
                <div className="max-w-lg mx-auto px-4 py-3">
                    {/* Total bar */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <Clock size={20} className="text-blue-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Total semaine</p>
                                <p className="text-xl font-black text-white">{weekTotal.toFixed(1)} h</p>
                            </div>
                        </div>
                        <div className="text-right text-xs space-y-0.5">
                            <p className="text-slate-400">Normales: <span className="text-white font-bold">{normalHours.toFixed(1)} h</span></p>
                            {overtimeHours > 0 && (
                                <p className="text-amber-400">Supp: <span className="font-bold">{overtimeHours.toFixed(1)} h</span></p>
                            )}
                        </div>
                    </div>

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
                        disabled={isSubmitting || getValidEntries().length === 0}
                        className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                            getValidEntries().length > 0
                                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                    >
                        {isSubmitting ? (
                            <>Enregistrement...</>
                        ) : (
                            <>
                                Enregistrer les heures ({weekTotal.toFixed(1)} h)
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

import React, { useState, useEffect } from 'react';
import { getCurrentWeekRange, buildWeeklySnapshot, validateByAdmin, validateByLeader } from './weeklyTimesheetService';
import { supabase } from '../../supabaseClient';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const AdminHoursView = () => {
    const [currentWeek, setCurrentWeek] = useState(getCurrentWeekRange());
    const [activeSessions, setActiveSessions] = useState([]);
    const [weeklyData, setWeeklyData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState({});
    const [sites, setSites] = useState({});

    // Load initial data
    useEffect(() => {
        loadData();
    }, [currentWeek]); // Reload when week changes

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Users & Sites for display names
            const { data: usersData } = await supabase.from('users').select('id, name');
            const { data: sitesData } = await supabase.from('sites').select('id, name');

            const userMap = (usersData || []).reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {});
            const siteMap = (sitesData || []).reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {});
            setUsers(userMap);
            setSites(siteMap);

            // 2. Fetch Active Sessions (Live)
            const { data: active } = await supabase
                .from('time_sessions')
                .select('*')
                .is('punch_end_at', null);
            setActiveSessions(active || []);

            // 3. Build/Fetch Weekly Snapshot
            // This service function does the heavy lifting: reading sessions, aggregating, etc.
            // We pass the start date of the current week view to generate/fetch that specific week.
            await buildWeeklySnapshot(currentWeek.start);

            // 4. Fetch the resulting Weekly Timesheets from DB
            const { start, end } = currentWeek;
            const startStr = start.toISOString().split('T')[0];

            const { data: timesheets } = await supabase
                .from('weekly_timesheets')
                .select(`
                    id,
                    user_id,
                    week_start,
                    week_end,
                    leader_validated,
                    admin_validated,
                    weekly_timesheet_entries (hours)
                `)
                .eq('week_start', startStr);

            // Calculate totals locally for display
            const processed = (timesheets || []).map(ts => {
                const total = ts.weekly_timesheet_entries.reduce((acc, e) => acc + (e.hours || 0), 0);
                return { ...ts, totalHours: total };
            });

            setWeeklyData(processed);

        } catch (error) {
            console.error("Error loading AdminHoursView:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleValidate = async (timesheetId) => {
        if (!window.confirm("Valider cette semaine pour cet employé ?")) return;

        // Admin validation requires Leader validation first.
        // For simplicity/resilience in this view, we might want to force leader validation if missing?
        // Or respect the strict rule. The prompt says "validateByAdmin... Seulement si leader_validated = true".
        // Let's try to validate.
        const result = await validateByAdmin(timesheetId);
        if (result.error) {
            alert("Erreur: " + result.error);
        } else {
            loadData(); // Refresh
        }
    };

    const handlePreviousWeek = () => {
        const newStart = new Date(currentWeek.start);
        newStart.setDate(newStart.getDate() - 7);
        const newEnd = new Date(newStart);
        newEnd.setDate(newStart.getDate() + 6);
        newEnd.setHours(23, 59, 59, 999);
        setCurrentWeek({ start: newStart, end: newEnd });
    };

    const handleNextWeek = () => {
        const newStart = new Date(currentWeek.start);
        newStart.setDate(newStart.getDate() + 7);
        const newEnd = new Date(newStart);
        newEnd.setDate(newStart.getDate() + 6);
        newEnd.setHours(23, 59, 59, 999);
        setCurrentWeek({ start: newStart, end: newEnd });
    };

    return (
        <div className="p-4 space-y-8 bg-slate-50 min-h-screen">
            <h1 className="text-2xl font-bold text-slate-800">Gestion des Heures (v2)</h1>

            {/* 1. Active Sessions */}
            <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 text-blue-600">En cours maintenant</h2>
                {activeSessions.length === 0 ? (
                    <p className="text-slate-500 italic">Aucune activité en cours.</p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {activeSessions.map(session => (
                            <div key={session.id} className="flex items-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse mr-3"></div>
                                <div>
                                    <div className="font-bold text-slate-800">{users[session.user_id] || 'Utilisateur inconnu'}</div>
                                    <div className="text-sm text-slate-600">{sites[session.site_id] || 'Site inconnu'}</div>
                                    <div className="text-xs text-slate-400 mt-1">
                                        Depuis {format(new Date(session.punch_start_at), 'HH:mm')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* 2. Weekly Table */}
            <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold text-slate-800">
                        Semaine du {format(currentWeek.start, 'dd MMM', { locale: fr })} au {format(currentWeek.end, 'dd MMM yyyy', { locale: fr })}
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={handlePreviousWeek} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600">
                            &lt; Précédent
                        </button>
                        <button onClick={() => setCurrentWeek(getCurrentWeekRange())} className="px-3 py-1 bg-blue-50 text-blue-600 rounded">
                            Aujourd'hui
                        </button>
                        <button onClick={handleNextWeek} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600">
                            Suivant &gt;
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-10 text-slate-400">Chargement...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                                    <th className="py-3 px-2">Employé</th>
                                    <th className="py-3 px-2 text-right">Heures (Sem.)</th>
                                    <th className="py-3 px-2 text-center">Statut Leader</th>
                                    <th className="py-3 px-2 text-center">Statut Admin</th>
                                    <th className="py-3 px-2 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {weeklyData.map(ts => (
                                    <tr key={ts.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-3 px-2 font-medium text-slate-800">
                                            {users[ts.user_id] || ts.user_id}
                                        </td>
                                        <td className="py-3 px-2 text-right font-bold text-slate-700">
                                            {ts.totalHours.toFixed(2)} h
                                        </td>
                                        <td className="py-3 px-2 text-center">
                                            {ts.leader_validated ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                                                    Validé
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-50 text-yellow-600">
                                                    En attente
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-center">
                                            {ts.admin_validated ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                                    Approuvé
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 text-sm">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-right">
                                            {!ts.admin_validated && (
                                                <button
                                                    onClick={() => handleValidate(ts.id)}
                                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${ts.leader_validated
                                                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                        }`}
                                                    disabled={!ts.leader_validated}
                                                    title={!ts.leader_validated ? "En attente de validation Leader" : "Valider la semaine"}
                                                >
                                                    Valider
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {weeklyData.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="py-8 text-center text-slate-400">
                                            Aucune donnée pour cette semaine.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default AdminHoursView;

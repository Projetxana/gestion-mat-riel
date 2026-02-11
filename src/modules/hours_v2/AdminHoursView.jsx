import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
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

    const { currentUser } = useAppContext(); // Get currentUser to pass to validation service

    const handleValidate = async (timesheetId) => {
        if (!window.confirm("Valider cette semaine pour cet employé ?")) return;

        // Admin validation requires Leader validation first.
        const result = await validateByAdmin(timesheetId, currentUser);
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

    const handleResetAppData = async () => {
        const confirm1 = window.confirm("ATTENTION : Vous êtes sur le point de supprimer TOUTES les heures saisies par les utilisateurs.");
        if (!confirm1) return;

        const confirm2 = window.confirm("Êtes-vous vraiment sûr ? Cette action est irréversible.\n\nCela ne supprimera PAS :\n- Les tâches importées\n- Le matériel\n- Les utilisateurs");
        if (!confirm2) return;

        const password = window.prompt("Pour confirmer, tapez 'DELETE' :");
        if (password !== 'DELETE') {
            alert("Annulé.");
            return;
        }

        setLoading(true);
        try {
            // 1. Delete Time Sessions
            const { error: errorSessions } = await supabase
                .from('time_sessions')
                .delete()
                .neq('id', 0); // Delete all where id is not 0 (effectively all)

            if (errorSessions) throw errorSessions;

            // 2. Delete Weekly Timesheet Entries (Cascade should handle this but manual is safer)
            const { error: errorEntries } = await supabase
                .from('weekly_timesheet_entries')
                .delete()
                .neq('id', 0);

            if (errorEntries) throw errorEntries;

            // 3. Delete Weekly Timesheets
            const { error: errorSheets } = await supabase
                .from('weekly_timesheets')
                .delete()
                .neq('id', 0);

            if (errorSheets) throw errorSheets;

            alert("Succès ! Toutes les heures ont été supprimées. L'application repart à zéro.");
            loadData(); // Refresh

        } catch (error) {
            console.error("Reset Error:", error);
            alert("Erreur lors de la réinitialisation : " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 space-y-8 bg-slate-50 min-h-screen pb-24">
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

            {/* 2. Weekly Table / List */}
            <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h2 className="text-lg font-semibold text-slate-800 text-center md:text-left">
                        Semaine du {format(currentWeek.start, 'dd MMM', { locale: fr })} au {format(currentWeek.end, 'dd MMM yyyy', { locale: fr })}
                    </h2>
                    <div className="flex gap-2 w-full md:w-auto justify-center">
                        <button onClick={handlePreviousWeek} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 text-sm flex-1 md:flex-none">
                            &lt; Précédent
                        </button>
                        <button onClick={() => setCurrentWeek(getCurrentWeekRange())} className="px-3 py-2 bg-blue-50 text-blue-600 rounded text-sm flex-1 md:flex-none">
                            Aujourd'hui
                        </button>
                        <button onClick={handleNextWeek} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 text-sm flex-1 md:flex-none">
                            Suivant &gt;
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-10 text-slate-400">Chargement...</div>
                ) : (
                    <>
                        {/* DESKTOP TABLE */}
                        <div className="hidden md:block overflow-x-auto">
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

                        {/* MOBILE CARDS */}
                        <div className="md:hidden space-y-4">
                            {weeklyData.length === 0 ? (
                                <p className="text-center text-slate-400 py-8">Aucune donnée.</p>
                            ) : (
                                weeklyData.map(ts => (
                                    <div key={ts.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="font-bold text-slate-800 text-lg">
                                                {users[ts.user_id] || ts.user_id}
                                            </div>
                                            <div className="text-xl font-bold text-blue-600">
                                                {ts.totalHours.toFixed(2)} h
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                                            <div className="bg-white p-2 rounded border border-slate-100">
                                                <p className="text-xs text-slate-400 uppercase">Leader</p>
                                                <p className="font-medium">
                                                    {ts.leader_validated ? (
                                                        <span className="text-green-600">Validé</span>
                                                    ) : (
                                                        <span className="text-amber-600">En attente</span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="bg-white p-2 rounded border border-slate-100">
                                                <p className="text-xs text-slate-400 uppercase">Admin</p>
                                                <p className="font-medium">
                                                    {ts.admin_validated ? (
                                                        <span className="text-blue-600">Approuvé</span>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {!ts.admin_validated && (
                                            <button
                                                onClick={() => handleValidate(ts.id)}
                                                className={`w-full py-3 rounded-lg font-bold text-sm shadow-sm transition-colors ${ts.leader_validated
                                                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30'
                                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                    }`}
                                                disabled={!ts.leader_validated}
                                            >
                                                {ts.leader_validated ? 'VALIDER CETTE SEMAINE' : 'Attente Validation Leader'}
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </section>

            {/* DANGER ZONE */}
            <section className="bg-red-50 p-6 rounded-xl border border-red-200 mt-12">
                <h3 className="text-red-700 font-bold text-lg mb-2">⚠️ Zone de Danger</h3>
                <p className="text-red-600 text-sm mb-4">
                    Ces actions sont irréversibles. Soyez prudent.
                </p>
                <button
                    onClick={handleResetAppData}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded shadow-lg shadow-red-500/30 transition-all active:scale-95"
                >
                    PURGER TOUTES LES HEURES (RAZ)
                </button>
            </section>
        </div>
    );
};

export default AdminHoursView;

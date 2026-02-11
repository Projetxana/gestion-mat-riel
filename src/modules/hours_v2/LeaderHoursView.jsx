import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../supabaseClient';
import { getCurrentWeekRange, buildWeeklySnapshot, validateByLeader, getWeeklyTimesheetForUser } from './weeklyTimesheetService';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const LeaderHoursView = () => {
    const { currentUser, timeSessions, sites } = useAppContext();
    const [siteUsers, setSiteUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [canValidate, setCanValidate] = useState(false);
    const [currentSiteId, setCurrentSiteId] = useState(null);
    const [weekStats, setWeekStats] = useState({}); // { userId: totalHours }
    const [isValidationTime, setIsValidationTime] = useState(false);

    // Helper to determine if the current user can validate
    const determineValidationRights = (usersOnSite) => {
        if (!currentUser) return;

        // STRICT RULE: Only 'chef_equipe' can validate (or legacy 'leader' role)
        if ((currentUser.role === 'user' && currentUser.level === 'chef_equipe') || currentUser.role === 'leader') {
            setCanValidate(true);
        } else {
            setCanValidate(false);
        }
    };

    const loadSiteContext = async (siteId) => {
        setLoading(true);
        try {
            const { start, end } = getCurrentWeekRange();

            // A. Get all active sessions on this site (Who is here?)
            const { data: activeSessions } = await supabase
                .from('time_sessions')
                .select('user_id, punch_start_at')
                .eq('site_id', siteId)
                .is('punch_end_at', null);

            const activeUserIds = [...new Set((activeSessions || []).map(s => s.user_id))];

            console.log("DEBUG: LeaderHoursView activeUserIds", activeUserIds);

            if (activeUserIds.length === 0) {
                console.log("DEBUG: LeaderHoursView - No active users found");
                setSiteUsers([]);
                setLoading(false);
                return;
            }

            // B. Fetch User Details (Role, Level, CreatedAt, Name)
            const { data: usersData } = await supabase
                .from('users')
                .select('id, name, role, level, created_at')
                .in('id', activeUserIds);

            setSiteUsers(usersData || []);

            // C. Calculate "Can Validated"
            determineValidationRights(usersData || []);

            // D. Get Stats for the week for these users
            const stats = {};
            await buildWeeklySnapshot(start);

            for (const u of usersData || []) {
                const ts = await getWeeklyTimesheetForUser(u.id);
                let total = 0;

                if (ts && !ts.error) {
                    total = ts.total_hours || 0;
                    stats[u.id + '_tsId'] = ts.id;
                    stats[u.id + '_validated'] = ts.leader_validated;
                }

                // ADD ACTIVE SESSION TIME
                const activeSession = activeSessions.find(s => s.user_id === u.id);
                if (activeSession && activeSession.punch_start_at) {
                    const startInfo = new Date(activeSession.punch_start_at);
                    const now = new Date();
                    const durationMs = now - startInfo; // ms
                    const durationHours = durationMs / (1000 * 60 * 60);
                    if (durationHours > 0) {
                        total += durationHours;
                    }
                }

                stats[u.id] = total;
            }
            setWeekStats(stats);

        } catch (error) {
            console.error("Error loading site context:", error);
        } finally {
            setLoading(false);
        }
    };

    // 1. Determine Current Site & Check Time
    useEffect(() => {
        if (!currentUser) return;

        // Check Time Rule: Friday >= 14:00
        const now = new Date();
        const isFriday = now.getDay() === 5;
        const isAfter14h = now.getHours() >= 14;

        // DEV OVERRIDE: Uncomment to test validation anytime
        // setIsValidationTime(true);
        setIsValidationTime(isFriday && isAfter14h);

        // Find active session for current user
        const active = timeSessions.find(s =>
            String(s.user_id) === String(currentUser.id) &&
            s.punch_end_at === null
        );

        if (active) {
            setCurrentSiteId(active.site_id);
            loadSiteContext(active.site_id);
        } else {
            setCurrentSiteId(null);
            setSiteUsers([]);
        }
    }, [currentUser, timeSessions]);

    const handleValidateSite = async () => {
        if (!window.confirm("Valider les heures de tous les employés présents sur ce chantier pour la semaine ?")) return;

        // Validation Loop
        for (const user of siteUsers) {
            const tsId = weekStats[user.id + '_tsId'];
            if (tsId && !weekStats[user.id + '_validated']) {
                await validateByLeader(tsId, currentUser);
            }
        }

        alert("Validation effectuée !");
        loadSiteContext(currentSiteId); // Refresh
    };

    return (
        <div className="space-y-6 mt-8 border-t-2 border-slate-200 pt-6">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
                    <h2 className="font-bold text-lg">Validation Chantier</h2>
                    <div className="text-blue-100 text-sm">
                        {currentSiteId ? (sites.find(s => s.id === currentSiteId)?.name || 'Chantier Inconnu') : 'Non pointé'}
                    </div>
                </div>

                <div className="p-4">
                    {!currentSiteId ? (
                        <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg flex items-center gap-3">
                            <span className="text-2xl">🚧</span>
                            <div>
                                <p className="font-bold">Aucun chantier actif</p>
                                <p className="text-sm">Vous devez être pointé sur un chantier pour voir l'équipe et valider les heures.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <h3 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">
                                Équipe présente ({siteUsers.length})
                            </h3>

                            {loading ? (
                                <div className="text-center py-4 text-slate-400">Chargement...</div>
                            ) : (
                                <div className="space-y-2">
                                    {siteUsers.map(user => (
                                        <div key={user.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${user.level === 'chef_equipe' ? 'bg-purple-500' : 'bg-slate-400'
                                                    }`}>
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-800">{user.name}</div>
                                                    <div className="text-xs text-slate-500 capitalize">{user.level || 'Compagnon'}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-slate-800">{weekStats[user.id]?.toFixed(2)}h</div>
                                                <div className="text-xs text-slate-500">Semaine</div>
                                            </div>
                                            <div className="text-xs">
                                                {weekStats[user.id + '_validated'] ? (
                                                    <span className="text-green-600 font-bold">Validé</span>
                                                ) : (
                                                    <span className="text-yellow-600">À valider</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mt-6 pt-4 border-t border-slate-100">
                                {canValidate ? (
                                    isValidationTime ? (
                                        <button
                                            onClick={handleValidateSite}
                                            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-colors flex items-center justify-center gap-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            Valider les heures du chantier
                                        </button>
                                    ) : (
                                        <div className="text-center p-3 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                                            <span className="block mb-1">👀 Consultation uniquement</span>
                                            La validation sera disponible le <strong>Vendredi à partir de 14h00</strong>.
                                        </div>
                                    )
                                ) : (
                                    <div className="text-center text-sm text-slate-400 italic bg-slate-50 p-2 rounded">
                                        Seul le Chef d'équipe peut valider.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LeaderHoursView;

import React from 'react';
import { X, Activity } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';

const ProjectMonitoringModal = ({ onClose }) => {
    const { sites, timeSessions } = useAppContext();
    const navigate = useNavigate();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <Activity className="text-indigo-400" size={24} />
                        </div>
                        <h2 className="text-xl font-bold text-white">Suivi Projets : Écarts Heures</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 custom-scrollbar">
                    <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-900/50 text-slate-400 uppercase text-[10px]">
                                    <tr>
                                        <th className="p-3">Chantier</th>
                                        <th className="p-3 text-right">Prévu</th>
                                        <th className="p-3 text-right">Réalisé</th>
                                        <th className="p-3 text-right">Théorique</th>
                                        <th className="p-3 text-right">Écart</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700">
                                    {(() => {
                                        const siteStats = sites
                                            .filter(s => {
                                                // Keep if active AND (has explicit planned hours OR has tasks with planned hours)
                                                const hasHours = s.planned_hours > 0 || (s.project_tasks && s.project_tasks.reduce((sum, t) => sum + (Number(t.planned_hours) || 0), 0) > 0);
                                                return s.status === 'active' && hasHours;
                                            })
                                            .map(site => {
                                                // Calculate total planned hours (Site level OR sum of tasks)
                                                const taskHours = site.project_tasks ? site.project_tasks.reduce((sum, t) => sum + (Number(t.planned_hours) || 0), 0) : 0;
                                                const totalPlannedHours = site.planned_hours > 0 ? site.planned_hours : taskHours;

                                                const startDate = site.start_date || site.created_at ? new Date(site.start_date || site.created_at) : null;
                                                const endDate = site.end_date ? new Date(site.end_date) : null;
                                                const today = new Date();

                                                let theoreticalHours = 0;
                                                // Only calculate curve if we have valid dates
                                                if (startDate && endDate && endDate > startDate) {
                                                    startDate.setHours(0, 0, 0, 0);
                                                    endDate.setHours(0, 0, 0, 0);
                                                    today.setHours(0, 0, 0, 0);

                                                    const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
                                                    const elapsedDays = Math.max(0, (today - startDate) / (1000 * 60 * 60 * 24));

                                                    if (today >= endDate) {
                                                        theoreticalHours = totalPlannedHours;
                                                    } else {
                                                        const hoursPerDay = totalPlannedHours / totalDays;
                                                        theoreticalHours = Math.round(hoursPerDay * elapsedDays);
                                                    }
                                                } else {
                                                    // Without dates, theoretical is undefined or maybe just N/A. 
                                                    // Let's set it to 0 or handled in UI.
                                                    theoreticalHours = 0;
                                                }

                                                const siteSessions = timeSessions.filter(s => String(s.site_id) === String(site.id));
                                                const totalMs = siteSessions.reduce((acc, s) => {
                                                    const startH = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                                                    const endH = (s.corrected_end_at || s.punch_end_at)
                                                        ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                                                        : new Date().getTime();
                                                    return acc + (endH - startH);
                                                }, 0);
                                                const sessionRealizedHours = Math.round(totalMs / (1000 * 60 * 60));

                                                // Calculate from imported tasks (Base)
                                                const taskRealizedHours = site.project_tasks ? site.project_tasks.reduce((sum, t) => sum + (Number(t.completed_hours) || 0), 0) : 0;

                                                // Total = Imported (Base) + Sessions (New)
                                                const realizedHours = taskRealizedHours + sessionRealizedHours;

                                                // If theoretical is 0 (no dates), gap is purely Realized - Planned (which is negative if under budget, positive if over... wait)
                                                // Standard Gap = Realized - Theoretical (Are we ahead of schedule?)
                                                // User wants "Ecart Heures".

                                                // If theoretical = 0 because no dates, "Theoretical" column should prob show "N/A" or 0.

                                                const gap = theoreticalHours > 0 ? (realizedHours - theoreticalHours) : (realizedHours - totalPlannedHours);
                                                // Fallback: compare against TOTAL if no timeline.

                                                return { ...site, planned_hours: totalPlannedHours, theoreticalHours, realizedHours, gap, hasDates: (startDate && endDate) };
                                            })
                                            .filter(s => s !== null)
                                            .sort((a, b) => b.gap - a.gap); // Sort by highest gap (most problematic first)

                                        if (siteStats.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan="5" className="p-4 text-center text-slate-500 italic">
                                                        Aucune donnée disponible pour le calcul (il faut une date de début, de fin et des heures planifiées)
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return siteStats.map(site => {
                                            const gapPercent = site.theoreticalHours > 0 ? (site.gap / site.theoreticalHours) : 0;
                                            let gapColor = 'text-green-400';
                                            if (gapPercent > 0.20) gapColor = 'text-red-400 font-bold';
                                            else if (gapPercent > 0.10) gapColor = 'text-amber-400 font-bold';
                                            else if (gapPercent < -0.10) gapColor = 'text-blue-400';

                                            return (
                                                <tr key={site.id} onClick={() => { onClose(); navigate(`/sites/${site.id}`); }} className="hover:bg-slate-700/50 cursor-pointer transition-colors">
                                                    <td className="p-3 font-medium text-white">{site.name}</td>
                                                    <td className="p-3 text-right text-slate-400 font-mono">{site.planned_hours}</td>
                                                    <td className="p-3 text-right text-blue-400 font-bold font-mono">{site.realizedHours}</td>
                                                    <td className="p-3 text-right text-slate-500 font-mono">
                                                        {site.hasDates ? site.theoreticalHours : <span className="text-[10px] opacity-50">N/A</span>}
                                                    </td>
                                                    <td className={`p-3 text-right font-bold font-mono ${gapColor}`}>
                                                        {site.gap > 0 ? '+' : ''}{site.gap}
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectMonitoringModal;

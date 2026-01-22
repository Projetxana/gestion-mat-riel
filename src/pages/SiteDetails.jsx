import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ArrowLeft, MapPin, Hammer, ExternalLink, Clock, BarChart3 } from 'lucide-react';
import MaterialDetailsModal from '../components/MaterialDetailsModal';

const SiteDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { sites, materials, timeSessions, tasks } = useAppContext();
    const [selectedTool, setSelectedTool] = useState(null);

    const site = sites.find(s => s.id === Number(id));
    const siteTools = materials.filter(m => m.locationType === 'site' && m.locationId === Number(id));

    if (!site) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold">Chantier Introuvable</h2>
                <button onClick={() => navigate('/sites')} className="text-blue-400 mt-4">Retour aux chantiers</button>
            </div>
        );
    }

    return (
        <div>
            <button
                onClick={() => navigate('/sites')}
                className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft size={20} />
                <span>Retour aux chantiers</span>
            </button>

            <div className="glass-panel p-8 mb-8">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-bold">{site.name}</h1>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${site.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-500/10 text-slate-400'
                                }`}>
                                {site.status}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={18} />
                            <p>{site.address}</p>
                            {(site.geofence_lat && site.geofence_lng) && (
                                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-900/50 text-blue-300 border border-blue-800">
                                    <MapPin size={10} />
                                    GPS Actif
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-8 mt-8 border-t border-slate-800 pt-6">
                    <div>
                        <p className="text-3xl font-bold text-white">{siteTools.length}</p>
                        <p className="text-xs text-slate-500 uppercase font-medium">Matériel Assigné</p>
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-white">{siteTools.filter(t => t.status === 'in_use').length}</p>
                        <p className="text-xs text-slate-500 uppercase font-medium">En Utilisation</p>
                    </div>
                </div>
            </div>


            {/* SUIVI DES HEURES (ADMIN / FOREMAN) */}
            <div className="glass-panel p-8 mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <BarChart3 size={100} />
                </div>

                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Clock className="text-blue-500" />
                    Suivi des Heures
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Main Stats */}
                    <div className="col-span-1 space-y-6">
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-slate-400 text-sm font-bold uppercase">Progression</span>
                                <span className="text-2xl font-bold text-blue-400">
                                    {(() => {
                                        const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                        const totalMs = siteSessions.reduce((acc, s) => {
                                            const start = new Date(s.punch_start_at).getTime();
                                            const end = s.punch_end_at ? new Date(s.punch_end_at).getTime() : new Date().getTime();
                                            return acc + (end - start);
                                        }, 0);
                                        const totalHours = Math.round(totalMs / (1000 * 60 * 60));
                                        const planned = site.planned_hours || 0;
                                        return planned > 0 ? Math.min(100, Math.round((totalHours / planned) * 100)) : 0;
                                    })()}%
                                </span>
                            </div>
                            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-600 to-cyan-400"
                                    style={{
                                        width: `${(() => {
                                            const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                            const totalMs = siteSessions.reduce((acc, s) => {
                                                const start = new Date(s.punch_start_at).getTime();
                                                const end = s.punch_end_at ? new Date(s.punch_end_at).getTime() : new Date().getTime();
                                                return acc + (end - start);
                                            }, 0);
                                            const totalHours = Math.round(totalMs / (1000 * 60 * 60));
                                            const planned = site.planned_hours || 0;
                                            return planned > 0 ? Math.min(100, Math.round((totalHours / planned) * 100)) : 0;
                                        })()}%`
                                    }}
                                ></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <p className="text-xs text-slate-500 uppercase font-bold">Réalisées</p>
                                <p className="text-2xl font-bold text-white">
                                    {(() => {
                                        const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                        const totalMs = siteSessions.reduce((acc, s) => {
                                            const start = new Date(s.punch_start_at).getTime();
                                            const end = s.punch_end_at ? new Date(s.punch_end_at).getTime() : new Date().getTime();
                                            return acc + (end - start);
                                        }, 0);
                                        return Math.round(totalMs / (1000 * 60 * 60));
                                    })()} h
                                </p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <p className="text-xs text-slate-500 uppercase font-bold">Prévues</p>
                                <p className="text-2xl font-bold text-slate-400">{site.planned_hours || 0} h</p>
                            </div>
                        </div>
                    </div>

                    {/* Task Breakdown */}
                    <div className="col-span-1 md:col-span-2">
                        <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Répartition par tâche</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {(() => {
                                const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                const taskBreakdown = {};
                                siteSessions.forEach(s => {
                                    const tId = s.task_id;
                                    if (!taskBreakdown[tId]) taskBreakdown[tId] = 0;
                                    const start = new Date(s.punch_start_at).getTime();
                                    const end = s.punch_end_at ? new Date(s.punch_end_at).getTime() : new Date().getTime();
                                    taskBreakdown[tId] += (end - start);
                                });

                                return Object.entries(taskBreakdown)
                                    .map(([tId, ms]) => ({
                                        name: tasks.find(t => String(t.id) === String(tId))?.name || 'Inconnu',
                                        hours: Math.round((ms / (1000 * 60 * 60)) * 10) / 10
                                    }))
                                    .sort((a, b) => b.hours - a.hours)
                                    .map(stat => (
                                        <div key={stat.name} className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center text-sm">
                                            <span className="text-slate-300 font-medium">{stat.name}</span>
                                            <span className="text-white font-mono font-bold">{stat.hours}h</span>
                                        </div>
                                    ));
                            })()}
                            {(!timeSessions?.some(s => String(s.site_id) === String(id))) && (
                                <p className="text-slate-500 text-sm italic col-span-full">Aucune heure enregistrée.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <h2 className="text-xl font-bold mb-4">Matériel Assigné</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {siteTools.map((tool) => (
                    <div key={tool.id} className="glass-panel p-4 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded bg-slate-800 text-slate-400">
                                <Hammer size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-200">{tool.name}</p>
                                <p className="text-xs text-slate-500">{tool.serialNumber}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedTool(tool)}
                            className="p-2 rounded-full hover:bg-slate-800 text-slate-500 hover:text-blue-400 transition-colors"
                        >
                            <ExternalLink size={18} />
                        </button>
                    </div>
                ))}
                {siteTools.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                        <p>Aucun matériel sur ce site.</p>
                        <p className="text-sm mt-2">Allez dans "Matériel" pour affecter de l'équipement.</p>
                    </div>
                )}
            </div>

            {
                selectedTool && (
                    <MaterialDetailsModal
                        tool={selectedTool}
                        onClose={() => setSelectedTool(null)}
                    />
                )
            }
        </div >
    );
};

export default SiteDetails;

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../supabaseClient';
import { importProjectProgress } from '../utils/excelParser';
import { ArrowLeft, MapPin, Hammer, ExternalLink, Clock, BarChart3, Trash2 } from 'lucide-react';
import MaterialDetailsModal from '../components/MaterialDetailsModal';
import SiteFormModal from '../components/SiteFormModal';
import SitePerformancePanel from '../components/SitePerformancePanel';

const SiteDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const {
        sites, materials,
        projectTasks, updateProjectTask, deleteProjectTask,

        updateSite,
        timeSessions // NEW: Required for realized calculation
    } = useAppContext();
    const [selectedTool, setSelectedTool] = useState(null);
    const [isEditingSite, setIsEditingSite] = useState(false);
    const [editPlannedHours, setEditPlannedHours] = useState(0);
    const [showSiteForm, setShowSiteForm] = useState(false);

    const handleImportProgress = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (confirm("Cet import va mettre à jour l'avancement (Heures Prévues / Réalisées) des sections. Continuer ?")) {
            const result = await importProjectProgress(site.id, file, supabase);
            if (result.success) {
                let msg = `Import terminé.\n`;
                msg += `➕ Ajoutés : ${result.count}\n`;
                msg += `✏️ Mis à jour : ${result.updated}\n`;
                if (result.count === 0 && result.updated === 0) {
                    msg += `\n⚠️ AVERTISSEMENT : Aucun élément traité.\n`;
                    msg += `Détails techniques : ${result.debug}\n`;
                    msg += `Vérifiez que les colonnes 'Tâche', 'Prévu', 'Réalisé' existent.`;
                }
                alert(msg);
            } else {
                alert(`Erreur : ${result.error}`);
            }
        }
        e.target.value = null; // Reset
    };

    const site = sites.find(s => s.id === Number(id));
    const siteTools = materials.filter(m => m.locationType === 'site' && m.locationId === Number(id));
    // Safe access and renamed variable
    const safeProjectTasks = projectTasks ?? [];
    const siteSections = safeProjectTasks.filter(section => String(section.project_id) === String(id));

    if (!site) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold">Chantier Introuvable</h2>
                <button onClick={() => navigate('/sites')} className="text-blue-400 mt-4">Retour aux chantiers</button>
            </div>
        );
    }

    // Computed Globals
    const totalPlanned = site.planned_hours || siteSections.reduce((acc, s) => acc + (s.planned_hours || 0), 0);

    // 1. Imported/Manual Realized Hours (snapshot)
    const totalImportedRealized = siteSections.reduce((acc, s) => acc + (s.completed_hours || 0), 0);

    // 2. Verified Sessions (punches)
    // Filter sessions for this site and sum duration
    const siteSessions = timeSessions ? timeSessions.filter(s => String(s.site_id) === String(site.id)) : [];
    const totalSessionHours = siteSessions.reduce((acc, s) => {
        const start = new Date(s.corrected_start_at || s.punch_start_at).getTime();
        const end = (s.corrected_end_at || s.punch_end_at) ? new Date(s.corrected_end_at || s.punch_end_at).getTime() : new Date().getTime();
        return acc + (end - start);
    }, 0) / (1000 * 60 * 60);

    // 3. Total Realized = Imported (Base) + Sessions (New)
    const totalRealized = totalImportedRealized + Math.round(totalSessionHours);

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
                    <button
                        onClick={() => setShowSiteForm(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition-colors"
                    >
                        Modifier
                    </button>
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


            <SitePerformancePanel site={site} />

            {/* Legacy global/theoretical progress cards were redundant and
                could mistake hours consumed for physical completion.
                Preserve budget editing and Excel import as an advanced tool. */}
            <details className="glass-panel p-4 mb-6">
                <summary className="cursor-pointer text-sm text-slate-300 font-semibold min-h-10 flex items-center">
                    Outils de budget (facultatif)
                </summary>
                <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3">
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                        Budget global prévu (h)
                        <input type="number" min="0" step="0.25" inputMode="decimal"
                            value={isEditingSite ? editPlannedHours : totalPlanned}
                            onChange={event => {
                                setEditPlannedHours(event.target.value);
                                setIsEditingSite(true);
                            }}
                            className="min-h-11 w-36 rounded-lg border border-slate-600 bg-slate-900 px-3 text-white"
                        />
                    </label>
                    <button type="button"
                        disabled={!isEditingSite}
                        onClick={async () => {
                            const result = await updateSite(site.id, { planned_hours: Number(editPlannedHours) });
                            if (!result?.error) setIsEditingSite(false);
                        }}
                        className="min-h-11 px-4 rounded-lg bg-blue-600 font-semibold text-sm disabled:opacity-50">
                        Enregistrer le budget
                    </button>
                    <label className="min-h-11 inline-flex items-center justify-center px-4 rounded-lg bg-slate-800 border border-slate-600 text-blue-200 text-sm cursor-pointer">
                        Importer des budgets Excel
                        <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={handleImportProgress} />
                    </label>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                    Le budget et les heures réalisées restent modifiables dans le détail des tâches.
                    Le rythme théorique fondé seulement sur les dates n'est plus présenté comme un indicateur de productivité.
                </p>
            </details>

            {/* Sections / Lots Breakdown */}
            <details className="glass-panel p-4 sm:p-6 mb-8">
                <summary className="cursor-pointer text-sm font-bold text-slate-300 min-h-10 flex items-center">
                    Détail des tâches et budgets (avancé)
                </summary>
                <div className="mt-4">

                <div className="space-y-3">
                    {/* TABLE HEADER */}
                    <div className="grid grid-cols-5 gap-4 px-3 py-2 text-[10px] uppercase font-bold text-slate-500">
                        <div className="col-span-2">Section</div>
                        <div className="text-right">Prévu</div>
                        <div className="text-right">Réalisé</div>
                        <div className="text-right">Écart</div>
                    </div>

                    {(() => {
                        if (siteSections.length === 0) return <p className="text-slate-500 text-sm italic px-3">Aucune section définie.</p>;

                        // Sort by gap descending (issues first)
                        const sortedSections = [...siteSections].sort((a, b) => {
                            const gapA = (a.completed_hours || 0) - (a.planned_hours || 0);
                            const gapB = (b.completed_hours || 0) - (b.planned_hours || 0);
                            return gapB - gapA;
                        });

                        return sortedSections.map((section) => {
                            const realized = section.completed_hours || 0;
                            const planned = section.planned_hours || 0;
                            const gap = realized - planned;

                            return (
                                <div key={section.id} className="bg-slate-800/50 hover:bg-slate-800 p-3 rounded-lg border border-slate-700 grid grid-cols-5 gap-4 items-center text-sm transition-colors group">
                                    <div className="col-span-2 font-medium text-slate-200 truncate" title={section.name}>{section.name}</div>
                                    <div className="text-right">
                                        <input
                                            type="text" inputMode="decimal"
                                            className="bg-transparent border-b border-slate-600 w-16 text-right font-mono text-slate-400 focus:text-white focus:border-blue-500 outline-none"
                                            value={Number(planned || 0)}
                                            onChange={(e) => {
                                                const v = e.target.value.replace(',', '.');
                                                // Only update if it allows valid number parsing or is empty (0)
                                                if (!isNaN(v)) updateProjectTask(section.id, { planned_hours: Number(v) });
                                            }}
                                        />
                                    </div>
                                    <div className="text-right">
                                        <input
                                            type="text" inputMode="decimal"
                                            className="bg-transparent border-b border-slate-600 w-16 text-right font-mono text-white focus:text-blue-400 focus:border-blue-500 outline-none"
                                            value={Number(realized || 0)}
                                            onChange={(e) => {
                                                const v = e.target.value.replace(',', '.');
                                                if (!isNaN(v)) updateProjectTask(section.id, { completed_hours: Number(v) });
                                            }}
                                        />
                                    </div>
                                    <div className={`text-right font-mono font-bold ${planned === 0 ? 'text-slate-600' :
                                        gap > 0 ? 'text-red-400' : 'text-green-400'
                                        }`}>
                                        {planned > 0 ? (gap > 0 ? '+' : '') + Math.round(gap * 10) / 10 : '-'}
                                    </div>
                                    {/* Optional Delete for non-imported? Or advanced mode? For now, keep simple */}
                                </div>
                            );
                        });
                    })()}
                </div>
                </div>
            </details>

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

            {selectedTool && (
                <MaterialDetailsModal
                    tool={selectedTool}
                    onClose={() => setSelectedTool(null)}
                />
            )}
            {showSiteForm && (
                <SiteFormModal
                    siteToEdit={site}
                    onClose={() => setShowSiteForm(false)}
                />
            )}
        </div>
    );
};

export default SiteDetails;

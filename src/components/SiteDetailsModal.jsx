import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { X, MapPin, Hammer, ExternalLink } from 'lucide-react';
import MaterialDetailsModal from './MaterialDetailsModal';
import SiteFormModal from './SiteFormModal';

const SiteDetailsModal = ({ site: initialSite, onClose }) => {
    const { materials, sites, currentUser, saasSession, currentCompanyId, deleteSite } = useAppContext();
    const [selectedTool, setSelectedTool] = useState(null);
    const [showEditForm, setShowEditForm] = useState(false);
    const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [actionError, setActionError] = useState('');

    // SaaS Auth users carry role="authenticated", not their company role.
    // Show management controls only for a verified tenant administrator.
    useEffect(() => {
        let active = true;
        const userId = saasSession?.user?.id || currentUser?.id;
        if (!userId || !currentCompanyId) {
            setIsCompanyAdmin(false);
            return;
        }
        supabase.from('company_users')
            .select('role')
            .eq('user_id', userId)
            .eq('company_id', currentCompanyId)
            .maybeSingle()
            .then(({ data, error }) => {
                if (active) setIsCompanyAdmin(!error && data?.role === 'admin');
            });
        return () => { active = false; };
    }, [saasSession?.user?.id, currentUser?.id, currentCompanyId]);

    // Get reactive site data from context, fallback to initialSite prop
    const site = sites.find(s => s.id === initialSite.id) || initialSite;

    const handleManage = async (action) => {
        if (isDeleting || !isCompanyAdmin) return;
        setActionError('');
        const message = action === 'restore'
            ? `Restaurer le chantier « ${site.name} » ?`
            : `Retirer le chantier « ${site.name} » ?\n\nS'il contient des heures, du matériel ou un historique réalisé, il sera archivé et ses données conservées. Sinon il sera supprimé définitivement avec ses tâches.`;
        if (!window.confirm(message)) return;
        setIsDeleting(true);
        try {
            const result = await deleteSite(site.id, action);
            if (!result?.success) {
                setActionError(result?.error || 'Opération non confirmée par le serveur.');
                return;
            }
            onClose();
            if (result.action === 'archived') {
                window.alert('Chantier archivé : il a été retiré de la liste normale, mais ses heures, son matériel et son historique sont conservés.');
            }
        } catch (error) {
            setActionError(error?.message || 'Erreur réseau. Aucune suppression confirmée.');
        } finally {
            setIsDeleting(false);
        }
    };

    const siteTools = materials.filter(m => m.locationType === 'site' && m.locationId === site.id);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-slate-800 bg-slate-900/50">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h2 className="text-xl sm:text-2xl font-bold text-white break-words min-w-0">{site.name}</h2>
                            <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium border ${site.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                                {site.status === 'active' ? 'Actif' : site.status}
                            </span>
                        </div>
                        {isCompanyAdmin && (
                            <div className="flex flex-wrap gap-2 my-3" aria-label="Actions sur le chantier">
                                <button type="button" disabled={isDeleting} onClick={() => setShowEditForm(true)}
                                    className="min-h-10 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm font-semibold disabled:opacity-50">
                                    Modifier
                                </button>
                                {site.status === 'archived' ? (
                                    <button type="button" disabled={isDeleting} onClick={() => handleManage('restore')}
                                        className="min-h-10 px-3 py-2 rounded-lg border border-emerald-800 bg-emerald-950/40 text-emerald-300 text-sm font-semibold disabled:opacity-50">
                                        {isDeleting ? 'Restauration…' : 'Restaurer'}
                                    </button>
                                ) : (
                                    <button type="button" disabled={isDeleting} onClick={() => handleManage('remove')}
                                        className="min-h-10 px-3 py-2 rounded-lg border border-red-800 bg-red-950/40 text-red-300 text-sm font-semibold disabled:opacity-50">
                                        {isDeleting ? 'Traitement…' : 'Supprimer'}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={16} />
                            <p className="text-sm">{site.address}</p>
                        </div>

                        {site.email && (
                            <div className="flex items-center gap-2 text-slate-500 mt-1">
                                <p className="text-sm ml-6">{site.email}</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {actionError && <p role="alert" className="px-6 py-3 text-sm text-red-300 bg-red-950/40 border-b border-red-900/50">{actionError}</p>}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
                            <p className="text-3xl font-bold text-white">{siteTools.length}</p>
                            <p className="text-xs text-slate-500 uppercase font-medium">Matériel Assigné</p>
                        </div>
                        <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
                            <p className="text-3xl font-bold text-white">{siteTools.filter(t => t.status === 'in_use').length}</p>
                            <p className="text-xs text-slate-500 uppercase font-medium">En Utilisation</p>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold mb-4">Liste du Matériel</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {siteTools.map((tool) => (
                            <div
                                key={tool.id}
                                onClick={() => setSelectedTool(tool)}
                                className="bg-slate-800/30 border border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-blue-500/30 hover:bg-slate-800/50 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-slate-800/80 text-blue-400">
                                        <Hammer size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-200">{tool.name}</p>
                                        <p className="text-xs text-slate-500">{tool.serialNumber}</p>
                                    </div>
                                </div>
                                <ExternalLink size={16} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                            </div>
                        ))}
                        {siteTools.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-800">
                                <p>Aucun matériel sur ce site.</p>
                                <p className="text-sm mt-2">Allez dans "Matériel" pour affecter de l'équipement.</p>
                            </div>
                        )}
                    </div>
                </div>

                {selectedTool && (
                    <MaterialDetailsModal
                        tool={selectedTool}
                        onClose={() => setSelectedTool(null)}
                    />
                )}

                {showEditForm && (
                    <SiteFormModal
                        siteToEdit={site}
                        onClose={() => setShowEditForm(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default SiteDetailsModal;

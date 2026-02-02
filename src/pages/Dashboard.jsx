import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Hammer, HardHat, AlertTriangle, Activity, Camera, ClipboardList, Image as ImageIcon, Users, Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import DeliveryNoteModal from '../components/DeliveryNoteModal';
import DailyReportModal from '../components/DailyReportModal';
import InvoiceModal from '../components/InvoiceModal';
import SiteOccupancyModal from '../components/SiteOccupancyModal';
import ProjectMonitoringModal from '../components/ProjectMonitoringModal';
import SiteFormModal from '../components/SiteFormModal';

const Dashboard = () => {
    const { materials, sites, addLog, timeSessions, currentUser } = useAppContext();
    const navigate = useNavigate();
    const [showCamera, setShowCamera] = useState(false);
    const [showDailyReport, setShowDailyReport] = useState(false);
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [selectedSiteForOccupancy, setSelectedSiteForOccupancy] = useState(null);
    const [showProjectMonitoring, setShowProjectMonitoring] = useState(false);
    const [showSiteForm, setShowSiteForm] = useState(false);

    // Live View Logic
    const activeSessions = timeSessions.filter(s => s.punch_end_at === null);
    const activeSitesWithCount = sites.map(site => {
        const count = activeSessions.filter(s => String(s.site_id) === String(site.id)).length;
        return { ...site, activeCount: count };
    }).filter(s => s.activeCount > 0).sort((a, b) => b.activeCount - a.activeCount);

    const totalTools = materials.length;
    const toolsOnSite = materials.filter(m => m.locationType === 'site').length;
    const toolsInRepair = materials.filter(m => m.locationType === 'repair').length;
    const toolsAvailable = materials.filter(m => m.locationType === 'warehouse').length;

    const handleCameraClick = () => {
        setShowCamera(true);
    };

    // Determine color variables based on stats
    const stats = [
        {
            label: 'Total',
            value: totalTools,
            icon: Hammer,
            color: 'blue',
            path: '/material',
            className: 'bg-blue-600',
        },
        {
            label: 'Chantier',
            value: toolsOnSite,
            icon: HardHat,
            color: 'green',
            path: '/sites',
            className: 'bg-emerald-600',
        },
        {
            label: 'Réparation',
            value: toolsInRepair,
            icon: AlertTriangle,
            color: 'orange',
            path: '/material?filter=repair',
            className: 'bg-orange-600',
        },
        {
            label: 'Dépôt',
            value: toolsAvailable,
            icon: Activity,
            color: 'purple',
            path: '/material?filter=available',
            className: 'bg-indigo-600',
        },
    ];

    return (
        <div className="flex flex-col h-full max-w-lg mx-auto pb-4">
            {/* Header with Add Site Button for Admins */}
            <div className="flex items-center justify-between mb-6 mt-2">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">
                        Tableau de Bord
                    </h1>
                    <p className="text-sm text-slate-400">Bienvenue</p>
                </div>
                {(currentUser?.role === 'admin' || currentUser?.role === 'foreman') && (
                    <button
                        onClick={() => setShowSiteForm(true)}
                        className="p-2 bg-blue-600 hover:bg-blue-500 rounded-full text-white shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                    >
                        <Plus size={24} />
                    </button>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                    onClick={handleCameraClick}
                    className="flex flex-col items-center justify-center p-4 bg-amber-500 rounded-2xl shadow-lg active:scale-95 transition-transform"
                >
                    <div className="p-2 bg-white/20 rounded-full mb-2">
                        <Camera size={24} className="text-white" />
                    </div>
                    <span className="font-bold text-white text-sm">Livraison</span>
                </button>

                <button
                    onClick={() => setShowDailyReport(true)}
                    className="flex flex-col items-center justify-center p-4 bg-emerald-500 rounded-2xl shadow-lg active:scale-95 transition-transform"
                >
                    <div className="p-2 bg-white/20 rounded-full mb-2">
                        <ClipboardList size={24} className="text-white" />
                    </div>
                    <span className="font-bold text-white text-sm">Rapport</span>
                </button>
            </div>

            {/* Hilti Module - Moved Up */}
            <Link to="/hilti" className="block relative overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-red-900 to-slate-900 border border-red-900/50 shadow-lg active:scale-95 transition-transform mb-4">
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-xl">
                            <img src="/hilti-logo.png" alt="Hilti" className="h-5 w-auto object-contain" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm">Module HILTI</h3>
                            <p className="text-xs text-slate-400">Gestion outillage spécifique</p>
                        </div>
                    </div>
                </div>
            </Link>

            {/* Live Site View (Admin Only) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'foreman' || currentUser?.level === "Chef d'équipe") && activeSitesWithCount.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        En Direct sur Chantier
                    </h3>
                    <div className="space-y-3">
                        {activeSitesWithCount.map(site => (
                            <button
                                key={site.id}
                                onClick={() => setSelectedSiteForOccupancy(site)}
                                className="w-full bg-slate-800 hover:bg-slate-750 p-4 rounded-xl border border-slate-700 shadow-md flex justify-between items-center transition-all group"
                            >
                                <div className="text-left">
                                    <h4 className="font-bold text-white group-hover:text-blue-400 transition-colors">{site.name}</h4>
                                    <p className="text-xs text-slate-500">{site.address || 'Aucune adresse'}</p>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700">
                                    <Users size={14} className="text-blue-400" />
                                    <span className="font-mono font-bold text-white">{site.activeCount}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ALERTS: CHANTIERS EN DÉRIVE (Admin Only) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'foreman') && (
                <div className="mb-6">
                    {(() => {
                        const driftingSites = [];
                        sites.forEach(site => {
                            if (site.status !== 'active' || !site.planned_hours || !site.end_date) return;

                            const start = new Date(site.start_date || site.created_at).getTime();
                            const end = new Date(site.end_date).getTime();
                            const now = new Date().getTime();
                            if (end <= start || now < start) return;

                            // Time Calculation
                            const totalDays = (end - start) / (1000 * 60 * 60 * 24);
                            const elapsedDays = Math.max(0.1, (now - start) / (1000 * 60 * 60 * 24));
                            if (elapsedDays <= 0) return;

                            // Hours Calculation
                            const siteSessions = timeSessions.filter(s => String(s.site_id) === String(site.id));
                            const totalMs = siteSessions.reduce((acc, s) => {
                                const startH = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                                const endH = (s.corrected_end_at || s.punch_end_at)
                                    ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                                    : new Date().getTime();
                                return acc + (endH - startH);
                            }, 0);
                            const totalHours = totalMs / (1000 * 60 * 60);

                            // Ratio Checking (1.15)
                            const plannedPerDay = site.planned_hours / totalDays;
                            const realizedPerDay = totalHours / elapsedDays;
                            const ratio = realizedPerDay / plannedPerDay;

                            if (ratio > 1.15) {
                                driftingSites.push({ ...site, ratio });
                            }
                        });

                        if (driftingSites.length === 0) return null;

                        return (
                            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 animate-in fade-in zoom-in duration-300">
                                <h3 className="text-red-400 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <AlertTriangle size={14} />
                                    Alertes Rythme
                                </h3>
                                <div className="space-y-2">
                                    {driftingSites.map(site => (
                                        <button
                                            key={site.id}
                                            onClick={() => navigate(`/sites/${site.id}`)}
                                            className="w-full flex items-center justify-between text-left p-2 hover:bg-red-500/10 rounded-lg transition-colors group"
                                        >
                                            <span className="text-white font-medium text-sm group-hover:underline">{site.name}</span>
                                            <span className="text-xs font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded">
                                                +{Math.round((site.ratio - 1) * 100)}% Rapide
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* SUIVI PROJETS (Admin / Foreman Only) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'foreman') && (
                <button
                    onClick={() => setShowProjectMonitoring(true)}
                    className="block w-full relative overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-indigo-900 to-slate-900 border border-indigo-900/50 shadow-lg active:scale-95 transition-transform mb-4"
                >
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/20 rounded-xl">
                                <Activity className="text-indigo-400" size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-white text-sm">Suivi Projets</h3>
                                <p className="text-xs text-slate-400">Vue direction : Écarts Heures</p>
                            </div>
                        </div>
                    </div>
                </button>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                {stats.map((stat, index) => (
                    <button
                        key={index}
                        onClick={() => navigate(stat.path)}
                        className={`relative overflow-hidden p-4 rounded-2xl shadow-lg text-left transition-transform active:scale-95 ${stat.className}`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <stat.icon size={20} className="text-white/70" />
                            <span className="text-2xl font-bold text-white">{stat.value}</span>
                        </div>
                        <span className="text-xs font-medium text-white/80 uppercase tracking-wide">
                            {stat.label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Invoices Module - New Block */}
            <button
                onClick={() => setShowInvoiceModal(true)}
                className="block w-full relative overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 shadow-lg active:scale-95 transition-transform mt-auto"
            >
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-xl">
                            <ImageIcon className="text-blue-400" size={20} />
                        </div>
                        <div className="text-left">
                            <h3 className="font-bold text-white text-sm">Mes Factures</h3>
                            <p className="text-xs text-slate-400">Envoyer des photos</p>
                        </div>
                    </div>
                </div>
            </button>

            {showCamera && <DeliveryNoteModal onClose={() => setShowCamera(false)} />}
            {showDailyReport && <DailyReportModal onClose={() => setShowDailyReport(false)} />}
            {showInvoiceModal && <InvoiceModal onClose={() => setShowInvoiceModal(false)} />}
            {selectedSiteForOccupancy && (
                <SiteOccupancyModal
                    site={selectedSiteForOccupancy}
                    onClose={() => setSelectedSiteForOccupancy(null)}
                />
            )}
            {showProjectMonitoring && <ProjectMonitoringModal onClose={() => setShowProjectMonitoring(false)} />}
            {showSiteForm && <SiteFormModal onClose={() => setShowSiteForm(false)} />}
        </div>
    );
};


export default Dashboard;

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Hammer, HardHat, AlertTriangle, Activity, Camera, ClipboardList, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../supabaseClient';
import InvoiceModal from '../components/InvoiceModal';

const Dashboard = () => {
    const { materials, sites, addLog } = useAppContext();
    const navigate = useNavigate();
    const [showCamera, setShowCamera] = useState(false);
    const [showDailyReport, setShowDailyReport] = useState(false);
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);

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
            {/* Header */}
            <div className="text-center mb-6 mt-2">
                <h1 className="text-2xl font-bold text-white mb-1">
                    Tableau de Bord
                </h1>
                <p className="text-sm text-slate-400">Bienvenue</p>
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
        </div>
    );
};


export default Dashboard;

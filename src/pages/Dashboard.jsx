import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Hammer, HardHat, AlertTriangle, Activity } from 'lucide-react';

const Dashboard = () => {
    const { materials, sites } = useAppContext();
    const navigate = useNavigate();

    const totalTools = materials.length;
    const toolsOnSite = materials.filter(m => m.locationType === 'site').length;
    const toolsInRepair = materials.filter(m => m.locationType === 'repair').length;
    const toolsAvailable = materials.filter(m => m.locationType === 'warehouse').length;

    // Determine color variables based on stats
    const stats = [
        {
            label: 'Total Outils',
            value: totalTools,
            icon: Hammer,
            color: 'blue',
            path: '/material',
            className: 'bg-blue-600 border-blue-500 shadow-blue-900/40 hover:bg-blue-500',
            iconClass: 'bg-white/20 text-white'
        },
        {
            label: 'Sur Chantier',
            value: toolsOnSite,
            icon: HardHat,
            color: 'green',
            path: '/sites',
            className: 'bg-emerald-600 border-emerald-500 shadow-emerald-900/40 hover:bg-emerald-500',
            iconClass: 'bg-white/20 text-white'
        },
        {
            label: 'En Réparation',
            value: toolsInRepair,
            icon: AlertTriangle,
            color: 'orange',
            path: '/material?filter=repair',
            className: 'bg-orange-600 border-orange-500 shadow-orange-900/40 hover:bg-orange-500',
            iconClass: 'bg-white/20 text-white'
        },
        {
            label: 'Disponible',
            value: toolsAvailable,
            icon: Activity,
            color: 'purple',
            path: '/material?filter=available',
            className: 'bg-indigo-600 border-indigo-500 shadow-indigo-900/40 hover:bg-indigo-500',
            iconClass: 'bg-white/20 text-white'
        },
    ];

    return (
        <div className="h-full flex flex-col justify-center max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
                <h1 className="text-5xl font-extrabold text-white mb-6 tracking-tight">
                    Tableau de bord
                </h1>
                <p className="text-xl text-slate-300 font-light">Bienvenue sur votre espace de gestion</p>
            </div>

            {/* KPI Cards as Main Navigation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {stats.map((stat, index) => (
                    <button
                        key={index}
                        onClick={() => navigate(stat.path)}
                        className={`group relative overflow-hidden p-8 rounded-3xl border transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl text-left shadow-lg ${stat.className}`}
                    >
                        {/* Decorative background shape */}
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-8">
                                <div className={`p-4 rounded-2xl ${stat.iconClass}`}>
                                    <stat.icon size={36} />
                                </div>
                                <span className="text-5xl font-bold text-white tracking-tight">
                                    {stat.value}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-2">
                                    {stat.label}
                                </h3>
                                <div className="h-1 w-12 bg-white/30 rounded-full group-hover:w-full transition-all duration-500" />
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default Dashboard;

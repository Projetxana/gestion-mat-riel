import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Hammer, HardHat, ClipboardList, Settings, LogOut } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const Sidebar = ({ isOpen, onClose }) => {
    const { logout, currentUser, companyInfo } = useAppContext();

    const navItems = [
        { icon: LayoutDashboard, label: 'Tableau de bord', path: '/' },
        { icon: Hammer, label: 'Matériel', path: '/material' },
        { icon: HardHat, label: 'Chantiers', path: '/sites' },
        { icon: ClipboardList, label: 'Journal', path: '/journal' },
        { icon: Settings, label: 'Paramètres', path: '/settings' },
    ];

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={onClose}
                />
            )}

            {/* Sidebar content */}
            <div className={`
                w-64 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-50 transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
                md:translate-x-0
            `}>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-wide">GESTION MATÉRIEL</h1>
                        <p className="text-xs text-slate-500 mt-1">Société : {companyInfo?.name || 'Antigravity Inc.'}</p>
                    </div>
                    {/* Close button on mobile only */}
                    <button onClick={onClose} className="md:hidden text-slate-400 hover:text-slate-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => onClose()} // Close menu when clicking a link on mobile
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
                                    ? 'bg-slate-100 text-slate-900 font-bold shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                }`
                            }
                        >
                            <item.icon size={20} />
                            <span className="font-medium text-lg">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-100">
                    <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                            {currentUser?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium text-slate-900 truncate">{currentUser?.name}</p>
                            <p className="text-xs text-slate-500 truncate capitalize">{currentUser?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-2 px-4 py-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-sm"
                    >
                        <LogOut size={16} />
                        <span>Déconnexion</span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default Sidebar;

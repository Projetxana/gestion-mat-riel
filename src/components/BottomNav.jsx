import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Hammer, HardHat, ClipboardList, Settings, Clock } from 'lucide-react';

const BottomNav = () => {
    const navItems = [
        { icon: LayoutDashboard, label: 'Accueil', path: '/' },
        { icon: HardHat, label: 'Chantiers', path: '/sites' },
        { icon: Clock, label: 'Heures', path: '/hours', isSpecial: true },
        { icon: Hammer, label: 'Matériel', path: '/material' },
        { icon: Settings, label: 'Param.', path: '/settings' },
    ];

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pb-safe z-50">
            <div className="flex justify-between items-end h-16 px-2">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            item.isSpecial
                                ? `relative -top-5 flex flex-col items-center justify-center w-16 h-16 rounded-full shadow-lg shadow-blue-900/50 transition-transform active:scale-95 ${isActive ? 'bg-blue-500 text-white ring-4 ring-slate-900' : 'bg-slate-800 text-slate-400 border border-slate-700'}`
                                : `flex flex-col items-center justify-center w-full h-full pb-2 transition-colors ${isActive
                                    ? 'text-blue-500'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`
                        }
                    >
                        <item.icon size={item.isSpecial ? 28 : 22} className={item.isSpecial ? '' : 'mb-1'} />
                        {!item.isSpecial && <span className="text-[10px] font-medium">{item.label}</span>}
                    </NavLink>
                ))}
            </div>
        </div>
    );
};

export default BottomNav;

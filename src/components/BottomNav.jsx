import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Hammer, HardHat, ClipboardList, Settings } from 'lucide-react';

const BottomNav = () => {
    const navItems = [
        { icon: LayoutDashboard, label: 'Accueil', path: '/' },
        { icon: Hammer, label: 'Matériel', path: '/material' },
        { icon: HardHat, label: 'Chantiers', path: '/sites' },
        { icon: ClipboardList, label: 'Journal', path: '/journal' },
        { icon: Settings, label: 'Param.', path: '/settings' },
    ];

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pb-safe z-50">
            <div className="flex justify-around items-center h-16">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex flex-col items-center justify-center w-full h-full transition-colors ${isActive
                                ? 'text-blue-500'
                                : 'text-slate-500 hover:text-slate-300'
                            }`
                        }
                    >
                        <item.icon size={22} className="mb-1" />
                        <span className="text-[10px] font-medium">{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </div>
    );
};

export default BottomNav;

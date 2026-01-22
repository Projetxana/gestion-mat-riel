import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { useAppContext } from '../context/AppContext';

const Layout = () => {
    // Sidebar on mobile is no longer used, but kept for desktop responsiveness if needed in future
    // For now we just don't offer a way to open it on mobile
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { companyInfo } = useAppContext();

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
            {/* Mobile Header - Simplified without Menu button */}
            <div className="md:hidden bg-white border-b border-slate-200 p-3 flex items-center justify-center sticky top-0 z-30 shadow-sm">
                <div className="flex items-center gap-2">
                    <img src="/company-logo-small.png" alt="Logo" className="h-8 w-auto object-contain" />
                    <span className="font-bold text-slate-900">{companyInfo?.name || 'Antigravity'}</span>
                </div>
            </div>

            {/* Sidebar - Hidden on mobile by default styles (usually hidden unless isOpen is true or screen is md)
                We keep the component for Desktop view which is likely handled by CSS media queries in Sidebar itself
                or the parent flex-row layout.
            */}
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* Main Content */}
            {/* Added pb-20 for mobile bottom nav spacing */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto h-[calc(100vh-65px)] md:h-screen pb-24 md:pb-8">
                <div className="max-w-7xl mx-auto">
                    <Outlet />
                </div>
            </main>

            {/* Bottom Navigation for Mobile */}
            <BottomNav />
        </div>
    );
};

export default Layout;

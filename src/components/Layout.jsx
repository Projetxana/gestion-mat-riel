import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import SmartCorrectionPopup from './SmartCorrectionPopup';
import { useAppContext } from '../context/AppContext';

const Layout = () => {
    // Sidebar on mobile is no longer used, but kept for desktop responsiveness if needed in future
    // For now we just don't offer a way to open it on mobile
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    // Geofence Entry Logic
    const { companyInfo, lastGeofenceEntry, timeSessions, sites, currentUser } = useAppContext();
    const [showEntryPopup, setShowEntryPopup] = useState(false);
    const [entrySite, setEntrySite] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (lastGeofenceEntry && currentUser) {
            // Check if user already has an active session
            const activeSession = timeSessions.find(s => s.user_id === currentUser.id && s.punch_end_at === null);

            if (!activeSession) {
                // Find site name
                const site = sites.find(s => s.id === lastGeofenceEntry.siteId);
                if (site) {
                    setEntrySite(site);
                    setShowEntryPopup(true);
                }
            }
        }
    }, [lastGeofenceEntry, timeSessions, currentUser, sites]);

    const handleStartDay = () => {
        setShowEntryPopup(false);
        // Navigate to TimeTracking with site pre-selection intent (passed via state)
        navigate('/timetracking', { state: { autoSelectSiteId: entrySite?.id } });
    };

    // Morning Discipline Logic
    const [showReminderPopup, setShowReminderPopup] = useState(false);

    useEffect(() => {
        const checkTime = () => {
            const now = new Date();
            const day = now.getDay(); // 0 is Sunday
            const hours = now.getHours();
            const minutes = now.getMinutes();
            const totalMinutes = hours * 60 + minutes;

            // Weekdays only, between 6:05 AM (365) and 10:00 AM (600)
            if (day >= 1 && day <= 5 && totalMinutes >= 365 && totalMinutes <= 600) {
                if (currentUser && !timeSessions.find(s => s.user_id === currentUser.id && s.punch_end_at === null)) {
                    const today = new Date().toLocaleDateString();
                    const lastReminded = localStorage.getItem('lastMorningReminder');

                    if (lastReminded !== today) {
                        setShowReminderPopup(true);
                    }
                }
            }
        };

        checkTime();
        const interval = setInterval(checkTime, 60000);
        return () => clearInterval(interval);
    }, [currentUser, timeSessions]);

    const handleStartReminder = () => {
        localStorage.setItem('lastMorningReminder', new Date().toLocaleDateString());
        setShowReminderPopup(false);
        navigate('/timetracking');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
            {/* Mobile Header - Simplified without Menu button */}
            <div className="md:hidden bg-white border-b border-slate-200 p-3 flex items-center justify-center sticky top-0 z-30 shadow-sm">
                <div className="flex items-center gap-2">
                    <img src="/company-logo-small.png" alt="Logo" className="h-8 w-auto object-contain" />
                    <span className="font-bold text-slate-900">{companyInfo?.name || 'Antigravity'}</span>
                </div>
            </div>

            {/* Sidebar */}
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto h-[calc(100vh-65px)] md:h-screen pb-24 md:pb-8">
                <div className="max-w-7xl mx-auto">
                    <Outlet />
                </div>
            </main>

            {/* Bottom Navigation for Mobile */}
            <BottomNav />

            {/* Global Popups */}
            {showEntryPopup && entrySite && (
                <SmartCorrectionPopup
                    type="entry"
                    gpsTime={entrySite.name}
                    onConfirm={handleStartDay}
                    onCancel={() => setShowEntryPopup(false)}
                />
            )}

            {showReminderPopup && (
                <SmartCorrectionPopup
                    type="reminder"
                    gpsTime={new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    onConfirm={handleStartReminder}
                    onCancel={() => setShowReminderPopup(false)}
                />
            )}
        </div>
    );
};

export default Layout;

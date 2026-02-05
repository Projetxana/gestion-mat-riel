import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Clock } from 'lucide-react';

const GlobalTimer = () => {
    const { timeSessions, currentUser, projectTasks, sites } = useAppContext();
    const navigate = useNavigate();
    const location = useLocation();
    const [elapsed, setElapsed] = useState('');
    const [activeSession, setActiveSession] = useState(null);

    // 1. Find Active Session
    useEffect(() => {
        const active = timeSessions.find(s =>
            String(s.user_id) === String(currentUser?.id) &&
            s.punch_end_at === null
        );
        setActiveSession(active);
    }, [timeSessions, currentUser]);

    // 2. Timer Logic
    useEffect(() => {
        if (!activeSession) return;

        const start = new Date(activeSession.punch_start_at).getTime();
        const update = () => {
            const now = new Date().getTime();
            const diff = now - start;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setElapsed(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        };

        const interval = setInterval(update, 1000);
        update(); // initial

        return () => clearInterval(interval);
    }, [activeSession]);

    // 3. Render
    // Don't show on login/public pages or if no session
    if (!currentUser || !activeSession) return null;

    // Don't show on TimeTrackingPage itself (redundant)
    if (location.pathname === '/timetracking' || location.pathname === '/hours') return null;

    // Resolve Name
    const getTaskName = () => {
        if (activeSession.section_id) {
            const section = projectTasks?.find(pt => String(pt.id) === String(activeSession.section_id));
            if (section) return section.name;
        }
        // Fallback for legacy
        if (activeSession.task_id) {
            const site = sites.find(s => s.id === activeSession.site_id);
            const task = site?.tasks?.find(t => t.id === activeSession.task_id);
            if (task) return task.name;
        }
        return 'Tâche Inconnue';
    };

    return (
        <div
            onClick={() => navigate('/timetracking')}
            className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white px-4 py-2 shadow-lg flex items-center justify-between cursor-pointer animate-in slide-in-from-top duration-300"
        >
            <div className="flex items-center gap-2">
                <div className="bg-white/20 p-1 rounded-full animate-pulse">
                    <Clock size={16} className="text-white" />
                </div>
                <span className="font-bold text-sm truncate max-w-[200px]">{getTaskName()}</span>
            </div>
            <div className="font-mono font-bold text-sm tracking-widest">
                {elapsed}
            </div>
        </div>
    );
};

export default GlobalTimer;

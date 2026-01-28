import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from './AppContext';

export const DemoProvider = ({ children }) => {
    // --- MOCK STATE ---
    const [materials, setMaterials] = useState([
        { id: 1, name: 'Perceuse Percussion', brand: 'Hilti', model: 'TE 6-A36', serialNumber: '12345', status: 'available', locationType: 'depot', locationId: null },
        { id: 2, name: 'Marteau Piqueur', brand: 'Hilti', model: 'TE 1000', serialNumber: '67890', status: 'in_use', locationType: 'site', locationId: 101 },
        { id: 3, name: 'Scanner Mural', brand: 'Hilti', model: 'PS 50', serialNumber: '54321', status: 'maintenance', locationType: 'depot', locationId: null },
    ]);

    const [sites, setSites] = useState([
        { id: 101, name: 'Tour Eiffel - Rénovation', address: 'Champ de Mars, Paris', status: 'active', planned_hours: 500, start_date: '2026-01-01', end_date: '2026-06-30', tasks: [] },
        { id: 102, name: 'Stade de France - Sièges', address: 'Saint-Denis', status: 'active', planned_hours: 1200, start_date: '2026-02-15', end_date: '2026-08-15', tasks: [] },
        { id: 103, name: 'Atelier Central', address: 'Ivry-sur-Seine', status: 'active', planned_hours: 0, start_date: '2026-01-01', end_date: null, tasks: [] },
    ]);

    const [users, setUsers] = useState([
        { id: 'u1', name: 'Jean Dupont', role: 'admin', email: 'jean@demo.com', level: 'N4' },
        { id: 'u2', name: 'Michel Foreman', role: 'user', email: 'michel@demo.com', level: 'N3' },
        { id: 'u3', name: 'Thomas Ouvrier', role: 'user', email: 'thomas@demo.com', level: 'N2' },
        { id: 'u4', name: 'Lucas Apprenti', role: 'user', email: 'lucas@demo.com', level: 'N1' },
    ]);

    const [tasks, setTasks] = useState([
        { id: 't1', name: 'Installation', site_id: 101, planned_hours: 100, is_active: true },
        { id: 't2', name: 'Câblage', site_id: 101, planned_hours: 50, is_active: true },
        { id: 't3', name: 'Peinture', site_id: 102, planned_hours: 200, is_active: true },
        { id: 't4', name: 'Maçonnerie', site_id: 102, planned_hours: 400, is_active: true },
    ]);

    // Populate sites with tasks for UI consistency
    useEffect(() => {
        setSites(prev => prev.map(s => ({
            ...s,
            tasks: tasks.filter(t => t.site_id === s.id)
        })));
    }, [tasks]);

    const [timeSessions, setTimeSessions] = useState([
        // Past sessions
        { id: 's1', user_id: 'u2', site_id: 101, task_id: 't1', punch_start_at: '2026-01-20T08:00:00', punch_end_at: '2026-01-20T12:00:00', duration_hours: 4, approved: true },
        { id: 's2', user_id: 'u2', site_id: 101, task_id: 't2', punch_start_at: '2026-01-20T13:00:00', punch_end_at: '2026-01-20T17:00:00', duration_hours: 4, approved: true },
        // Active session for Demo User?
    ]);

    const [currentUser, setCurrentUser] = useState({ id: 'demo1', name: 'DEMO ADMIN', role: 'admin', email: 'demo@antigravity.fake' });
    const [companyInfo, setCompanyInfo] = useState({ name: 'Demo Corp Ltd.', address: '123 Fake Street' });
    const [logs, setLogs] = useState([{ id: 1, action: 'LOGIN', details: 'Demo Mode Started', timestamp: new Date() }]);

    // Hilti Mock
    const [hiltiTools, setHiltiTools] = useState([
        { id: 1, name: 'TE 6-A36', serial_number: 'DEMO-123', assigned_to: 'u2', status: 'ok' }
    ]);

    // Geofence Mock
    const [lastGeofenceEntry, setLastGeofenceEntry] = useState(null);
    const [lastGeofenceExit, setLastGeofenceExit] = useState(null);
    const [currentGeofenceSiteId, setCurrentGeofenceSiteId] = useState(null);

    // --- ACTIONS ---

    const login = async () => ({ success: true }); // Always success
    const logout = async () => window.location.reload(); // Reset demo
    const changePassword = async () => ({ success: true });

    const addSite = async (site) => {
        const newId = Math.floor(Math.random() * 10000);
        const newSite = { ...site, id: newId, created_at: new Date() };

        // Extract tasks if any
        if (site.tasks) {
            const newTasks = site.tasks.map((t, i) => ({ ...t, id: `t-new-${Date.now()}-${i}`, site_id: newId }));
            setTasks(prev => [...prev, ...newTasks]);
            newSite.tasks = newTasks; // For local display
        }

        setSites(prev => [...prev, newSite]);
        addLog(`Added Site: ${site.name}`);
    };

    const updateSite = async (id, updates) => {
        setSites(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const deleteSite = async (id) => {
        setSites(prev => prev.filter(s => s.id !== id));
    };

    const addTask = async (task) => {
        const newTask = { ...task, id: `t-${Date.now()}` };
        setTasks(prev => [...prev, newTask]);
        // Update site tasks as well
        setSites(prev => prev.map(s => s.id === task.site_id ? { ...s, tasks: [...(s.tasks || []), newTask] } : s));
        return { success: true, task: newTask };
    };

    const updateTask = async (id, updates) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const startTimeSession = async (siteId, taskId) => {
        const newSession = {
            id: `s-${Date.now()}`,
            user_id: currentUser.id,
            site_id: siteId,
            task_id: taskId,
            punch_start_at: new Date(),
            manual_entry: false
        };
        setTimeSessions(prev => [newSession, ...prev]);
        return { success: true };
    };

    const endTimeSession = async (sessionId, data) => {
        setTimeSessions(prev => prev.map(s => s.id === sessionId ? { ...s, punch_end_at: new Date(), ...data } : s));
        return { success: true };
    };

    const switchTask = async (currentSessionId, newTaskId, siteId) => {
        await endTimeSession(currentSessionId);
        await startTimeSession(siteId, newTaskId);
        return { success: true };
    };

    const logManualTime = async (siteId, taskId, start, end) => {
        const newSession = {
            id: `m-${Date.now()}`,
            user_id: currentUser.id,
            site_id: siteId,
            task_id: taskId,
            punch_start_at: start,
            punch_end_at: end,
            manual_entry: true,
            duration_hours: (new Date(end) - new Date(start)) / 3600000
        };
        setTimeSessions(prev => [newSession, ...prev]);
        return { success: true };
    };

    // Unused or simple mocks
    const addMaterial = () => { };
    const updateMaterial = () => { };
    const deleteMaterial = () => { };
    const transferTool = () => { };
    const addLog = (msg) => setLogs(prev => [{ id: Date.now(), details: msg, timestamp: new Date() }, ...prev]);
    const updateCompanyInfo = () => { };
    const addUser = () => { };
    const updateUser = () => { };
    const deleteUser = () => { };
    const updateHiltiTool = () => { };
    const clearData = () => { };
    const importTasksFromExcel = async () => ({ success: true, count: 5 });

    const value = {
        isDemo: true, // FLAG
        materials, sites, users, logs, tasks, timeSessions, hiltiTools,
        currentUser, companyInfo,
        login, logout, changePassword,
        addSite, updateSite, deleteSite,
        addTask, updateTask,
        startTimeSession, endTimeSession, switchTask, logManualTime,
        addLog, addMaterial, updateMaterial, deleteMaterial, transferTool,
        updateCompanyInfo, addUser, updateUser, deleteUser, updateHiltiTool,
        clearData, importTasksFromExcel,
        lastGeofenceEntry, lastGeofenceExit, currentGeofenceSiteId
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

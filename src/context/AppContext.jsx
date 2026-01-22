import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { initialHiltiTools, initialHiltiUsers } from '../data/hiltiData';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    // State
    const [materials, setMaterials] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [tasks, setTasks] = useState([]); // Time Tracking
    const [timeSessions, setTimeSessions] = useState([]); // Time Tracking
    const [hiltiTools, setHiltiTools] = useState([]); // Hilti State
    const [companyInfo, setCompanyInfo] = useState({ name: 'Antigravity Inc.', address: 'Loading...' });
    const [currentUser, setCurrentUser] = useState(null);
    const [dbError, setDbError] = useState(null);

    // Initial Data Fetch
    // Geofence State
    const [lastGeofenceEntry, setLastGeofenceEntry] = useState(null);
    const [lastGeofenceExit, setLastGeofenceExit] = useState(null);
    const [currentGeofenceSiteId, setCurrentGeofenceSiteId] = useState(null);

    // Initial Data Fetch & Geofence Watcher
    useEffect(() => {
        fetchData();

        // GEOLOCATION WATCHER (W6, W7)
        let watchId;
        if ('geolocation' in navigator) {
            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    checkGeofences(latitude, longitude);
                },
                (err) => console.log("Geo Error:", err),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        }

        // Real-time subscriptions
        const channels = [
            supabase.channel('public:materials').on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, payload => {
                const mapItem = (item) => ({
                    ...item,
                    serialNumber: item.serial_number,
                    qrCode: item.qr_code,
                    locationType: item.location_type,
                    locationId: item.location_id
                });
                if (payload.eventType === 'INSERT') setMaterials(prev => [...prev, mapItem(payload.new)]);
                if (payload.eventType === 'UPDATE') setMaterials(prev => prev.map(item => item.id === payload.new.id ? mapItem(payload.new) : item));
                if (payload.eventType === 'DELETE') setMaterials(prev => prev.filter(item => item.id !== payload.old.id));
            }).subscribe(),

            supabase.channel('public:sites').on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, payload => {
                if (payload.eventType === 'INSERT') setSites(prev => [...prev, payload.new]);
                if (payload.eventType === 'UPDATE') setSites(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
                if (payload.eventType === 'DELETE') setSites(prev => prev.filter(item => item.id !== payload.old.id));
            }).subscribe(),

            supabase.channel('public:users').on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
                if (payload.eventType === 'INSERT') setUsers(prev => [...prev, payload.new]);
                if (payload.eventType === 'UPDATE') setUsers(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
                if (payload.eventType === 'DELETE') setUsers(prev => prev.filter(item => item.id !== payload.old.id));
            }).subscribe(),

            supabase.channel('public:logs').on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, payload => {
                if (payload.eventType === 'INSERT') setLogs(prev => [payload.new, ...prev]);
            }).subscribe(),

            supabase.channel('public:company_info').on('postgres_changes', { event: '*', schema: 'public', table: 'company_info' }, payload => {
                if (payload.eventType === 'UPDATE') setCompanyInfo(payload.new);
            }).subscribe(),

            supabase.channel('public:tasks').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
                if (payload.eventType === 'INSERT') setTasks(prev => [...prev, payload.new]);
                if (payload.eventType === 'UPDATE') setTasks(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
                if (payload.eventType === 'DELETE') setTasks(prev => prev.filter(item => item.id !== payload.old.id));
            }).subscribe(),

            supabase.channel('public:time_sessions').on('postgres_changes', { event: '*', schema: 'public', table: 'time_sessions' }, payload => {
                if (payload.eventType === 'INSERT') setTimeSessions(prev => [payload.new, ...prev]);
                if (payload.eventType === 'UPDATE') setTimeSessions(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
                if (payload.eventType === 'DELETE') setTimeSessions(prev => prev.filter(item => item.id !== payload.old.id));
            }).subscribe()
        ];

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, []); // Check dependency array carefully if using sites inside checkGeofences (might need ref/layout effect or just simpler approach)

    // Helper: Calculate distance
    const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
        var R = 6371; // Radius of the earth in km
        var dLat = deg2rad(lat2 - lat1);
        var dLon = deg2rad(lon2 - lon1);
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        var d = R * c; // Distance in km
        return d * 1000; // Meters
    }

    const deg2rad = (deg) => {
        return deg * (Math.PI / 180);
    }

    // Helper for fuzzy matching names
    const normalizeName = (name) => name ? name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';

    const sitesRef = React.useRef(sites);

    // Keep Ref updated
    useEffect(() => {
        sitesRef.current = sites;
    }, [sites]);

    const checkGeofences = (lat, lng) => {
        if (!sitesRef.current || sitesRef.current.length === 0) return;

        let insideSite = null;

        for (const site of sitesRef.current) {
            if (site.geofence_lat && site.geofence_lng) {
                const dist = getDistanceFromLatLonInKm(lat, lng, site.geofence_lat, site.geofence_lng);
                const radius = site.geofence_radius_m || 150;

                if (dist <= radius) {
                    insideSite = site;
                    break;
                }
            }
        }

        setCurrentGeofenceSiteId(prev => {
            if (insideSite) {
                if (prev !== insideSite.id) {
                    console.log(`Geofence ENTRY: ${insideSite.name}`);
                    setLastGeofenceEntry({ siteId: insideSite.id, entryAt: new Date() });
                    setLastGeofenceExit(null);
                }
                return insideSite.id;
            } else {
                if (prev) {
                    console.log(`Geofence EXIT (Left Site ID ${prev})`);
                    setLastGeofenceExit({ siteId: prev, exitAt: new Date() });
                }
                return null;
            }
        });
    };

    const fetchData = async () => {
        // Mock Hilti Data - waiting for CSV import
        setHiltiTools([
            { id: 1, name: 'TE 6-A36', serial_number: '12345', qr_code: 'H-001', assigned_to: '1', status: 'ok' },
            { id: 2, name: 'PM 40-MG', serial_number: '67890', qr_code: 'H-002', assigned_to: '1', status: 'ok' },
            { id: 3, name: 'DD 150-U', serial_number: '54321', qr_code: 'H-003', assigned_to: '2', status: 'repair' },
        ]);

        const { data: m, error: matError } = await supabase.from('materials').select('*');
        if (matError) {
            console.error("Error fetching materials:", matError);
            setDbError(`Materials Error: ${matError.message}`);
        }
        if (m) setMaterials(m.map(item => ({
            ...item,
            serialNumber: item.serial_number,
            qrCode: item.qr_code,
            locationType: item.location_type,
            locationId: item.location_id
        })));

        const { data: s, error: siteError } = await supabase.from('sites').select('*');
        if (siteError) {
            console.error("Error fetching sites:", siteError);
            setDbError(`Sites Error: ${siteError.message}`);
        }
        if (s) setSites(s);

        const { data: u, error: userError } = await supabase.from('users').select('*');
        if (userError) {
            console.error("Error fetching users:", userError);
            setDbError(userError.message);
        }

        let loadedUsers = u || [];





        // --- SEED HILTI USERS IF MISSING ---
        // This ensures the users from the CSV exist in our app
        const newUsers = [];
        for (const userName of initialHiltiUsers) {
            // Check if user exists (Normalized check to allow name corrections in DB)
            const exists = loadedUsers.some(user => normalizeName(user.name) === normalizeName(userName));

            if (!exists) {
                // Create a placeholder user
                const newUser = {
                    id: `generated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: userName,
                    email: `${userName.toLowerCase().replace(/ /g, '.')}@antigravity.fake`,
                    role: 'user',
                    must_change_password: true,
                    password: 'password123' // default for generated
                };
                newUsers.push(newUser);
            }
        }

        if (newUsers.length > 0) {
            // We add them to state. Ideally we should save them to DB too, but for now state is enough for the session
            // To persist, we would do: await supabase.from('users').insert(newUsers);
            // Let's just create them in memory for now to keep it snappy and avoid massive writes on reload
            loadedUsers = [...loadedUsers, ...newUsers];
        }
        setUsers(loadedUsers);

        // --- LOAD HILTI TOOLS ---
        // Map assigned_to_name -> assigned_to (ID) using the same normalized check
        const mappedHiltiTools = initialHiltiTools.map(tool => {
            const assignee = loadedUsers.find(user => normalizeName(user.name) === normalizeName(tool.assigned_to_name));
            return {
                ...tool,
                assigned_to: assignee ? assignee.id : 'unassigned'
            };
        });
        setHiltiTools(mappedHiltiTools);

        const { data: l } = await supabase.from('logs').select('*').order('timestamp', { ascending: false });
        if (l) setLogs(l.map(item => ({ ...item, userId: item.user_id })));

        // --- LOAD TASKS & SESSIONS ---
        const { data: t } = await supabase.from('tasks').select('*').order('id');
        if (t && t.length > 0) {
            setTasks(t);
        } else {
            // Auto-seed tasks if missing (Client-side fallback/init)
            const initialTasks = [
                { name: 'Installation' }, { name: 'Inspection' },
                { name: 'Maintenance' }, { name: 'Transport' }, { name: 'Autre' }
            ];
            // Try to insert them if table exists but empty
            const { data: newTasks, error: seedError } = await supabase.from('tasks').insert(initialTasks).select();
            if (newTasks) setTasks(newTasks);
            else {
                // Fallback if table doesn't exist yet (Mock mode preventing crash)
                setTasks(initialTasks.map((task, i) => ({ id: i + 1, ...task })));
            }
        }

        const { data: sessions, error: sessError } = await supabase.from('time_sessions').select('*').order('punch_start_at', { ascending: false });
        if (sessions) setTimeSessions(sessions);
        if (sessError && sessError.code !== 'PGRST116') { // Ignore if table missing
            console.log("Time Sessions table missing or empty");
        }

        const { data: c } = await supabase.from('company_info').select('*').single();
        if (c) setCompanyInfo(c);
    };


    // Actions
    const login = (email, password) => {
        // Hardcoded rescue admin
        if (email === 'admin@antigravity.com' && password === 'admin123') {
            setCurrentUser({ id: 'rescue-admin', name: 'Rescue Admin', email: 'admin@antigravity.com', role: 'admin' });
            return true;
        }

        // Simple auth against loaded users
        const user = users.find(u => u.email === email);
        if (user && user.password === password) {
            setCurrentUser(user);
            return true;
        }
        return false;
    };

    const logout = () => {
        setCurrentUser(null);
    };

    const changePassword = async (newPassword) => {
        if (!currentUser) return;

        const updates = { password: newPassword, must_change_password: false };

        // Optimistic
        setCurrentUser(prev => ({ ...prev, ...updates }));
        updateUser(currentUser.id, updates);
    };

    const updateCompanyInfo = async (info) => {
        // Optimistic
        setCompanyInfo(prev => ({ ...prev, ...info }));
        const { error } = await supabase.from('company_info').update(info).eq('id', companyInfo.id || 1);
        if (!error) addLog('Updated company information');
    };

    const addUser = async (user) => {
        // Force new users to change password
        const userWithFlags = {
            ...user,
            must_change_password: true,
            id: `temp-${Date.now()}`,
            created_at: new Date()
        };

        // Optimistic
        setUsers(prev => [...prev, userWithFlags]);

        const { data, error } = await supabase.from('users').insert([{ ...user, must_change_password: true, created_at: new Date() }]).select();

        if (!error && data) {
            // Replace temp with real
            setUsers(prev => prev.map(u => u.id === userWithFlags.id ? data[0] : u));
            addLog(`Added user: ${user.name}`);
        } else {
            // Rollback
            setUsers(prev => prev.filter(u => u.id !== userWithFlags.id));
        }
    };

    const updateUser = async (userId, updates) => {
        // Optimistic
        const oldUsers = [...users];
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));

        // DB update
        const dbUpdates = { ...updates };
        delete dbUpdates.id;
        delete dbUpdates.created_at;

        let error = null;

        // If it's a generated user, we need to INSERT it as a new user in DB
        if (userId.startsWith('generated-')) {
            // We use the same ID (converted to string if needed) or let Supabase generate one?
            // Ideally we KEEP the generated ID to match what's in memory for the session, 
            // OR we replace it with the real one.
            // But replacing IDs in memory is tricky for HiltiTools assignments that refer to it.
            // EASIER: Just insert a new row, get the REAL ID, and update Hilti assignments?
            // NO, let's try to keeping the ID if it's a string, assuming ID column allows text.
            // If ID is int/uuid, 'generated-...' will fail.
            // Given the schema isn't strictly known but usually UUID, let's assume we need a proper insert.

            // BETTER STRATEGY: 
            // 1. Insert new user with normal ID (auto).
            // 2. Update all Hilti tools assigned to old 'generated-ID' to 'new-real-ID'.
            // 3. Update 'users' state to replace old user with new user.

            const existingUser = users.find(u => u.id === userId);

            const newUserPayload = {
                name: updates.name || existingUser.name,
                email: updates.email || existingUser.email,
                role: updates.role || existingUser.role,
                password: updates.password || existingUser.password,
                must_change_password: true,
                created_at: new Date()
            };

            const { data: insertedUser, error: insertError } = await supabase.from('users').insert([newUserPayload]).select().single();

            if (insertError) {
                error = insertError;
            } else if (insertedUser) {
                // Success: Update state to use real ID
                setUsers(prev => prev.map(u => u.id === userId ? insertedUser : u));

                // Update Hilti assignments
                setHiltiTools(prev => prev.map(t => t.assigned_to === userId ? { ...t, assigned_to: insertedUser.id } : t));

                addLog(`Persisted generated user: ${insertedUser.name}`);
                return; // Done
            }
        } else {
            // Normal update for existing real users
            const { error: updateError } = await supabase.from('users').update(dbUpdates).eq('id', userId);
            error = updateError;
        }

        if (error) {
            console.error("Error updating user:", error);
            setDbError(error.message);
            setUsers(oldUsers); // Rollback
        } else {
            addLog(`Updated user: ${updates.name || userId}`);
        }
    };

    const deleteUser = async (userId) => {
        // Optimistic
        const userToDelete = users.find(u => u.id === userId);
        setUsers(prev => prev.filter(u => u.id !== userId));

        const { error } = await supabase.from('users').delete().eq('id', userId);
        if (error) {
            // Rollback
            if (userToDelete) setUsers(prev => [...prev, userToDelete]);
        } else {
            addLog(`Deleted user: ${userToDelete?.name}`);
        }
    };

    const addMaterial = async (material) => {
        // Check for duplicates
        if (materials.some(m => m.serialNumber === material.serialNumber)) {
            return { error: 'Ce numéro de série existe déjà.' };
        }

        const dbMaterial = {
            ...material,
            serial_number: material.serialNumber,
            qr_code: material.qrCode,
            location_type: material.locationType,
            location_id: material.locationId,
            created_at: new Date()
        };
        // Remove camelCase keys
        delete dbMaterial.serialNumber;
        delete dbMaterial.qrCode;
        delete dbMaterial.locationType;
        delete dbMaterial.locationId;

        // Optimistic Update
        const tempId = `temp-${Date.now()}`;
        const optimMaterial = { ...material, id: tempId };
        setMaterials(prev => [...prev, optimMaterial]);

        const { data, error } = await supabase.from('materials').insert([dbMaterial]).select();

        if (!error && data) {
            const created = data[0];
            const mapped = {
                ...created,
                serialNumber: created.serial_number,
                qrCode: created.qr_code,
                locationType: created.location_type,
                locationId: created.location_id
            };
            // Replace temp with real
            setMaterials(prev => prev.map(m => m.id === tempId ? mapped : m));
            addLog(`Added tool: ${material.name}`);
            return { data: mapped };
        } else {
            // Rollback
            setMaterials(prev => prev.filter(m => m.id !== tempId));
            return { error: error.message };
        }
    };

    const updateMaterial = async (id, updates) => {
        // Prepare DB object
        const dbUpdates = {};
        if (updates.name) dbUpdates.name = updates.name;
        if (updates.serialNumber) dbUpdates.serial_number = updates.serialNumber;
        if (updates.qrCode) dbUpdates.qr_code = updates.qrCode;
        if (updates.status) dbUpdates.status = updates.status;

        // Optimistic
        const oldMaterials = [...materials];
        setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));

        const { error } = await supabase.from('materials').update(dbUpdates).eq('id', id);

        if (error) {
            setMaterials(oldMaterials); // Rollback
        } else {
            addLog(`Updated tool: ${updates.name || id}`);
        }
    };

    const deleteMaterial = async (id) => {
        const oldMaterials = [...materials];
        const material = materials.find(m => m.id === id);
        setMaterials(prev => prev.filter(m => m.id !== id));

        const { error } = await supabase.from('materials').delete().eq('id', id);

        if (error) {
            setMaterials(oldMaterials); // Rollback
        } else {
            addLog(`Deleted tool: ${material?.name}`);
        }
    };

    const addSite = async (site) => {
        // Optimistic
        const tempId = `temp-${Date.now()}`;
        const optimSite = { ...site, id: tempId };
        setSites(prev => [...prev, optimSite]);

        const { data, error } = await supabase.from('sites').insert([{ ...site, created_at: new Date() }]).select();

        if (!error && data) {
            setSites(prev => prev.map(s => s.id === tempId ? data[0] : s));
            addLog(`Created site: ${site.name}`);
        } else {
            setSites(prev => prev.filter(s => s.id !== tempId));
        }
    };

    const updateSite = async (id, updates) => {
        // Optimistic
        const oldSites = [...sites];
        setSites(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

        const { error } = await supabase.from('sites').update(updates).eq('id', id);
        if (error) setSites(oldSites);
        else addLog(`Updated site: ${updates.name || id}`);
    };

    const deleteSite = async (id) => {
        const oldSites = [...sites];
        const site = sites.find(s => s.id === id);
        setSites(prev => prev.filter(s => s.id !== id));

        const { error } = await supabase.from('sites').delete().eq('id', id);
        if (error) {
            setSites(oldSites);
        } else {
            addLog(`Deleted site: ${site?.name}`);
        }
    };

    // Hilti Actions
    const updateHiltiTool = async (id, updates) => {
        // Optimistic only for now as table doesn't exist yet
        setHiltiTools(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

        let logMsg = `Updated Hilti Tool ${id}`;
        if (updates.assigned_to) {
            const user = users.find(u => u.id === updates.assigned_to);
            logMsg = `Reassigned Hilti Tool ${id} to ${user?.name || 'User'}`;
        } else if (updates.status === 'repair') {
            logMsg = `Reported issue on Hilti Tool ${id}`;
        }
        addLog(logMsg);
    };

    const transferTool = async (toolId, locationType, locationId) => {
        const updates = {
            location_type: locationType,
            location_id: locationId,
            status: locationType === 'repair' ? 'repair' : (locationType === 'warehouse' ? 'available' : 'in_use')
        };

        // Optimistic
        const oldMaterials = [...materials];
        setMaterials(prev => prev.map(m =>
            m.id === toolId ? { ...m, locationType, locationId, status: updates.status } : m
        ));

        const { error } = await supabase.from('materials').update(updates).eq('id', toolId);

        if (error) {
            setMaterials(oldMaterials); // Rollback
        } else {
            const tool = materials.find(m => m.id === toolId);
            let locationName = 'Warehouse';
            if (locationType === 'site') {
                const site = sites.find(s => s.id === Number(locationId));
                locationName = site ? site.name : 'Unknown Site';
            } else if (locationType === 'repair') {
                locationName = 'Repair Shop';
            }
            addLog(`Transferred ${tool?.name} to ${locationName}`);
        }
    };

    const clearData = async () => {
        // Dangerous: clears all data tables
        await supabase.from('materials').delete().neq('id', 0);
        await supabase.from('sites').delete().neq('id', 0);
        await supabase.from('logs').delete().neq('id', 0);

        addLog('System data reset (Admin Action)');
    };

    // --- TIME TRACKING ACTIONS ---
    const startTimeSession = async (siteId, taskId, gpsData = null) => {
        if (!currentUser) return;

        const timestamp = new Date();
        const payload = {
            user_id: currentUser.id,
            site_id: siteId,
            task_id: taskId,
            punch_start_at: timestamp,
            gps_first_entry_at: gpsData?.entryAt || null,
            manual_entry: false
        };

        // Optimistic
        const tempId = `temp-session-${Date.now()}`;
        setTimeSessions(prev => [{ ...payload, id: tempId, punch_end_at: null }, ...prev]);

        const { data, error } = await supabase.from('time_sessions').insert([payload]).select().single();

        if (!error && data) {
            setTimeSessions(prev => prev.map(s => s.id === tempId ? data : s));

            // Log
            const site = sites.find(s => String(s.id) === String(siteId));
            const task = tasks.find(t => String(t.id) === String(taskId));
            addLog(`GOPUNCH: ${currentUser.name} started ${task?.name} at ${site?.name}`);
            return { success: true };
        } else {
            setTimeSessions(prev => prev.filter(s => s.id !== tempId));
            console.error("Punch Error", error);
            return { error: error?.message };
        }
    };

    const endTimeSession = async (sessionId, gpsData = null) => {
        const timestamp = new Date();
        let payload = { punch_end_at: timestamp };

        if (gpsData?.exitAt) {
            payload.gps_last_exit_at = gpsData.exitAt;
        }

        // Optimistic
        setTimeSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...payload } : s));

        const { error } = await supabase.from('time_sessions').update(payload).eq('id', sessionId);

        if (!error) {
            addLog(`STOPPUNCH: ${currentUser?.name} ended session`);
            return { success: true };
        } else {
            return { error: error.message };
        }
    };

    // Smart helper: Switch = End current + Start new
    const switchTask = async (currentSessionId, siteId, newTaskId, gpsData = null) => {
        const endResult = await endTimeSession(currentSessionId, gpsData);
        if (endResult.success) {
            return await startTimeSession(siteId, newTaskId, gpsData);
        }
        return endResult;
    };

    const logManualTime = async (siteId, taskId, startAt, endAt) => {
        const payload = {
            user_id: currentUser?.id,
            site_id: siteId,
            task_id: taskId,
            punch_start_at: startAt,
            punch_end_at: endAt,
            manual_entry: true,
            created_at: new Date()
        };

        const { data, error } = await supabase.from('time_sessions').insert([payload]).select().single();
        if (!error && data) {
            setTimeSessions(prev => [data, ...prev]);
            addLog(`MANUAL TIME: ${currentUser?.name} added ${Math.round((new Date(endAt) - new Date(startAt)) / 3600000 * 10) / 10}h`);
            return { success: true };
        }
        return { error: error?.message };
    };

    const addLog = async (details) => {
        // Fire and forget log
        await supabase.from('logs').insert([{
            action: 'action',
            user_id: currentUser?.id,
            details,
            timestamp: new Date()
        }]);
    };

    const value = {
        materials,
        sites,
        users,
        logs,
        tasks,
        timeSessions,
        currentUser,
        companyInfo,
        login,
        logout,
        changePassword,
        addMaterial,
        addSite,
        transferTool,
        addLog,
        updateCompanyInfo,
        addUser,
        updateUser,
        deleteUser,
        updateMaterial,
        deleteMaterial,
        updateSite,
        deleteSite,
        hiltiTools,
        updateHiltiTool,
        clearData,
        startTimeSession,
        endTimeSession,
        switchTask,
        logManualTime,
        lastGeofenceEntry,
        lastGeofenceExit,
        currentGeofenceSiteId
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);

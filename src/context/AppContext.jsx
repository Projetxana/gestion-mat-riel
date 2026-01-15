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
    const [hiltiTools, setHiltiTools] = useState([]); // Hilti State
    const [companyInfo, setCompanyInfo] = useState({ name: 'Antigravity Inc.', address: 'Loading...' });
    const [currentUser, setCurrentUser] = useState(null);
    const [dbError, setDbError] = useState(null);

    // Initial Data Fetch
    useEffect(() => {
        fetchData();

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
            }).subscribe()
        ];

        return () => {
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, []);

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

        // Helper for fuzzy matching names (handles accents/case)
        const normalizeName = (name) => name ? name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';

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
        clearData
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    // State
    const [materials, setMaterials] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [companyInfo, setCompanyInfo] = useState({ name: 'Antigravity Inc.', address: 'Loading...' });
    const [currentUser, setCurrentUser] = useState(() => {
        const savedUser = localStorage.getItem('currentUser');
        return savedUser ? JSON.parse(savedUser) : null;
    });

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
        const { data: m } = await supabase.from('materials').select('*');
        if (m) setMaterials(m.map(item => ({
            ...item,
            serialNumber: item.serial_number,
            qrCode: item.qr_code,
            locationType: item.location_type,
            locationId: item.location_id
        })));

        const { data: s } = await supabase.from('sites').select('*');
        if (s) setSites(s);

        const { data: u } = await supabase.from('users').select('*');
        if (u) setUsers(u);

        const { data: l } = await supabase.from('logs').select('*').order('timestamp', { ascending: false });
        if (l) setLogs(l.map(item => ({ ...item, userId: item.user_id })));

        const { data: c } = await supabase.from('company_info').select('*').single();
        if (c) setCompanyInfo(c);
    };


    // Actions
    const login = (role, password, remember = false) => {
        // Simple auth against loaded users
        const user = users.find(u => u.role === role);
        if (user && user.password === password) {
            setCurrentUser(user);
            if (remember) {
                localStorage.setItem('currentUser', JSON.stringify(user));
            }
            return true;
        }
        return false;
    };

    const logout = () => {
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
    };

    const updateCompanyInfo = async (info) => {
        // Assumes ID 1 is the main company info
        const { error } = await supabase.from('company_info').update(info).eq('id', companyInfo.id || 1);
        if (!error) {
            // Optimistic update handled by subscription or local if fast
            addLog('Updated company information');
        }
    };

    const addUser = async (user) => {
        const { error } = await supabase.from('users').insert([{ ...user, created_at: new Date() }]);
        if (!error) addLog(`Added user: ${user.name}`);
    };

    const deleteUser = async (userId) => {
        const userToDelete = users.find(u => u.id === userId);
        const { error } = await supabase.from('users').delete().eq('id', userId);
        if (!error) addLog(`Deleted user: ${userToDelete?.name}`);
    };

    const addMaterial = async (material) => {
        const dbMaterial = {
            ...material,
            serial_number: material.serialNumber,
            qr_code: material.qrCode,
            location_type: material.locationType,
            location_id: material.locationId,
            created_at: new Date()
        };
        // Remove camelCase keys to avoid DB errors if strict
        delete dbMaterial.serialNumber;
        delete dbMaterial.qrCode;
        delete dbMaterial.locationType;
        delete dbMaterial.locationId;

        const { error } = await supabase.from('materials').insert([dbMaterial]);
        if (!error) addLog(`Added tool: ${material.name}`);
    };

    const addSite = async (site) => {
        const { error } = await supabase.from('sites').insert([{ ...site, created_at: new Date() }]);
        if (!error) addLog(`Created site: ${site.name}`);
    };

    const transferTool = async (toolId, locationType, locationId) => {
        const updates = {
            location_type: locationType,
            location_id: locationId,
            status: locationType === 'repair' ? 'repair' : (locationType === 'warehouse' ? 'available' : 'in_use')
        };

        const { error } = await supabase.from('materials').update(updates).eq('id', toolId);

        if (!error) {
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
        addMaterial,
        addSite,
        transferTool,
        addLog,
        updateCompanyInfo,
        addUser,
        deleteUser,
        clearData
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);

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
    const [projectTasks, setProjectTasks] = useState([]); // Project Sections
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

            supabase.channel('public:project_tasks').on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, payload => {
                const mapItem = (item) => ({ ...item, planned_hours: Number(item.planned_hours) || 0, completed_hours: Number(item.completed_hours) || 0 });
                if (payload.eventType === 'INSERT') setProjectTasks(prev => [...prev, mapItem(payload.new)]);
                if (payload.eventType === 'UPDATE') setProjectTasks(prev => prev.map(item => item.id === payload.new.id ? mapItem(payload.new) : item));
                if (payload.eventType === 'DELETE') setProjectTasks(prev => prev.filter(item => item.id !== payload.old.id));
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
                    const entryTime = new Date();
                    setLastGeofenceEntry({ siteId: insideSite.id, entryAt: entryTime });
                    setLastGeofenceExit(null);

                    // Notify
                    if (Notification.permission === 'granted') {
                        new Notification("Arrivée sur chantier", {
                            body: `Vous êtes sur ${insideSite.name}. Pensez à pointer !`,
                            icon: '/logo192.png'
                        });
                    }
                }
                return insideSite.id;
            } else {
                if (prev) {
                    console.log(`Geofence EXIT (Left Site ID ${prev})`);
                    const exitTime = new Date();
                    setLastGeofenceExit({ siteId: prev, exitAt: exitTime });

                    // Notify
                    if (Notification.permission === 'granted') {
                        new Notification("Sortie de chantier", {
                            body: "Vous avez quitté le chantier. Pensez à terminer votre journée !",
                            icon: '/logo192.png'
                        });
                    }
                }
                return null;
            }
        });
    };

    const fetchData = async () => {
        try {
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

            let loadedSites = [];
            const { data: s, error: siteError } = await supabase.from('sites').select('*');
            if (siteError) {
                console.error("Error fetching sites:", siteError);
                setDbError(`Sites Error: ${siteError.message}`);
            }
            if (s) loadedSites = s;

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
                loadedUsers = [...loadedUsers, ...newUsers];
            }
            setUsers(loadedUsers);

            // --- LOAD HILTI TOOLS ---
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

            // --- LOAD PROJECT TASKS (SECTIONS) ---
            const { data: pt, error: ptError } = await supabase.from('project_tasks').select('*');
            if (ptError) console.error("Error fetching project_tasks:", ptError);

            let loadedProjectsTasks = [];
            if (pt) {
                loadedProjectsTasks = pt.map(item => ({ ...item, planned_hours: Number(item.planned_hours) || 0, completed_hours: Number(item.completed_hours) || 0 }));
                setProjectTasks(loadedProjectsTasks);
            }

            // --- LOAD TASKS & SESSIONS ---
            const { data: t } = await supabase.from('tasks').select('*').order('id');
            let allTasks = [];

            if (t && t.length > 0) {
                setTasks(t);
                allTasks = t;
            } else {
                // FIX: No more generic tasks. If empty, it's empty.
                setTasks([]);
                allTasks = [];
            }

            // Map Tasks to Sites (so site.tasks is populated)
            // Use loadedSites local variable for safety
            if (loadedSites.length > 0) {
                const mappedSites = loadedSites.map(site => {
                    try {
                        const siteIdStr = String(site.id);
                        // Logic: If specific tasks exist, use them. Else use Global (site_id is null).
                        const specificTasks = Array.isArray(allTasks) ? allTasks.filter(task => String(task.site_id) === siteIdStr || String(task.project_id) === siteIdStr) : [];

                        const relatedProjectTasks = loadedProjectsTasks.filter(t => String(t.project_id) === siteIdStr);

                        return {
                            ...site,
                            tasks: specificTasks, // FIX: No fallback to globalTasks
                            project_tasks: relatedProjectTasks // Allow access to sections
                        };
                    } catch (err) {
                        console.error("Error mapping site tasks:", err, site);
                        return site;
                    }
                });
                setSites(mappedSites);
            } else {
                setSites([]);
            }

            const { data: sessions, error: sessError } = await supabase.from('time_sessions').select('*').order('punch_start_at', { ascending: false });
            if (sessions) setTimeSessions(sessions);
            if (sessError && sessError.code !== 'PGRST116') { // Ignore if table missing
                console.log("Time Sessions table missing or empty");
            }

            const { data: c } = await supabase.from('company_info').select('*').single();
            if (c) setCompanyInfo(c);

        } catch (globalErr) {
            console.error("CRITICAL ERROR IN FETCHDATA:", globalErr);
            setDbError(`Critical Data Error: ${globalErr.message}`);
        }
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

        // Use provided project_tasks or legacy tasks for optimistic UI ?
        // If site has project_tasks, use them.
        const optimSections = site.project_tasks ? site.project_tasks.map((t, i) => ({
            id: `optim-pt-${i}`,
            name: t.name,
            planned_hours: Number(t.planned_hours) || 0,
            completed_hours: Number(t.completed_hours) || 0,
            project_id: tempId
        })) : [];

        const optimSite = { ...site, id: tempId, project_tasks: optimSections };
        setSites(prev => [...prev, optimSite]);

        // 1. Insert Site
        // Remove tasks/project_tasks and clean payload
        const { tasks: _ignore, project_tasks: siteSections, ...sitePayload } = site;
        const cleanPayload = { ...sitePayload };
        if (cleanPayload.start_date === '') cleanPayload.start_date = null;
        if (cleanPayload.end_date === '') cleanPayload.end_date = null;

        const { data, error } = await supabase.from('sites').insert([{ ...cleanPayload, created_at: new Date() }]).select().single();

        if (!error && data) {
            const newSiteId = data.id;

            // 2. Insert Project Tasks (Sections)
            let sectionsPayload = [];
            if (siteSections && siteSections.length > 0) {
                sectionsPayload = siteSections.map(t => ({
                    name: t.name,
                    planned_hours: Number(t.planned_hours) || 0,
                    completed_hours: Number(t.completed_hours) || 0,
                    project_id: newSiteId
                }));
            } else {
                // Defaults if none provided?
                const defaultSections = ['Lot 1: Préparation', 'Lot 2: Exécution', 'Lot 3: Finitions'];
                sectionsPayload = defaultSections.map(name => ({
                    name,
                    planned_hours: 0,
                    completed_hours: 0,
                    project_id: newSiteId
                }));
            }

            const { data: createdSections, error: sectionError } = await supabase.from('project_tasks').insert(sectionsPayload).select();

            if (sectionError) {
                console.error("Error creating project sections:", sectionError);
            }

            // Update State with Real ID and Sections
            setSites(prev => prev.map(s => s.id === tempId ? { ...data, project_tasks: createdSections || [] } : s));

            // Update main projectTasks state
            if (createdSections) {
                setProjectTasks(prev => [...prev, ...createdSections.map(s => ({ ...s, planned_hours: Number(s.planned_hours), completed_hours: Number(s.completed_hours) }))]);
            }

            // Also create default legacy tasks? The user said "Ne plus afficher tasks".
            // If the app relies on them for punching, we might need at least one global task?
            // User: "Ne plus afficher tasks". Maybe punching uses project_id only now?
            // Or punching will use `project_tasks`?
            // "Logique: SUM(project_tasks.completed_hours) -> Suivi projet"
            // It suggests `project_tasks` are the new tasks.
            // But `time_sessions` link to `task_id`.
            // If we stop creating `tasks`, old punching might break if it relied on `tasks`.
            // User didn't say to migrate `time_sessions`.
            // Assuming for now `project_tasks` is for "Suivi Global" and distinct from punch-clock tasks?
            // "Modif import Excel... Créer ou mettre à jour PROJECT_TASKS".
            // So project_tasks IS the main thing now.

            addLog(`Created site: ${site.name}`);
        } else {
            console.error("Error creating site:", error);
            setSites(prev => prev.filter(s => s.id !== tempId));
        }
    };

    const updateSite = async (id, updates) => {
        const hasSectionsUpdate = Array.isArray(updates.project_tasks);

        // Optimistic UI Update
        const oldSites = [...sites];
        const oldProjectTasks = [...projectTasks];

        // 1. Update Site State (local)
        // If updating sections, we just put them in the site object for now
        setSites(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

        // 2. Prepare DB Updates for Site
        const siteUpdates = { ...updates };
        if (hasSectionsUpdate) delete siteUpdates.project_tasks;

        // Also remove legacy 'tasks' if present
        if (siteUpdates.tasks) delete siteUpdates.tasks;

        // Clean empty dates
        if (siteUpdates.start_date === '') siteUpdates.start_date = null;
        if (siteUpdates.end_date === '') siteUpdates.end_date = null;

        let error = null;

        // 3. Perform Site Update
        if (Object.keys(siteUpdates).length > 0) {
            const { error: siteErr } = await supabase.from('sites').update(siteUpdates).eq('id', id);
            if (siteErr) error = siteErr;
        }

        // 4. Handle Sections Sync if provided
        if (!error && hasSectionsUpdate) {
            const newSectionsState = updates.project_tasks;
            const safeProjectTasks = projectTasks ?? [];
            const existingSections = safeProjectTasks.filter(section => String(section.project_id) === String(id));

            // Diffing
            const sectionsToInsert = newSectionsState.filter(t => String(t.id).startsWith('temp') || String(t.id).startsWith('import'));
            const sectionsToUpdate = newSectionsState.filter(t => !String(t.id).startsWith('temp') && !String(t.id).startsWith('import'));

            const newIds = new Set(newSectionsState.map(t => String(t.id)));
            const sectionsToDelete = existingSections.filter(t => !newIds.has(String(t.id)));

            // A. DELETE
            if (sectionsToDelete.length > 0) {
                const idsToDelete = sectionsToDelete.map(t => t.id);
                const { error: delErr } = await supabase.from('project_tasks').delete().in('id', idsToDelete);
                if (delErr) console.error("Error deleting project sections:", delErr);
                else {
                    setProjectTasks(prev => prev.filter(t => !idsToDelete.includes(t.id)));
                }
            }

            // B. UPDATE
            for (const t of sectionsToUpdate) {
                const payload = {
                    name: t.name,
                    planned_hours: Number(t.planned_hours) || 0,
                    completed_hours: Number(t.completed_hours) || 0
                };
                const { error: upErr } = await supabase.from('project_tasks').update(payload).eq('id', t.id);
                if (upErr) console.error("Error updating project section:", upErr);
                else {
                    setProjectTasks(prev => prev.map(old => old.id === t.id ? { ...old, ...payload } : old));
                }
            }

            // C. INSERT
            if (sectionsToInsert.length > 0) {
                const payload = sectionsToInsert.map(t => ({
                    name: t.name,
                    planned_hours: Number(t.planned_hours) || 0,
                    completed_hours: Number(t.completed_hours) || 0, // Manual Override
                    project_id: id
                }));
                const { data: inserted, error: insErr } = await supabase.from('project_tasks').insert(payload).select();
                if (insErr) console.error("Error inserting project sections:", insErr);
                else if (inserted) {
                    const mapped = inserted.map(s => ({ ...s, planned_hours: Number(s.planned_hours), completed_hours: Number(s.completed_hours) }));
                    setProjectTasks(prev => [...prev, ...mapped]);
                }
            }
        }

        if (error) {
            console.error("Error updating site:", error);
            setSites(oldSites); // Rollback
            setProjectTasks(oldProjectTasks);
        } else {
            addLog(`Updated site: ${updates.name || id}`);
        }
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

    // --- TASK ACTIONS ---
    const addTask = async (task) => {
        // Optimistic
        const tempId = `temp-task-${Date.now()}`;
        const optimTask = { ...task, id: tempId };

        // Update both tasks list and the specific site in sites list
        setTasks(prev => [...prev, optimTask]);
        setSites(prev => prev.map(s => String(s.id) === String(task.site_id)
            ? { ...s, tasks: [...(s.tasks || []), optimTask] }
            : s
        ));

        const { data, error } = await supabase.from('tasks').insert([task]).select().single();

        if (!error && data) {
            // Replace temp with real
            setTasks(prev => prev.map(t => t.id === tempId ? data : t));
            setSites(prev => prev.map(s => String(s.id) === String(task.site_id)
                ? { ...s, tasks: s.tasks.map(t => t.id === tempId ? data : t) }
                : s
            ));
            addLog(`Added task: ${task.name}`);
            return { success: true, task: data };
        } else {
            console.error("Error adding task:", error);
            // Rollback
            setTasks(prev => prev.filter(t => t.id !== tempId));
            setSites(prev => prev.map(s => String(s.id) === String(task.site_id)
                ? { ...s, tasks: s.tasks.filter(t => t.id !== tempId) }
                : s
            ));
            return { error: error.message };
        }
    };

    const updateTask = async (taskId, updates) => {
        // Find task to get site_id for validation/logs
        const task = tasks.find(t => String(t.id) === String(taskId));
        if (!task) return;

        // Optimistic
        setTasks(prev => prev.map(t => String(t.id) === String(taskId) ? { ...t, ...updates } : t));
        if (task.site_id) {
            setSites(prev => prev.map(s => String(s.id) === String(task.site_id)
                ? { ...s, tasks: s.tasks.map(t => String(t.id) === String(taskId) ? { ...t, ...updates } : t) }
                : s
            ));
        }

        const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);

        if (error) {
            console.error("Error updating task:", error);
            // Rollback (simplified, triggers re-fetch implicitly usually but here we stick with opt state or revert if critical)
            // For now simple log, revert tedious without deep clone
        } else {
            addLog(`Updated task: ${task.name}`);
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

    // --- IMPORT ACTIONS ---
    const importTasksFromExcel = async (siteId, file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // Dynamically import xlsx to avoid huge bundle payload on init if not needed
                    const XLSX = await import('xlsx');
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet);

                    // Normalize Keys (Tache, Heures_prevues)
                    // Expected: { Tache: '...', Heures_prevues: 100 }
                    // Case insensitive match
                    const normalizeKey = (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

                    let totalHours = 0;
                    const tasksPayload = jsonData.map(row => {
                        let name = 'Tâche sans nom';
                        let hours = 0;

                        Object.keys(row).forEach(k => {
                            const nk = normalizeKey(k);
                            if (nk.includes('tache') || nk.includes('task')) name = row[k];
                            else if (nk.includes('heure') || nk.includes('hour') || nk.includes('prevue')) hours = Number(row[k]) || 0;
                        });

                        totalHours += hours;

                        return {
                            name: String(name),
                            planned_hours: hours,
                            site_id: siteId,
                            is_active: true
                        };
                    }).filter(t => t.name !== 'Tâche sans nom');

                    if (tasksPayload.length === 0) {
                        return resolve({ error: "Aucune tâche valide trouvée." });
                    }

                    // 1. Delete existing tasks for this site? Or Append?
                    // User says "Import Excel to create tasks". Usually implies overwrite or fill. 
                    // Let's Append but maybe warn if duplicates? 
                    // Actually, simpler to just insert.

                    const { data: insertedTasks, error } = await supabase.from('tasks').insert(tasksPayload).select();

                    if (error) throw error;

                    // 2. Update Site Total Planned Hours
                    // We should add this total to existing planned_hours or replace? 
                    // "Calculer projects.planned_hours = SUM(tasks...)"
                    // So we should re-calculate total per site.

                    // Fetch ALL tasks for this site to sum correctly (including old ones + new ones)
                    // const { data: allSiteTasks } = await supabase.from('tasks').select('planned_hours').eq('site_id', siteId);
                    // Actually let's just use what we have in state + new ones for optimistic? 
                    // Better to fetch fresh sum from DB or calc manually.

                    // Let's assume we want to REPLACE the site total with the new sum of ALL tasks.
                    // Let's grab current tasks from state, add new ones, sum it up.
                    const currentSiteTasks = tasks.filter(t => String(t.site_id) === String(siteId));
                    const newTotal = currentSiteTasks.reduce((acc, t) => acc + (t.planned_hours || 0), 0) + totalHours;

                    await updateSite(siteId, { planned_hours: newTotal });

                    // Update local state
                    if (insertedTasks) {
                        setTasks(prev => [...prev, ...insertedTasks]);
                        // Refetch site to get updated total if updateSite didn't fully sync (it did optimistically)
                        resolve({ success: true, count: insertedTasks.length, totalHours: newTotal });
                    }
                } catch (err) {
                    console.error("Excel Import Error:", err);
                    resolve({ error: err.message });
                }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    const importProjectProgress = async (siteId, file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const XLSX = await import('xlsx');
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    if (jsonData.length === 0) {
                        resolve({ error: "Fichier vide" });
                        return;
                    }

                    // 1. Parse Headers (Row 0) to find columns
                    const headers = jsonData[0].map(h => String(h || '').toLowerCase().trim());

                    const colNameIdx = headers.findIndex(h => h.includes('tache') || h.includes('tâche') || h.includes('section'));
                    const colPlannedIdx = headers.findIndex(h => h.includes('prevu') || h.includes('prévu') || h.includes('planned'));
                    const colRealizedIdx = headers.findIndex(h => h.includes('realise') || h.includes('réalisé') || h.includes('completed'));

                    if (colNameIdx === -1) {
                        // Fallback: If no headers found, check if first row is data (legacy support?)
                        // But user asked for STRICT header compliance.
                        // Let's assume strictness but provide helpful error.
                        resolve({ error: "Colonnes introuvables. Le fichier doit avoir : 'Tâches', 'Heures prévues', 'Heures réalisées'" });
                        return;
                    }

                    let siteTotalPlanned = 0;
                    let processedTasks = [];

                    const updates = [];
                    const inserts = [];

                    // Get existing Sections (project_tasks) for this site
                    const safeProjectTasks = projectTasks ?? [];
                    const existingSections = safeProjectTasks.filter(section => String(section.project_id) === String(siteId));

                    // Process rows (start at 1)
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!Array.isArray(row) || row.length === 0) continue;

                        const nameRaw = row[colNameIdx];
                        if (!nameRaw) continue; // Skip empty names

                        const name = String(nameRaw).trim();
                        if (!name) continue;

                        // Parse Numbers strictly
                        let plannedStr = String(row[colPlannedIdx] !== undefined ? row[colPlannedIdx] : '0').replace(',', '.');
                        let completedStr = String(row[colRealizedIdx] !== undefined ? row[colRealizedIdx] : '0').replace(',', '.');

                        let planned = parseFloat(plannedStr);
                        let completed = parseFloat(completedStr);

                        if (isNaN(planned)) planned = 0;
                        if (isNaN(completed)) completed = 0;

                        siteTotalPlanned += planned;

                        // UPSERT LOGIC
                        const existing = existingSections.find(s => s.name.toLowerCase() === name.toLowerCase());

                        if (existing) {
                            updates.push({
                                id: existing.id,
                                planned_hours: planned,
                                completed_hours: completed
                            });
                        } else {
                            inserts.push({
                                project_id: siteId,
                                name,
                                planned_hours: planned,
                                completed_hours: completed
                            });
                        }
                    }

                    // EXECUTE BATCHES
                    // 1. Inserts
                    if (inserts.length > 0) {
                        const { data: inserted, error } = await supabase.from('project_tasks').insert(inserts).select();
                        if (error) console.error("Error inserting project_tasks:", error);
                        else if (inserted) {
                            setProjectTasks(prev => [...prev, ...inserted.map(i => ({ ...i, planned_hours: Number(i.planned_hours), completed_hours: Number(i.completed_hours) }))]);
                            processedTasks.push(...inserted);
                        }
                    }

                    // 2. Updates
                    for (const up of updates) {
                        const { error } = await supabase.from('project_tasks').update({
                            planned_hours: up.planned_hours,
                            completed_hours: up.completed_hours
                        }).eq('id', up.id);

                        if (!error) {
                            setProjectTasks(prev => prev.map(p => p.id === up.id ? { ...p, ...up } : p));
                            processedTasks.push(up);
                        }
                    }

                    // 3. Update Site Total Planned Hours
                    // We sum ALL project_tasks again to be safe
                    // Use updated state / memory
                    const allSiteSections = [...existingSections.filter(e => !updates.find(u => u.id === e.id)), ...processedTasks]; // Merged
                    const totalFromSections = allSiteSections.reduce((acc, t) => acc + (t.planned_hours || 0), 0);

                    await updateSite(siteId, { planned_hours: totalFromSections });

                    resolve({ success: true, count: processedTasks.length });

                } catch (err) {
                    console.error("Import Progress Error:", err);
                    resolve({ error: err.message });
                }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    const updateProjectTask = async (id, updates) => {
        // Optimistic
        const oldState = [...(projectTasks ?? [])];
        setProjectTasks(prev => (prev ?? []).map(section => section.id === id ? { ...section, ...updates } : section));

        let dbUpdates = { ...updates };
        if (dbUpdates.planned) dbUpdates.planned_hours = dbUpdates.planned;
        if (dbUpdates.completed) dbUpdates.completed_hours = dbUpdates.completed;
        delete dbUpdates.planned;
        delete dbUpdates.completed;

        const { error } = await supabase.from('project_tasks').update(dbUpdates).eq('id', id);

        if (error) {
            console.error("Error updating project task:", error);
            setProjectTasks(oldState);
        } else {
            if (updates.planned_hours !== undefined) {
                const safeProjectTasks = projectTasks ?? [];
                const siteId = safeProjectTasks.find(section => section.id === id)?.project_id;
                if (siteId) {
                    const allSiteTasks = safeProjectTasks.filter(section => section.project_id === siteId).map(section => section.id === id ? { ...section, ...updates } : section);
                    const newTotal = allSiteTasks.reduce((acc, t) => acc + (Number(t.planned_hours) || 0), 0);
                    updateSite(siteId, { planned_hours: newTotal });
                }
            }
        }
    };

    const deleteProjectTask = async (id) => {
        const safeProjectTasks = projectTasks ?? [];
        const oldState = [...safeProjectTasks];
        const taskToDelete = safeProjectTasks.find(section => section.id === id);
        setProjectTasks(prev => (prev ?? []).filter(section => section.id !== id));

        const { error } = await supabase.from('project_tasks').delete().eq('id', id);

        if (error) {
            setProjectTasks(oldState);
        } else if (taskToDelete) {
            const siteId = taskToDelete.project_id;
            if (siteId) {
                const safeProjectTasks = projectTasks ?? [];
                const allSiteTasks = safeProjectTasks.filter(section => section.project_id === siteId && section.id !== id);
                const newTotal = allSiteTasks.reduce((acc, t) => acc + (Number(t.planned_hours) || 0), 0);
                updateSite(siteId, { planned_hours: newTotal });
            }
        }
    };

    // --- TIME TRACKING ACTIONS ---
    const startTimeSession = async (siteId, sectionId, gpsData = null) => {
        if (!currentUser) return;

        // 1. Verify no active session
        const activeSession = timeSessions.find(s =>
            String(s.user_id) === String(currentUser.id) &&
            s.punch_end_at === null
        );

        if (activeSession) {
            console.warn("Session already active, cannot start new one without ending.");
            return { error: "Une session est déjà active. Veuillez la terminer d'abord." };
        }

        const timestamp = new Date();
        const payload = {
            user_id: currentUser.id,
            site_id: siteId,
            section_id: sectionId, // ✅ CHANGED: Use section_id FK to project_tasks
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
            // Log
            const site = sites.find(s => String(s.id) === String(siteId));
            const section = projectTasks.find(pt => String(pt.id) === String(sectionId)); // ✅ CHANGED: Use projectTasks
            addLog(`PUNCH: ${currentUser.name} → ${section?.name || 'Section'} @ ${site?.name}`);
            return { success: true, session: data };
        } else {
            setTimeSessions(prev => prev.filter(s => s.id !== tempId));
            console.error("Punch Error", error);
            return { error: error?.message };
        }
    };

    const endTimeSession = async (sessionId, gpsData = null, correction = null) => {
        const timestamp = new Date();
        let payload = {
            punch_end_at: correction?.time || timestamp
        };

        if (correction?.isModified) {
            payload.corrected_end_at = correction.time;
        }

        if (gpsData?.exitAt) {
            payload.gps_last_exit_at = gpsData.exitAt;
            // Could add internal confidence check here
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
    const switchTask = async (currentSessionId, siteId, newSectionId, gpsData = null) => {
        const endResult = await endTimeSession(currentSessionId, gpsData);
        if (endResult.success) {
            return await startTimeSession(siteId, newSectionId, gpsData);
        }
        return endResult;
    };

    const logManualTime = async (siteId, sectionId, startAt, endAt) => {
        const payload = {
            user_id: currentUser?.id,
            site_id: siteId,
            section_id: sectionId, // ✅ CHANGED: Use section_id
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
        addTask,
        updateTask,
        hiltiTools,
        updateHiltiTool,
        clearData,
        startTimeSession,
        endTimeSession,
        switchTask,
        logManualTime,
        lastGeofenceEntry,
        lastGeofenceExit,
        currentGeofenceSiteId,
        importTasksFromExcel, // Legacy
        importProjectProgress,
        projectTasks,
        updateProjectTask, // We focus on this one as requested
        deleteProjectTask // In case needed
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);

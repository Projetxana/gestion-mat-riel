import { useState, useEffect, useCallback } from 'react';

/**
 * User Preferences Hook
 * 
 * Stores per-user preferences in localStorage.
 * Preferences are scoped by user ID for multi-user support.
 * 
 * Available preferences:
 * - defaultLunchTaken: bool (default: false) — Pause dîner prise par défaut
 * - defaultBreaksTaken: number (default: 1) — Nombre de pauses café par défaut
 * - enableGeolocation: bool (default: false) — Activer la géolocalisation pour le punch
 * - showHoursByTask: bool (default: false) — Voir le suivi des heures par tâche
 * - showHoursBySite: bool (default: false) — Voir le suivi des heures par chantier
 */

const STORAGE_KEY_PREFIX = 'bt_user_prefs_';

const DEFAULT_PREFERENCES = {
    defaultLunchTaken: false,
    defaultBreaksTaken: 1,
    enableGeolocation: false,
    showHoursByTask: false,
    showHoursBySite: false,
};

export const useUserPreferences = (userId) => {
    const storageKey = `${STORAGE_KEY_PREFIX}${userId || 'anonymous'}`;

    const [preferences, setPreferencesState] = useState(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.warn('Failed to read user preferences', e);
        }
        return { ...DEFAULT_PREFERENCES };
    });

    // Re-read if userId changes
    useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                setPreferencesState({ ...DEFAULT_PREFERENCES, ...JSON.parse(stored) });
            } else {
                setPreferencesState({ ...DEFAULT_PREFERENCES });
            }
        } catch (e) {
            setPreferencesState({ ...DEFAULT_PREFERENCES });
        }
    }, [storageKey]);

    const updatePreference = useCallback((key, value) => {
        setPreferencesState(prev => {
            const updated = { ...prev, [key]: value };
            try {
                localStorage.setItem(storageKey, JSON.stringify(updated));
            } catch (e) {
                console.warn('Failed to save user preferences', e);
            }
            return updated;
        });
    }, [storageKey]);

    const updatePreferences = useCallback((updates) => {
        setPreferencesState(prev => {
            const updated = { ...prev, ...updates };
            try {
                localStorage.setItem(storageKey, JSON.stringify(updated));
            } catch (e) {
                console.warn('Failed to save user preferences', e);
            }
            return updated;
        });
    }, [storageKey]);

    return { preferences, updatePreference, updatePreferences };
};

export default useUserPreferences;

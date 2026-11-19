import { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../supabaseClient';

// Company-wide opt-in; disabled by default. Read and write exclusively as the
// authenticated administrator of the currently selected company.
export const useCompanyPerformance = () => {
    const { currentUser, saasSession, currentCompanyId } = useAppContext();
    const userId = saasSession?.user?.id || currentUser?.id;
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setIsAdmin(false);
        setEnabled(false);
        setError('');

        const load = async () => {
            if (!currentCompanyId || !userId) {
                if (active) setLoading(false);
                return;
            }
            const { data: member, error: memberError } = await supabase
                .from('company_users')
                .select('role')
                .eq('company_id', currentCompanyId)
                .eq('user_id', userId)
                .maybeSingle();

            if (!active) return;
            if (memberError) {
                setError('Impossible de vérifier les droits administrateur.');
                setLoading(false);
                return;
            }
            const admin = member?.role === 'admin';
            setIsAdmin(admin);
            if (!admin) {
                setLoading(false);
                return;
            }
            const { data: settings, error: settingsError } = await supabase
                .from('bt_performance_settings')
                .select('enabled')
                .eq('company_id', currentCompanyId)
                .maybeSingle();
            if (!active) return;
            if (settingsError) {
                setError('Réglage de performance indisponible.');
                setLoading(false);
                return;
            }
            setEnabled(settings?.enabled === true);
            setLoading(false);
        };
        void load();
        return () => { active = false; };
    }, [currentCompanyId, userId]);

    const saveEnabled = useCallback(async (value) => {
        if (!isAdmin || !userId || !currentCompanyId) {
            return { error: 'Seul un administrateur de cette entreprise peut activer le module.' };
        }
        const { data, error: saveError } = await supabase
            .from('bt_performance_settings')
            .upsert({
                company_id: currentCompanyId,
                enabled: Boolean(value),
                updated_by: userId,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'company_id' })
            .select('enabled')
            .single();
        if (saveError) return { error: saveError.message };
        setEnabled(data.enabled === true);
        return { success: true };
    }, [currentCompanyId, isAdmin, userId]);

    return { enabled, isAdmin, loading, error, saveEnabled };
};

import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../supabaseClient';

// Only changes display-side consumption totals. Never updates project_tasks,
// time_sessions, or any immutable IPMO report.
export function useSiteManualHourPolicy(site) {
    const [policy,setPolicy]=useState({
        loading:true,manualHoursDistinct:false,error:'',configured:false,
    });
    const siteId=site?.id;
    const companyId=site?.company_id;

    const refresh=useCallback(async()=>{
        if(!siteId||!companyId){
            setPolicy({loading:false,manualHoursDistinct:false,error:'',configured:false});
            return;
        }
        setPolicy(v=>({...v,loading:true,error:''}));
        const {data,error}=await supabase.from('bt_site_manual_hour_policies')
            .select('manual_hours_distinct').eq('site_id',siteId)
            .eq('company_id',companyId).maybeSingle();
        if(error){
            setPolicy({
                loading:false,manualHoursDistinct:false,configured:false,
                error:'Paramètre des heures de démarrage indisponible : '+error.message,
            });
            return;
        }
        setPolicy({loading:false,manualHoursDistinct:data?.manual_hours_distinct===true,
            configured:!!data,error:''});
    },[siteId,companyId]);

    useEffect(()=>{void refresh();},[refresh]);

    const save=useCallback(async(value)=>{
        if(!siteId||!companyId)throw new Error('Chantier ou entreprise manquants.');
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError||!user?.id)throw new Error('Session administrateur expirée.');
        const {error}=await supabase.from('bt_site_manual_hour_policies')
            .upsert({
                site_id:siteId,company_id:companyId,
                manual_hours_distinct:Boolean(value),
                updated_by:user.id,updated_at:new Date().toISOString(),
            },{onConflict:'site_id'});
        if(error)throw error;
        await refresh();
    },[siteId,companyId,refresh]);

    return {...policy,refresh,save};
}

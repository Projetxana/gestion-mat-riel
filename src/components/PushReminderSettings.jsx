import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { disableDevicePush, enableDevicePush, pushSupported } from '../utils/pushSubscription';

const feature = import.meta.env.VITE_BUILDTRACK_PUSH_ENABLED === 'true';
const publicKey = import.meta.env.VITE_BUILDTRACK_PUSH_PUBLIC_KEY || '';
const defaultSettings = { enabled:false, daily_minute:1080, weekly_enabled:true, weekly_minute:1140, timezone:'America/Toronto' };
const toTime = m => String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
const toMinute = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const day = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export default function PushReminderSettings() {
    const { currentUser, currentCompanyId, companyRoleLoading, users } = useAppContext();
    const admin = currentUser?.role === 'admin';
    const [config,setConfig] = useState(defaultSettings);
    const [members,setMembers] = useState([]);
    const [roster,setRoster] = useState([]);
    const [absences,setAbsences] = useState([]);
    const [history,setHistory] = useState([]);
    const [absence,setAbsence] = useState({user_id:'',start_date:day(),end_date:day()});
    const [registration,setRegistration] = useState(null);
    const [subscribed,setSubscribed] = useState(false);
    const [busy,setBusy] = useState(false);
    const [loaded,setLoaded] = useState(false);
    const [message,setMessage] = useState('');
    const [error,setError] = useState('');
    const company = currentCompanyId;
    const uid = currentUser?.id;
    async function load() {
        if (!feature || !company || !uid || companyRoleLoading) return;
        setError('');setLoaded(false);
        try {
            if (admin) {
                const responses = await Promise.all([
                    supabase.from('bt_push_settings').select('*').eq('company_id',company).maybeSingle(),
                    supabase.from('company_users').select('user_id,role').eq('company_id',company).eq('role','member'),
                    supabase.from('bt_push_roster').select('user_id').eq('company_id',company),
                    supabase.from('bt_push_absences').select('id,user_id,start_date,end_date').eq('company_id',company).order('start_date',{ascending:false}).limit(100),
                    supabase.from('bt_push_history').select('id,user_id,kind,reminder_date,status,created_at').eq('company_id',company).order('created_at',{ascending:false}).limit(50),
                ]);
                if (responses.some(r=>r.error)) throw new Error('Paramètres des rappels indisponibles.');
                setConfig(responses[0].data || defaultSettings);
                setMembers([...new Map((responses[1].data||[]).map(m=>[m.user_id,m])).values()]);
                setRoster((responses[2].data||[]).map(m=>m.user_id));
                setAbsences(responses[3].data||[]);setHistory(responses[4].data||[]);
            } else if (pushSupported()) {
                const reg=await navigator.serviceWorker.getRegistration('/');
                if (reg?.active) {
                    setRegistration(reg);
                    const sub=await reg.pushManager.getSubscription();
                    if(sub) {
                        const {data,error:lookupError}=await supabase.from('bt_push_subscriptions').select('id')
                            .eq('endpoint',sub.endpoint).eq('company_id',company).eq('user_id',uid).maybeSingle();
                        if(lookupError) throw new Error('Impossible de vérifier cet abonnement.');
                        setSubscribed(Boolean(data));
                    } else setSubscribed(false);
                }
            }
            setLoaded(true);
        } catch(e) {setError(e.message);}
    }
    useEffect(()=>{void load();},[company,uid,admin,companyRoleLoading]);
    if (!feature || !company || !uid || companyRoleLoading) return null;
    const name=id=>(users||[]).find(u=>String(u.auth_user_id||u.id)===String(id))?.name || 'Employé';
    const act=async(action,success,reload=true)=>{
        if(busy)return;setBusy(true);setMessage('');setError('');
        try {const result=await action();if(result?.error)throw new Error(result.error.message);if(reload)await load();setMessage(success);}
        catch(e){setError(e.message||'Action impossible.');}finally{setBusy(false);}
    };
    const inputClass='min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white';
    const buttonClass='min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50';
    return <section className="rounded-xl bg-slate-800 p-4 space-y-4 text-slate-100">
        <h2 className="font-bold text-lg">Rappels des heures — notifications</h2>
        {error&&<p role="alert" className="text-red-300 break-words">{error}</p>}
        {message&&<p role="status" className="text-emerald-300">{message}</p>}
        {!loaded&&<p>Chargement des rappels…</p>}
        {admin&&loaded?<>
            <p className="text-sm text-slate-300">Les rappels sont envoyés aux employés sélectionnés ayant autorisé les notifications, uniquement si une journée attendue est manquante. Du lundi au vendredi.</p>
            <label className="flex items-center gap-2"><input type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/> Activer les rappels</label>
            <label className="flex flex-wrap items-center gap-2">Heure quotidienne <input className={inputClass} type="time" required value={toTime(config.daily_minute)} onChange={e=>e.target.value&&setConfig({...config,daily_minute:toMinute(e.target.value)})}/></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={config.weekly_enabled} onChange={e=>setConfig({...config,weekly_enabled:e.target.checked})}/> Rappel du vendredi</label>
            <label className="flex flex-wrap items-center gap-2">Heure du vendredi <input className={inputClass} type="time" required value={toTime(config.weekly_minute)} onChange={e=>e.target.value&&setConfig({...config,weekly_minute:toMinute(e.target.value)})}/></label>
            <label className="flex flex-col gap-1">Fuseau horaire<select className={inputClass} value={config.timezone} onChange={e=>setConfig({...config,timezone:e.target.value})}>
                {['America/Toronto','America/Halifax','America/St_Johns','America/Winnipeg','America/Regina','America/Edmonton','America/Vancouver'].map(t=><option key={t}>{t}</option>)}
            </select></label>
            <button className={buttonClass} disabled={busy} onClick={()=>void act(()=>supabase.from('bt_push_settings').upsert({company_id:company,enabled:config.enabled,daily_minute:config.daily_minute,weekly_enabled:config.weekly_enabled,weekly_minute:config.weekly_minute,timezone:config.timezone}),'Paramètres enregistrés.')}>Enregistrer les paramètres</button>
            <h3 className="font-semibold">Employés attendus du lundi au vendredi</h3>
            {members.map(m=><label key={m.user_id} className="flex items-center gap-2 min-h-11"><input type="checkbox" disabled={busy} checked={roster.includes(m.user_id)} onChange={e=>void act(()=>e.target.checked?supabase.from('bt_push_roster').insert({company_id:company,user_id:m.user_id}):supabase.from('bt_push_roster').delete().eq('company_id',company).eq('user_id',m.user_id),'Liste enregistrée.')}/>{name(m.user_id)}</label>)}
            <h3 className="font-semibold">Absences et congés (jours inclus)</h3>
            <select aria-label="Employé absent" className={inputClass+' w-full'} value={absence.user_id} onChange={e=>setAbsence({...absence,user_id:e.target.value})}><option value="">Choisir un employé</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{name(m.user_id)}</option>)}</select>
            <label className="flex flex-col">Du<input className={inputClass} type="date" value={absence.start_date} onChange={e=>setAbsence({...absence,start_date:e.target.value})}/></label>
            <label className="flex flex-col">Au<input className={inputClass} type="date" value={absence.end_date} onChange={e=>setAbsence({...absence,end_date:e.target.value})}/></label>
            <button className={buttonClass} disabled={busy||!absence.user_id||!absence.start_date||!absence.end_date||absence.end_date<absence.start_date} onClick={()=>void act(()=>supabase.from('bt_push_absences').insert({...absence,company_id:company}),'Absence enregistrée.')}>Ajouter l’absence</button>
            {absences.map(a=><div key={a.id} className="flex flex-wrap items-center gap-2 text-sm border-t border-slate-600 pt-2"><span>{name(a.user_id)} · {a.start_date} au {a.end_date}</span><button disabled={busy} className="min-h-11 text-red-300" onClick={()=>void act(()=>supabase.from('bt_push_absences').delete().eq('id',a.id).eq('company_id',company),'Absence retirée.')}>Retirer</button></div>)}
            <h3 className="font-semibold">Historique récent (90 jours maximum)</h3>
            <p className="text-xs text-slate-300">Accepté signifie accepté par le service push, pas nécessairement lu ou affiché.</p>
            {history.length===0?<p className="text-sm">Aucun envoi enregistré.</p>:history.map(h=><p className="text-sm border-t border-slate-600 py-2" key={h.id}>{h.reminder_date} · {name(h.user_id)} · {h.kind==='weekly'?'Hebdomadaire':'Quotidien'} · {({claimed:'En cours / résultat inconnu',accepted:'Accepté',failed:'Échec',expired:'Abonnement expiré',skipped:'Annulé'})[h.status]||h.status}</p>)}
        </>:!admin&&loaded?<>
            <p className="text-sm">Sur iPhone, ajoute BuildTrack à l’écran d’accueil puis ouvre-le depuis son icône. Tu peux désactiver les rappels à tout moment. Aucun numéro de téléphone requis.</p>
            {!pushSupported()||!publicKey||!registration?<p className="text-sm text-amber-300">Notifications indisponibles sur cet appareil ou application à actualiser.</p>:subscribed?<button className={buttonClass} disabled={busy} onClick={()=>void act(()=>disableDevicePush(supabase,uid),'Notifications désactivées.')}>Désactiver sur cet appareil</button>:<button className={buttonClass} disabled={busy} onClick={()=>void act(()=>enableDevicePush(supabase,company,uid,registration,publicKey),'Notifications activées sur cet appareil.')}>Activer les notifications</button>}
        </>:null}
    </section>;
}

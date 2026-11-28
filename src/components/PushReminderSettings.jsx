import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { disableDevicePush, enableDevicePush, pushSupported } from '../utils/pushSubscription';

const feature = import.meta.env.VITE_BUILDTRACK_PUSH_ENABLED === 'true';
const publicKey = import.meta.env.VITE_BUILDTRACK_PUSH_PUBLIC_KEY || '';
const defaultSettings = { enabled:false, daily_enabled:true, daily_minute:1080, weekly_enabled:true, weekly_minute:1140, timezone:'America/Toronto' };
const toTime = m => String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
const toMinute = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const day = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    return [parts.year,parts.month,parts.day].join('-');
};

export default function PushReminderSettings() {
    const { currentUser, currentCompanyId, companyRoleLoading, users } = useAppContext();
    const admin = currentUser?.role === 'admin';
    const [config,setConfig] = useState(defaultSettings);
    const [members,setMembers] = useState([]);
    const [exclusions,setExclusions] = useState([]);
    const [history,setHistory] = useState([]);
    const [period,setPeriod] = useState({label:'',start_date:day(),end_date:day()});
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
                    supabase.from('bt_push_exclusions').select('id,label,start_date,end_date').eq('company_id',company).order('start_date',{ascending:true}),
                    supabase.from('bt_push_history').select('id,user_id,kind,reminder_date,status,created_at').eq('company_id',company).order('created_at',{ascending:false}).limit(50),
                ]);
                if (responses.some(r=>r.error)) throw new Error('Paramètres des rappels indisponibles.');
                setConfig(responses[0].data || defaultSettings);
                setMembers([...new Map((responses[1].data||[]).map(m=>[m.user_id,m])).values()]);
                setExclusions(responses[2].data||[]);setHistory(responses[3].data||[]);
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
    const inputClass='min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900';
    const checkClass='!w-5 !h-5 !min-w-5 !m-0 !p-0 shrink-0 accent-blue-600';
    const panelClass='rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3';
    const buttonClass='min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50';
    return <section className="rounded-xl bg-slate-50 p-3 sm:p-5 space-y-4 text-slate-900">
        <div><h2 className="font-bold text-xl">Rappels des heures</h2><p className="text-sm text-slate-600">Notifications de saisie des heures de travail</p></div>
        {error&&<p role="alert" className="text-red-700 break-words">{error}</p>}
        {message&&<p role="status" className="text-emerald-700">{message}</p>}
        {!loaded&&!error&&<p>Chargement des rappels…</p>}
        {admin&&loaded?<>
            <div className={panelClass}>
            <h3 className="font-semibold text-base">1. Horaires et activation</h3>
            <p className="text-sm text-slate-600">Tous les employés de cette entreprise sont concernés automatiquement. Seuls ceux ayant autorisé les notifications et dont une journée de travail est manquante reçoivent un rappel.</p>
            <label className="!flex !flex-row !justify-start !items-center gap-3 min-h-11"><input className={checkClass} type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/> Activer les rappels</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <label className="!flex !flex-row !justify-start !items-center gap-3 min-h-11"><input className={checkClass} type="checkbox" checked={config.daily_enabled} onChange={e=>setConfig({...config,daily_enabled:e.target.checked})}/> Rappel quotidien</label>
                    <p className="text-sm text-slate-600">Du lundi au vendredi, si les heures du jour sont manquantes.</p>
                    <label className="!flex !flex-col gap-1">Heure du rappel quotidien<input className={inputClass+' disabled:opacity-50'} type="time" disabled={!config.daily_enabled} value={toTime(config.daily_minute)} onChange={e=>e.target.value&&setConfig({...config,daily_minute:toMinute(e.target.value)})}/></label>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <label className="!flex !flex-row !justify-start !items-center gap-3 min-h-11"><input className={checkClass} type="checkbox" checked={config.weekly_enabled} onChange={e=>setConfig({...config,weekly_enabled:e.target.checked})}/> Rappel hebdomadaire</label>
                    <p className="text-sm text-slate-600">Le vendredi, si une journée de la semaine est manquante.</p>
                    <label className="!flex !flex-col gap-1">Heure du rappel hebdomadaire<input className={inputClass+' disabled:opacity-50'} type="time" disabled={!config.weekly_enabled} value={toTime(config.weekly_minute)} onChange={e=>e.target.value&&setConfig({...config,weekly_minute:toMinute(e.target.value)})}/></label>
                </div>
            </div>
            {config.daily_enabled&&config.weekly_enabled&&config.weekly_minute<config.daily_minute+30&&<p role="alert" className="text-sm text-red-700">Le rappel du vendredi doit être au moins 30 minutes après le rappel quotidien.</p>}
            <label className="flex flex-col gap-1">Fuseau horaire<select className={inputClass} value={config.timezone} onChange={e=>setConfig({...config,timezone:e.target.value})}>
                {['America/Toronto','America/Halifax','America/St_Johns','America/Winnipeg','America/Regina','America/Edmonton','America/Vancouver'].map(t=><option key={t}>{t}</option>)}
            </select></label>
            <button className={buttonClass} disabled={busy||(config.daily_enabled&&config.weekly_enabled&&config.weekly_minute<config.daily_minute+30)} onClick={()=>void act(()=>supabase.from('bt_push_settings').upsert({company_id:company,enabled:config.enabled,daily_enabled:config.daily_enabled,daily_minute:config.daily_minute,weekly_enabled:config.weekly_enabled,weekly_minute:config.weekly_minute,timezone:config.timezone}),'Paramètres enregistrés.')}>Enregistrer les paramètres</button>
            </div>
            <div className={panelClass}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">Employés concernés automatiquement</h3>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800">{members.length} employés</span>
                </div>
                <p className="text-sm text-slate-600">Aucune sélection nécessaire. Les nouveaux employés sont inclus dès leur inscription aux notifications sur leur appareil.</p>
            </div>
            <div className={panelClass}>
                <h3 className="font-semibold">2. Périodes sans rappel</h3>
                <p className="text-sm text-slate-600">Vacances de la construction, fêtes et fermetures collectives. Les dates de début et de fin sont incluses. Les journées exclues ne comptent pas dans le rappel hebdomadaire.</p>
                <label className="!flex !flex-col gap-1">Nom de la période (facultatif)
                    <input className={inputClass} maxLength={120} placeholder="Ex. Vacances de la construction" value={period.label} onChange={e=>setPeriod({...period,label:e.target.value})}/>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="!flex !flex-col gap-1">Du<input className={inputClass} type="date" value={period.start_date} onChange={e=>setPeriod({...period,start_date:e.target.value})}/></label>
                    <label className="!flex !flex-col gap-1">Au<input className={inputClass} type="date" min={period.start_date} value={period.end_date} onChange={e=>setPeriod({...period,end_date:e.target.value})}/></label>
                </div>
                <button className={buttonClass} disabled={busy||!period.start_date||!period.end_date||period.end_date<period.start_date} onClick={()=>void act(async()=>{const result=await supabase.from('bt_push_exclusions').insert({...period,label:period.label.trim(),company_id:company});if(!result.error)setPeriod({label:'',start_date:day(),end_date:day()});return result;},'Période enregistrée.')}>Ajouter une période</button>
                {exclusions.length===0?<p className="text-sm text-slate-500">Aucune période exclue.</p>:<div className="divide-y divide-slate-200">{exclusions.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-medium">{p.label||'Fermeture collective'}</p><p className="text-sm text-slate-600">{p.start_date} au {p.end_date}</p></div><button type="button" disabled={busy} className="min-h-11 px-3 text-red-700" onClick={()=>void act(()=>supabase.from('bt_push_exclusions').delete().eq('id',p.id).eq('company_id',company),'Période retirée.')}>Retirer</button></div>)}</div>}
            </div><div className={panelClass}><h3 className="font-semibold">3. Historique des envois</h3>
            <p className="text-xs text-slate-600">Accepté signifie accepté par le service push, pas nécessairement lu ou affiché.</p>
            {history.length===0?<p className="text-sm">Aucun envoi enregistré.</p>:history.map(h=><p className="text-sm border-t border-slate-200 py-2" key={h.id}>{h.reminder_date} · {name(h.user_id)} · {h.kind==='weekly'?'Hebdomadaire':'Quotidien'} · {({claimed:'En cours / résultat inconnu',accepted:'Accepté',failed:'Échec',expired:'Abonnement expiré',skipped:'Annulé'})[h.status]||h.status}</p>)}
        </div></>:!admin&&loaded?<>
            <p className="text-sm">Sur iPhone, ajoute BuildTrack à l’écran d’accueil puis ouvre-le depuis son icône. Tu peux désactiver les rappels à tout moment. Aucun numéro de téléphone requis.</p>
            {!pushSupported()||!publicKey||!registration?<p className="text-sm text-amber-800">Notifications indisponibles sur cet appareil ou application à actualiser. <button type="button" className="underline min-h-11" onClick={()=>void load()}>Réessayer</button></p>:subscribed?<button className={buttonClass} disabled={busy} onClick={()=>void act(()=>disableDevicePush(supabase,uid),'Notifications désactivées.')}>Désactiver sur cet appareil</button>:<button className={buttonClass} disabled={busy} onClick={()=>void act(()=>enableDevicePush(supabase,company,uid,registration,publicKey),'Notifications activées sur cet appareil.')}>Activer les notifications</button>}
        </>:null}
    </section>;
}

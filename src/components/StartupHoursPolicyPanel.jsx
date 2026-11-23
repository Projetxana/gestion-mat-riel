import React,{useState} from 'react';
import {AlertTriangle,CheckCircle2,Clock3} from 'lucide-react';
import {useCompanyPerformance} from '../hooks/useCompanyPerformance';
import {useSiteManualHourPolicy} from '../hooks/useSiteManualHourPolicy';

// Purposefully outside the IPMO component: the customer is only recording
// work hours completed before employee time tracking began.
export default function StartupHoursPolicyPanel({site}) {
    const {isAdmin,loading:accessLoading}=useCompanyPerformance();
    const {manualHoursDistinct,loading,error,save}=useSiteManualHourPolicy(site);
    const [busy,setBusy]=useState(false);
    const [message,setMessage]=useState('');
    const [saveError,setSaveError]=useState('');
    if(accessLoading||!isAdmin||site?.status==='archived')return null;

    const change=async ()=>{
        if(busy||loading)return;
        const next=!manualHoursDistinct;
        if(next && !window.confirm(
          'Confirmez que les heures saisies manuellement dans ce chantier sont distinctes des pointages employés. Elles seront additionnées aux pointages pour le suivi des heures, sans modifier l’IPMO.'
        ))return;
        setBusy(true);setSaveError('');setMessage('');
        try{
            await save(next);
            setMessage(next
                ? 'Heures de démarrage reconnues comme distinctes des pointages. Aucun bilan IPMO créé.'
                : 'Cumul automatique désactivé. Les heures manuelles restent enregistrées.');
        }catch(err){setSaveError(err?.message||'Enregistrement impossible.');}
        finally{setBusy(false);}
    };

    return <section className="mt-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3"
      aria-label="Heures de démarrage du chantier">
      <div className="flex items-center gap-2">
        <Clock3 size={18} className="text-blue-300"/>
        <h3 className="text-sm font-semibold text-white">Heures de démarrage (saisie manuelle)</h3>
      </div>
      <p className="text-xs text-slate-300">
        Les heures de la colonne « Saisie manuelle » représentent le travail déjà réalisé
        avant les pointages BuildTrack. Elles sont conservées séparément des heures des employés.
      </p>
      <label className="flex items-start gap-3 text-sm text-slate-200">
        <input type="checkbox" checked={manualHoursDistinct}
          disabled={busy||loading||!!error}
          onChange={()=>void change()}
          className="mt-1 h-5 w-5 accent-blue-500"/>
        <span>
          <strong>Ces heures manuelles ne figurent pas dans les pointages.</strong>
          <span className="block text-xs text-slate-400">
            Les additionner aux pointages pour afficher les heures totales réalisées.
            Cela ne valide aucun pourcentage de travaux et ne touche pas à l’IPMO.
          </span>
        </span>
      </label>
      {loading&&<p role="status" className="text-xs text-slate-400">Chargement du paramètre…</p>}
      {error&&<p role="alert" className="text-xs text-amber-200 flex gap-2"><AlertTriangle size={15}/>{error}</p>}
      {saveError&&<p role="alert" className="text-xs text-red-300">{saveError}</p>}
      {message&&<p role="status" className="text-xs text-emerald-300 flex gap-2"><CheckCircle2 size={15}/>{message}</p>}
    </section>;
}

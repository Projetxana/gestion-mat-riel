import React,{useEffect,useRef,useState} from 'react';
import {planPurchaseBatch,summarizePurchaseBatch} from '../utils/unifiedPurchaseBatch';
import {readDigitalPdf} from '../utils/digitalPdfReader';

const labels={ready:'Prêt à importer',confirm:'Confirmation requise',review:'À vérifier',blocked:'Bloqué',duplicate:'Doublon ignoré',non_financial:'Sans engagement financier',imported:'Enregistré',failed:'Échec'};
const kinds={quotation:'Soumission',estimate:'Estimation',order:'Commande',credit:'Avoir',invoice:'Facture',delivery:'Livraison',unknown:'Document inconnu'};
const issues={confirm_site:'Confirmer le chantier',choose_revision:'Choisir le type de révision',coverage:'Nombre de lignes incohérent',subtotal:'Sous-total non concordant',arithmetic:'Calcul incohérent',sign:'Signe incorrect',missing_reference:'Référence manquante',missing_po:'PO manquant',unknown_format:'Format inconnu',read_failed:'PDF illisible',same_pdf:'PDF identique',same_reference:'Référence déjà connue',unverified_credit:'Avoir non vérifié',incomplete_pdf:'PDF incomplet',invalid_row:'Article incomplet',missing_rows:'Articles manquants',not_a_commitment:'Aucun achat à comptabiliser'};
const money=n=>new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'}).format(n);
const control='min-h-11 rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-50';

// The parent supplies a trusted context and an authoritative transactional
// commit adapter. A successful analysis is not a successful database write.
export default function UnifiedPurchaseInbox({site,context,commitDocument,enabled=true,onSaved}){
 const [entries,setEntries]=useState([]);
 const [progress,setProgress]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [choices,setChoices]=useState({});
 const [preview,setPreview]=useState(null);
 const lock=useRef(false);
 const input=useRef(null);
 const generation=useRef(0);
 const scope=JSON.stringify([site?.company_id,site?.id]);
 useEffect(()=>{generation.current++;setEntries([]);setChoices({});setPreview(null);setError('');setProgress(null);return()=>{generation.current++;};},[scope]);
 useEffect(()=>{if(!preview)return;return()=>URL.revokeObjectURL(preview.url);},[preview]);
 const active=enabled&&site?.status==='active'&&Boolean(site?.company_id);
 const canWrite=active&&typeof commitDocument==='function';
 const summary=summarizePurchaseBatch(entries);
 const analyze=async files=>{
  if(!active||lock.current||!files?.length)return;
  lock.current=true;setBusy(true);setError('');setPreview(null);setEntries([]);setChoices({});
  const run=generation.current;
  try{
   const results=await planPurchaseBatch(files,{readPdf:readDigitalPdf,context:{...context,site},onProgress:p=>{if(run===generation.current)setProgress(p);}});
   if(run===generation.current)setEntries(results);
  }catch(e){if(run===generation.current)setError(e.message||'Analyse impossible.');}
  finally{lock.current=false;setBusy(false);if(run===generation.current)setProgress(null);}
 };
 const save=async selected=>{
  if(!canWrite||lock.current)return;
  lock.current=true;setBusy(true);setError('');
  const run=generation.current;
  let changed=false;
  try{
   for(const entry of selected){
    if(run!==generation.current)break;
    const choice=choices[entry.id]||{};
    const plan=entry.plan;
    if(!['ready','confirm'].includes(plan.status))continue;
    if(plan.status==='confirm'&&plan.issues.includes('confirm_site')&&!choice.confirmSite)continue;
    if(plan.action==='choose_budget_revision'&&!['replacement','extension'].includes(choice.revisionKind))continue;
    try{
     // Adapter MUST re-read current state, enforce tenant authorization,
     // detect duplicate refs/hashes and archive the original before reporting success.
     const result=await commitDocument({file:entry.file,plan,choice,site});
     if(result?.status!=='imported'&&result?.status!=='duplicate')throw Error('Enregistrement non confirmé.');
     if(result.status==='imported'&&!result.documentId)throw Error('Identifiant du document manquant.');
     changed ||= result.status==='imported';
     if(run===generation.current)setEntries(prev=>prev.map(e=>e.id===entry.id?{...e,plan:{...e.plan,status:result.status,total:result.status==='imported'?result.total:e.plan.total}}:e));
    }catch(e){if(run===generation.current)setEntries(prev=>prev.map(r=>r.id===entry.id?{...r,plan:{...r.plan,status:'failed'},error:e.message||'Enregistrement impossible.'}:r));}
   }
   if(changed&&run===generation.current)await onSaved?.();
  }catch(e){if(run===generation.current)setError(e.message||'Actualisation impossible.');}
  finally{lock.current=false;setBusy(false);}
 };
 const update=(id,key,value)=>setChoices(prev=>({...prev,[id]:{...prev[id],[key]:value}}));
 return <section className="space-y-4 rounded-xl border border-slate-700 p-4 text-slate-100" aria-label="Importation unifiée des achats">
  <h2 className="text-lg font-bold">Déposer les PDF fournisseurs</h2>
  <p className="text-sm text-slate-300">Soumissions, confirmations et avoirs. Jusqu’à 30 PDF par lot.</p>
  <input ref={input} type="file" multiple accept=".pdf,application/pdf" className="sr-only" aria-label="Sélectionner des PDF fournisseurs" disabled={!active||busy} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void analyze(files);}}/>
  <button type="button" disabled={!active||busy} className={control+' w-full border-blue-500 bg-blue-950'} onClick={()=>input.current?.click()}>Sélectionner un ou plusieurs PDF</button>
  {!canWrite&&<p className="text-xs text-amber-200">Mode analyse uniquement : enregistrement non raccordé.</p>}
  {progress&&<p role="status">Analyse : {progress.completed}/{progress.total}</p>}
  {error&&<p role="alert" className="text-red-200">{error}</p>}
  {entries.length>0&&<>
   <div role="status" className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
    {Object.entries(summary.counts).filter(([,n])=>n>0).map(([status,n])=><div key={status} className="rounded border border-slate-700 p-2"><strong>{n}</strong> {labels[status]}</div>)}
   </div>
   <p className="text-sm">Variation HT enregistrée : <strong>{money(summary.netImported)}</strong></p>
   <button type="button" disabled={!canWrite||busy||!summary.counts.ready} className={control+' bg-blue-700 w-full'} onClick={()=>void save(entries.filter(e=>e.plan.status==='ready'))}>Importer les {summary.counts.ready} documents prêts</button>
   {entries.map(entry=>{
    const p=entry.plan,c=choices[entry.id]||{};
    return <article key={entry.id} className="rounded-lg border border-slate-700 p-3 space-y-2">
     <div className="flex flex-wrap justify-between gap-2"><strong className="break-all">{entry.name}</strong><span>{labels[p.status]}</span></div>
     <p className="text-sm">{kinds[p.kind]} {p.supplier} {p.po?'· PO '+p.po:''} {p.reference?'· '+p.reference:''}</p>
     {Number.isFinite(p.total)&&<p className="font-semibold">{money(p.total)} HT · {p.rows?.length||0} articles</p>}
     {p.issues?.length>0&&<p className="text-sm text-amber-200">{p.issues.map(i=>issues[i]||i).join(' · ')}</p>}
     {entry.error&&<p role="alert" className="text-red-200">{entry.error}</p>}
     <button type="button" className={control} onClick={()=>setPreview({name:entry.name,url:URL.createObjectURL(entry.file)})}>Voir le PDF</button>
     {p.status==='confirm'&&<>
      {p.issues.includes('confirm_site')&&<label className="flex gap-2 items-start"><input type="checkbox" checked={!!c.confirmSite} onChange={e=>update(entry.id,'confirmSite',e.target.checked)}/> Je confirme que « {p.project||'nom non détecté'} » correspond à {site.name}.</label>}
      {p.action==='choose_budget_revision'&&<label className="block">Action sur le budget<select value={c.revisionKind||''} onChange={e=>update(entry.id,'revisionKind',e.target.value)} className={control+' block w-full bg-slate-900'}><option value="">Choisir</option><option value="replacement">Remplacer le budget de base</option><option value="extension">Ajouter une liste complémentaire</option></select></label>}
      <button type="button" className={control+' bg-blue-700'} disabled={!canWrite||busy||(p.issues.includes('confirm_site')&&!c.confirmSite)||(p.action==='choose_budget_revision'&&!c.revisionKind)} onClick={()=>void save([entry])}>Confirmer et importer</button>
     </>}
     {p.status==='review'&&<p className="text-sm">Vérification nécessaire avant enregistrement. Aucun montant ajouté.</p>}
    </article>;
   })}
  </>}
  {preview&&<section className="space-y-2" aria-label="Aperçu PDF"><button type="button" className={control} onClick={()=>setPreview(null)}>Fermer l’aperçu</button><iframe title={preview.name} src={preview.url} className="w-full h-96 bg-white"/></section>}
 </section>;
}

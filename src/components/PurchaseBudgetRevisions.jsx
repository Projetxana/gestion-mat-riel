import React,{useState} from 'react';
import * as XLSX from 'xlsx';
import {AlertTriangle,FileUp,History,Plus,RefreshCw} from 'lucide-react';
import {supabase} from '../supabaseClient';
import {parsePurchaseRows,normalizeToken} from '../utils/purchaseBudget';
import {assessDigitalPdf} from '../utils/pdfImportEvidence';
import {projectedBudgetRevision} from '../utils/purchaseBudgetRevisions';

const money=v=>new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'}).format(Number(v||0));
const digest=async file=>{
 const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
};
const readSheet=async file=>{
 if(file.size>5*1024*1024)throw new Error('Fichier Excel/CSV de plus de 5 Mo.');
 const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
 const first=workbook.Sheets[workbook.SheetNames[0]];
 if(!first)throw new Error('Aucune feuille Excel exploitable.');
 return parsePurchaseRows(XLSX.utils.sheet_to_json(first,{defval:'',raw:false}),{kind:'budget'});
};

// A CD estimate can contain contractual adjustments not included in the
// material subtotal. This exception is explicitly acknowledged ONCE, never
// silently guessed as a complete PDF.
export const isReviewablePdfBudgetException = (parsed,site) => {
 const doc=parsed?.document||{};
 const codes=parsed?.issues?.map(i=>i.code)||[];
 const warnings=parsed?.evidence?.warnings||[];
 return doc.parser_id==='cd-estimate-v1'
  && doc.digital_text && doc.all_pages_processed
  && doc.page_count>0 && doc.source_line_count>0
  && doc.source_line_count===doc.detected_line_count
  && doc.material_line_count>0
  && codes.length>0
  && codes.every(code=>code==='total'||code==='exception')
  && !warnings.some(w=>/examiner manuellement|non reconnue|manquante/i.test(w))
  && normalizeToken(parsed?.hints?.shipping_project_name)===normalizeToken(site?.name)
  && Array.isArray(parsed?.hints?.suggested_lines)
  && parsed.hints.suggested_lines.filter(x=>x.included!==false)
   .every(x=>x.is_complete!==false && x.arithmetic_warning!==true);
};

export default function PurchaseBudgetRevisions({
 site,companyId,budget,budgetLines,revisions=[],onSaved
}){
 const [mode,setMode]=useState('');
 const [label,setLabel]=useState('');
 const [pending,setPending]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const [issues,setIssues]=useState([]);
 const [showHistory,setShowHistory]=useState(false);
 const replacements=revisions.filter(r=>r.kind==='replacement')
  .sort((a,b)=>Number(b.revision_no)-Number(a.revision_no));
 const extensions=revisions.filter(r=>r.kind==='extension');
 const currentBase=replacements[0]?.source_name||budget?.source_name||'';
 const open=next=>{
  setMode(p=>p===next?'':next);
  setLabel(next==='replacement'?'Mise à jour de l’estimation':
   'Matériel supplémentaire – extension du chantier');
  setPending(null);setError('');setSuccess('');setIssues([]);
 };
 const select=async file=>{
  if(!file || !mode || busy)return;
  setError('');setSuccess('');setIssues([]);setPending(null);setBusy(true);
  try {
   let rows,sha,reviewNeeded=false,exceptions=[];
   if(/\.pdf$/i.test(file.name)){
    const {readDigitalPdf}=await import('../utils/digitalPdfReader');
    const read=await readDigitalPdf(file);
    sha=read.sha256;
    const parsed=assessDigitalPdf(read,{
     kind:'budget',site,hasExistingBudget:false,
    });
    if(parsed.status==='auto_commit'){
     rows=parsed.verified_rows;
    }else if(isReviewablePdfBudgetException(parsed,site)){
     rows=parsePurchaseRows(parsed.hints.suggested_lines.filter(x=>x.included!==false),{kind:'budget'});
     reviewNeeded=true;
     exceptions=['Le total du rapport inclut des ajustements/forfaits : seuls les articles matériels détectés seront importés.',
      ...parsed.issues.map(i=>i.message)];
    }else{
     setIssues((parsed.issues||[]).map(i=>i.message));
     throw new Error('Ce PDF ne peut pas être importé de façon fiable. Utilisez une liste Excel/CSV ou un PDF complet du chantier.');
    }
   }else if(/\.(xlsx|xls|csv)$/i.test(file.name)){
    rows=await readSheet(file);
    sha=await digest(file);
   }else throw new Error('Sélectionnez un PDF numérique, Excel ou CSV.');
   if(!rows?.length)throw new Error('Aucun article matériel exploitable.');
   if(revisions.some(r=>r.file_sha256 && r.file_sha256===sha))
    throw new Error('Ce fichier a déjà été importé dans ce chantier.');
   setPending({rows,sha,sourceName:file.name.slice(0,250),kind:mode,
    reviewNeeded,exceptions});
  }catch(e){setError(e?.message||'Lecture du fichier impossible.');}
  finally{setBusy(false);}
 };
 const save=async()=>{
  if(!pending || busy || site.status!=='active')return;
  if(!label.trim()) {setError('Donnez un nom à cette version ou à cette liste supplémentaire.');return;}
  const preview=projectedBudgetRevision(budgetLines,pending.rows,revisions,pending.kind);
  if(pending.kind==='replacement' && !window.confirm(
   'Remplacer l’estimation de base actuelle par '+pending.sourceName+
   ' ?\n\nBudget matériel actuel : '+money(preview.current)+
   '\nBudget après remplacement (avenants conservés) : '+money(preview.projected)+
   '\nLes anciennes versions et les commandes resteront conservées.'
  ))return;
  if(pending.reviewNeeded && !window.confirm(
   'Le total global du PDF comporte des écarts. Confirmez que vous souhaitez importer UNIQUEMENT les '+
   pending.rows.length+' articles matériels détectés, pour '+money(preview.newList)+'.'
  ))return;
  setBusy(true);setError('');setSuccess('');
  try{
   const {error:rpcError}=await supabase.rpc('bt_purchase_add_budget_revision',{
    p_company_id:companyId,p_site_id:site.id,
    p_kind:pending.kind,p_label:label.trim(),
    p_source_name:pending.sourceName,p_file_sha256:pending.sha,p_lines:pending.rows
   });
   if(rpcError)throw rpcError;
   setSuccess(pending.kind==='replacement'
    ? 'Estimation remplacée : nouvelle version active. Les avenants et les PO sont conservés.'
    : 'Liste complémentaire ajoutée au budget du chantier.');
   setMode('');setPending(null);setIssues([]);
   await onSaved?.();
  }catch(e){
   setError(e?.code==='23505'?'Ce fichier est déjà enregistré pour ce chantier.':
    e?.message||'Enregistrement impossible.');
  }finally{setBusy(false);}
 };
 const preview=pending?projectedBudgetRevision(budgetLines,pending.rows,revisions,pending.kind):null;
 if(!budget)return null;
 return <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 sm:p-4 space-y-3"
   aria-label="Versions et extensions de l’estimation">
   <div>
    <h3 className="font-semibold text-sm">Mettre à jour le budget matériel</h3>
    <p className="text-xs text-slate-400 mt-1">
     Estimation de base actuelle : {currentBase}. Les commandes déjà passées ne seront pas modifiées.
    </p>
   </div>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    <button type="button" disabled={busy||site.status!=='active'}
     onClick={()=>open('replacement')}
     className="min-h-11 flex items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-950/40 px-3 text-sm text-blue-100 disabled:opacity-50">
     <RefreshCw size={16}/> Remplacer l’estimation de base
    </button>
    <button type="button" disabled={busy||site.status!=='active'}
     onClick={()=>open('extension')}
     className="min-h-11 flex items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-950/40 px-3 text-sm text-blue-100 disabled:opacity-50">
     <Plus size={16}/> Ajouter une liste complémentaire
    </button>
   </div>
   {mode&&<div className="rounded-lg border border-blue-700/60 bg-slate-800/60 p-3 space-y-3">
    <p className="text-sm font-medium">
     {mode==='replacement'?'Nouvelle estimation de base (ancienne conservée)':
      'Nouvelle liste de matériaux pour travaux supplémentaires'}
    </p>
    <label className="block text-xs text-slate-300">Nom de la mise à jour
     <input type="text" maxLength={150} value={label}
      onChange={e=>setLabel(e.target.value)}
      className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-white"/>
    </label>
    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600 p-3 text-sm text-blue-100">
     <FileUp size={17}/> Choisir un PDF numérique, Excel ou CSV
     <input type="file" className="sr-only" disabled={busy}
      accept=".pdf,application/pdf,.xlsx,.xls,.csv"
      onChange={e=>{void select(e.target.files?.[0]);e.target.value='';}}/>
    </label>
    <p className="text-xs text-slate-400">
     Les PDF reconnus sont lus localement. Si une ligne ou le chantier ne peut pas être confirmé,
     aucun enregistrement automatique n’est effectué.
    </p>
   </div>}
   {pending&&preview&&<div className="rounded-lg border border-blue-600 bg-blue-950/20 p-3 space-y-2 text-sm">
    <p className="font-semibold break-words">{pending.sourceName} · {pending.rows.length} articles</p>
    <div className="grid grid-cols-2 gap-2 text-xs">
     <p>Budget actuel : <strong>{money(preview.current)}</strong></p>
     <p>Liste importée : <strong>{money(preview.newList)}</strong></p>
     <p>Nouveau budget : <strong>{money(preview.projected)}</strong></p>
     <p>Écart : <strong>{money(preview.difference)}</strong></p>
    </div>
    {pending.kind==='replacement'&&<p className="text-xs text-amber-200">
     La nouvelle estimation remplace uniquement le budget de base. Les {extensions.length} liste(s)
     complémentaire(s) restent actives. Les rapprochements d’articles devenus obsolètes devront être revus.
    </p>}
    {pending.reviewNeeded&&<p className="text-xs text-amber-200">
     <AlertTriangle size={14} className="inline mr-1"/>
     Le total global du PDF comprend des ajustements : une confirmation unique du total matériel est nécessaire.
    </p>}
    <button type="button" disabled={busy||!label.trim()} onClick={()=>void save()}
     className="min-h-11 w-full rounded-lg bg-blue-600 px-4 font-semibold disabled:opacity-50">
     {busy?'Enregistrement…':pending.kind==='replacement'?'Enregistrer la nouvelle version':'Ajouter cette liste au budget'}
    </button>
   </div>}
   {issues.length>0&&<div role="alert" className="text-xs text-amber-200">
    <p className="font-semibold">Import PDF bloqué :</p>
    <ul className="list-disc ml-4 mt-1">{issues.slice(0,5).map((item,i)=><li key={i}>{item}</li>)}</ul>
   </div>}
   {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
   {success&&<p role="status" className="text-xs text-emerald-300">{success}</p>}
   <button type="button" onClick={()=>setShowHistory(v=>!v)}
    className="min-h-11 flex items-center gap-2 text-xs text-blue-200">
    <History size={16}/> {showHistory?'Masquer':'Afficher'} l’historique des estimations et des listes ({revisions.length+1})
   </button>
   {showHistory&&<div className="max-h-64 overflow-y-auto space-y-2 text-xs">
    <div className="rounded-lg border border-slate-700 p-2">
     <p className="font-semibold">Version initiale · {budget.source_name}</p>
     <p className="text-slate-400">Conservée pour historique · {new Date(budget.created_at).toLocaleDateString('fr-CA')}</p>
    </div>
    {revisions.map(r=><div key={r.id} className="rounded-lg border border-slate-700 p-2">
     <p className="font-semibold">Version {r.revision_no} · {r.kind==='replacement'?'Estimation remplacée':'Liste complémentaire'} · {r.label}</p>
     <p className="text-slate-300">{r.line_count} articles · {money(r.total_amount)} · {r.source_name}</p>
     <p className="text-slate-400">{new Date(r.created_at).toLocaleDateString('fr-CA')}
      {r.kind==='replacement'&&replacements[0]?.id===r.id?' · Estimation de base actuelle':''}</p>
    </div>)}
   </div>}
   <p className="text-xs text-slate-500">
    Les articles, versions et empreintes des fichiers sont historisés. Les PDF originaux ne sont
    pas encore conservés dans un espace documentaire privé.
   </p>
  </section>;
}

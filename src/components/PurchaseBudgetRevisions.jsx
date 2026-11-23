import React,{useState} from 'react';
import * as XLSX from 'xlsx';
import {AlertTriangle,FileUp,History,Plus,RefreshCw} from 'lucide-react';
import {supabase} from '../supabaseClient';
import {parsePurchaseRows,normalizeToken} from '../utils/purchaseBudget';
import {assessDigitalPdf} from '../utils/pdfImportEvidence';
import {parseDecimal} from '../utils/purchaseBudget';
import {prepareReviewedBudgetPdf,validateReviewedBudgetPdf} from '../utils/reviewedBudgetPdf';
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
   let rows,sha,reviewNeeded=false,review=null;
   if(/\.pdf$/i.test(file.name)){
    const {readDigitalPdf}=await import('../utils/digitalPdfReader');
    const read=await readDigitalPdf(file);
    sha=read.sha256;
    const parsed=assessDigitalPdf(read,{
     kind:'budget',site,hasExistingBudget:false,
    });
    if(parsed.status==='auto_commit'){
     rows=parsed.verified_rows;
    }else{
     const draft=prepareReviewedBudgetPdf(parsed,site,read.text);
     rows=draft.rows;
     reviewNeeded=true;
     review={
      ...draft,expectedCount:'',enteredTotal:'',acceptDifference:false,
      acceptMissingTotal:false,siteConfirmation:'',confirmed:false,
     };
     setIssues(draft.issues);
    }
   }else if(/\.(xlsx|xls|csv)$/i.test(file.name)){
    rows=await readSheet(file);
    sha=await digest(file);
   }else throw new Error('Sélectionnez un PDF numérique, Excel ou CSV.');
   if(!rows?.length)throw new Error('Aucun article matériel exploitable.');
   if(revisions.some(r=>r.file_sha256 && r.file_sha256===sha))
    throw new Error('Ce fichier a déjà été importé dans ce chantier.');
   setPending({rows,sha,sourceName:file.name.slice(0,250),kind:mode,
    reviewNeeded,review});
  }catch(e){setError(e?.message||'Lecture du fichier impossible.');}
  finally{setBusy(false);}
 };
 const updateRow=(index,field,value)=>{
  setPending(previous=>previous?{
   ...previous,
   rows:previous.rows.map((row,i)=>i===index?{...row,[field]:value}:row),
   review:previous.review?{...previous.review,confirmed:false}:null,
  }:previous);
 };
 const updateReview=(field,value)=>setPending(previous=>previous?{
  ...previous,review:{...previous.review,[field]:value}
 }:previous);
 const addRow=()=>setPending(previous=>previous?{
  ...previous,rows:[...previous.rows,{
   item_code:'',description:'',quantity:'',unit:'UN',unit_cost:'',amount:'',included:true
  }],
  review:{...previous.review,confirmed:false}
 }:previous);
 const removeRow=index=>setPending(previous=>previous?{
  ...previous,rows:previous.rows.filter((_,i)=>i!==index),
  review:{...previous.review,confirmed:false}
 }:previous);
 const save=async()=>{
  if(!pending || busy || site.status!=='active')return;
  if(!label.trim()) {setError('Donnez un nom à cette version ou à cette liste supplémentaire.');return;}
  let rows=pending.rows;
  try{
   if(pending.reviewNeeded){
    rows=validateReviewedBudgetPdf({
     rows:pending.rows,...pending.review,
     site,expectedCount:pending.review.expectedCount,
     printedMaterialTotal:pending.review.printedMaterialTotal,
     enteredTotal:pending.review.enteredTotal,
     acceptDifference:pending.review.acceptDifference,
     acceptMissingTotal:pending.review.acceptMissingTotal,
     confirmed:pending.review.confirmed,
     extractedProject:pending.review.extractedProject,
     siteConfirmation:pending.review.siteConfirmation,
    }).rows;
   }
  }catch(e){setError(e?.message||'Vérifiez les lignes.');return;}
  const preview=projectedBudgetRevision(budgetLines,rows,revisions,pending.kind);
  if(pending.kind==='replacement' && !window.confirm(
   'Remplacer l’estimation de base actuelle par '+pending.sourceName+
   '?\\n\\nBudget matériel actuel : '+money(preview.current)+
   '\\nBudget après remplacement (avenants conservés) : '+money(preview.projected)+
   '\\nLes anciennes versions et les commandes resteront conservées.'
  ))return;
  if(pending.reviewNeeded && !window.confirm(
   'CONFIRMATION MANUELLE\\n\\nVous avez vérifié les '+rows.length+
   ' lignes matérielles du PDF.\\nTotal retenu : '+money(preview.newList)+
   '.\\nLe PDF ne sera pas conservé : les lignes et son empreinte seront historisées.\\n\\nEnregistrer ce budget ?'
  ))return;
  setBusy(true);setError('');setSuccess('');
  try{
   const {error:rpcError}=await supabase.rpc('bt_purchase_add_budget_revision',{
    p_company_id:companyId,p_site_id:site.id,
    p_kind:pending.kind,p_label:label.trim(),
    p_source_name:pending.sourceName,p_file_sha256:pending.sha,p_lines:rows
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
 const preview=pending?projectedBudgetRevision(budgetLines,pending.rows
  .filter(row=>row.included!==false).map(row=>({amount:parseDecimal(row.amount)||0})),revisions,pending.kind):null;
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
     Les PDF sont analysés localement. Si le format ou le chantier n’est pas reconnu,
     vous pourrez corriger et confirmer les lignes avant tout enregistrement.
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
    {pending.reviewNeeded&&<div className="space-y-3 rounded-lg border border-amber-600/60 p-3">
     <h4 className="font-semibold text-amber-100 flex items-center gap-2">
      <AlertTriangle size={17}/> Validation manuelle du PDF
     </h4>
     <p className="text-xs text-slate-200">Les lignes ci-dessous sont des propositions non vérifiées.
      Comparez-les au PDF original. Les cases décochées sont exclues du budget.</p>
     {issues.length>0&&<div className="text-xs text-amber-200" role="status">
      <p className="font-semibold">Points à vérifier :</p>
      <ul className="ml-4 mt-1 list-disc">
       {issues.slice(0,10).map((issue,i)=><li key={i}>{issue}</li>)}
      </ul>
     </div>}
     <p className="text-xs text-slate-300">
      {pending.review.genericCandidates>0
       ? pending.review.genericCandidates+' ligne(s) candidates retrouvées dans un format non reconnu.'
       : 'Aucune détection générique supplémentaire. Complétez les articles manquants si nécessaire.'}
     </p>
     {normalizeToken(pending.review.extractedProject)!==normalizeToken(site.name)&&
      <label className="block text-xs text-amber-100">
       Chantier du PDF : {pending.review.extractedProject||'non détecté'}.
       Pour confirmer l’affectation à « {site.name} », recopiez exactement son nom :
       <input type="text" value={pending.review.siteConfirmation}
        onChange={e=>updateReview('siteConfirmation',e.target.value)}
        placeholder={site.name} autoComplete="off"
        className="mt-1 w-full rounded-md bg-slate-900 border border-amber-600 p-2 min-h-11 text-white"/>
      </label>}
     <div className="space-y-2 max-h-96 overflow-y-auto" aria-label="Articles à vérifier">
      {pending.rows.map((row,index)=><div key={index}
       className="rounded-lg border border-slate-600 bg-slate-950/50 p-2 space-y-2">
       <div className="flex items-center justify-between gap-2">
        <label className="text-xs flex gap-2 items-center">
         <input type="checkbox" checked={row.included!==false}
          onChange={e=>updateRow(index,'included',e.target.checked)}/>
         Article {index+1} — inclure dans le budget
        </label>
        <button type="button" onClick={()=>removeRow(index)}
         className="text-xs text-red-200 underline min-h-9 px-2">Retirer</button>
       </div>
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[['item_code','Référence'],['description','Description']].map(([key,title])=>
         <label className="text-xs text-slate-300" key={key}>{title}
          <input type="text" value={row[key]??''} onChange={e=>updateRow(index,key,e.target.value)}
           maxLength={key==='description'?500:100}
           className="w-full mt-1 min-h-10 rounded-md border border-slate-600 bg-slate-900 p-2 text-white"/>
         </label>)}
       </div>
       <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['quantity','Quantité'],['unit','Unité'],['unit_cost','Prix unitaire'],['amount','Montant HT']].map(([key,title])=>
         <label className="text-xs text-slate-300" key={key}>{title}
          <input type="text" inputMode={key==='unit'?'text':'decimal'}
           value={row[key]??''} onChange={e=>updateRow(index,key,e.target.value)}
           className="w-full mt-1 min-h-10 rounded-md border border-slate-600 bg-slate-900 p-2 text-white"/>
         </label>)}
       </div>
      </div>)}
     </div>
     <button type="button" disabled={pending.rows.length>=5000} onClick={addRow}
      className="rounded-md border border-blue-500 px-3 min-h-11 text-sm text-blue-100 disabled:opacity-50">
      <Plus className="inline mr-1" size={15}/> Ajouter un article manquant
     </button>
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="text-xs text-slate-200">Nombre d’articles matériels vérifiés sur le PDF
       <input type="number" min="1" step="1" value={pending.review.expectedCount}
        onChange={e=>updateReview('expectedCount',e.target.value)}
        placeholder="À confirmer manuellement"
        className="w-full mt-1 min-h-11 rounded-md border border-slate-600 bg-slate-900 p-2 text-white"/>
      </label>
      <label className="text-xs text-slate-200">Total matériel hors taxes indiqué sur le PDF
       <input type="text" inputMode="decimal"
        value={pending.review.printedMaterialTotal!==null
         ? String(pending.review.printedMaterialTotal) : pending.review.enteredTotal}
        readOnly={pending.review.printedMaterialTotal!==null}
        onChange={e=>updateReview('enteredTotal',e.target.value)}
        placeholder="À saisir si connu"
        className="w-full mt-1 min-h-11 rounded-md border border-slate-600 bg-slate-900 p-2 text-white read-only:opacity-70"/>
      </label>
     </div>
     <label className="flex items-start gap-2 text-xs text-slate-200">
      <input type="checkbox" checked={pending.review.acceptMissingTotal}
       onChange={e=>updateReview('acceptMissingTotal',e.target.checked)}/>
      Le PDF ne fournit pas de total matériel vérifiable : j’accepte le total calculé des articles.
     </label>
     <label className="flex items-start gap-2 text-xs text-slate-200">
      <input type="checkbox" checked={pending.review.acceptDifference}
       onChange={e=>updateReview('acceptDifference',e.target.checked)}/>
      Un écart avec le total imprimé subsiste (forfaits, ajustements ou exclusions) :
      je le reconnais explicitement.
     </label>
     <label className="flex items-start gap-2 text-xs font-semibold text-amber-100">
      <input type="checkbox" checked={pending.review.confirmed}
       onChange={e=>updateReview('confirmed',e.target.checked)}/>
      J’ai comparé toutes les lignes, quantités et montants au PDF original et confirmé
      que les articles inclus constituent la liste matérielle complète à importer.
     </label>
     <details className="text-xs text-slate-300">
      <summary className="cursor-pointer min-h-10">Voir le texte extrait du PDF pour contrôler les articles</summary>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 mt-2">
       {pending.review.sourceExcerpt||'Aucun texte de référence disponible.'}
      </pre>
     </details>
    </div>}
    <button type="button" disabled={busy||!label.trim()} onClick={()=>void save()}
     className="min-h-11 w-full rounded-lg bg-blue-600 px-4 font-semibold disabled:opacity-50">
     {busy?'Enregistrement…':pending.kind==='replacement'?'Enregistrer la nouvelle version':'Ajouter cette liste au budget'}
    </button>
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

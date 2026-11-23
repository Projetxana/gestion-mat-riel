import React, {useMemo,useState} from 'react';
import {AlertTriangle, CheckCircle2, Link2} from 'lucide-react';
import {supabase} from '../supabaseClient';
import {suggestBudgetCorrespondences} from '../utils/purchaseBudget';

const money=value=>new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'}).format(Number(value||0));

export default function PurchaseLineReconciliation({
 site,companyId,budgetLines,orders,comparisons,links,onUpdated,enabled=true
}){
 const [draft,setDraft]=useState({});
 const [showAll,setShowAll]=useState(false);
 const [showResolved,setShowResolved]=useState(false);
 const [saving,setSaving]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const orderMap=useMemo(()=>new Map(orders.map(o=>[String(o.id),o])),[orders]);
 const pending=comparisons.unmatched||[];
 const savedLinks=links||[];
 const displayed=showAll?pending:pending.slice(0,10);

 const write=async (line,disposition,target='')=>{
  if(!enabled||saving)return;
  setError('');setNotice('');
  if(disposition==='linked'&&!budgetLines.some(b=>String(b.id)===String(target))){
   setError('Choisissez un article de l’estimation pour créer le rapprochement.');return;
  }
  if(disposition==='outside_budget'&&!window.confirm(
   'Classer cet article comme achat hors estimation ? Le montant restera comptabilisé dans les commandes.'
  ))return;
  setSaving(String(line.id));
  try {
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user?.id)throw new Error('Session administrateur expirée.');
   const {error:writeError}=await supabase.from('bt_purchase_line_links').upsert({
    company_id:companyId,site_id:site.id,order_line_id:line.id,
    budget_line_id:disposition==='linked'?Number(target):null,
    disposition,created_by:user.id
   },{onConflict:'order_line_id'});
   if(writeError)throw writeError;
   setNotice(disposition==='linked'
    ? 'Correspondance enregistrée. Quantités mises à jour, coûts inchangés.'
    : 'Achat classé hors estimation. Son montant reste engagé.');
   await onUpdated?.();
  } catch(err){setError('Enregistrement impossible : '+(err?.message||'erreur réseau'));}
  finally {setSaving('');}
 };
 const forget=async orderLineId=>{
  if(!enabled||saving||!window.confirm('Retirer cette correspondance ? Les montants resteront inchangés.'))return;
  setSaving(String(orderLineId));setError('');setNotice('');
  try {
   const {error:writeError}=await supabase.from('bt_purchase_line_links').delete()
     .eq('company_id',companyId).eq('site_id',site.id).eq('order_line_id',orderLineId);
   if(writeError)throw writeError;
   setNotice('Correspondance retirée. La ligne est de nouveau à rapprocher.');
   await onUpdated?.();
  }catch(err){setError('Impossible de retirer la correspondance : '+(err?.message||'erreur'));}
  finally{setSaving('');}
 };
 return <section className="space-y-3 border-t border-slate-700 pt-3" aria-label="Rapprochement des achats">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <h4 className="font-semibold text-sm">Rapprochement des commandes</h4>
   <span className="rounded-lg bg-amber-950/50 px-2 py-1 text-xs text-amber-200 tabular-nums">
    {pending.length} ligne(s) à rapprocher
   </span>
  </div>
  <p className="text-xs text-slate-300">
   Ces lignes sont <strong>déjà enregistrées dans les commandes</strong>, mais leur référence fournisseur
   diffère du code de l’estimation. Associez-les à un article prévu ou classez-les hors estimation.
   Les prix et les montants engagés ne changent pas.
  </p>
  {!enabled && <p role="status" className="text-xs text-amber-300">
   Le rapprochement sauvegardé n’est pas encore activé sur cette base.
  </p>}
  {!pending.length && <p className="text-xs text-emerald-300 flex items-center gap-2">
   <CheckCircle2 size={15}/> Toutes les lignes sont rapprochées ou classées.
  </p>}
  {displayed.map(line=>{
   const po=orderMap.get(String(line.order_id));
   const suggestions=suggestBudgetCorrespondences(line,budgetLines);
   const best=suggestions[0],next=suggestions[1];
   const high=best&&best.score>=2.2&&(!next||best.score-next.score>=0.8);
   const preferred=high?String(best.id):'';
   const value=String(draft[line.id]??preferred);
   const candidate=suggestions.filter(b=>b.score>0).slice(0,10);
   const rest=suggestions.filter(b=>!candidate.some(c=>String(c.id)===String(b.id)));
   return <article key={line.id} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-2">
    <p className="text-xs font-semibold break-words">{line.item_code} · {line.description}</p>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
     <span>PO {po?.po_number||'—'} · {po?.supplier||'Fournisseur inconnu'}</span>
     <span className="tabular-nums">{Number(line.quantity)} {line.unit}</span>
     <span className="tabular-nums">{money(line.amount)}</span>
    </div>
    <label className="block text-xs text-slate-300">Article correspondant dans l’estimation
     <select value={value} disabled={!enabled||Boolean(saving)}
      onChange={e=>{setDraft(p=>({...p,[line.id]:e.target.value}));setError('');}}
      className="mt-1 w-full min-h-11 rounded-lg border border-slate-600 bg-slate-800 px-2 text-sm text-white">
      <option value="">Choisir un article de l’estimation</option>
      {candidate.length>0 && <optgroup label="Suggestions (à confirmer)">
       {candidate.map(b=><option key={b.id} value={String(b.id)}>
        {b.item_code} · {b.description} · {Number(b.quantity)} {b.unit}
       </option>)}
      </optgroup>}
      <optgroup label="Tous les autres articles de l’estimation">
       {rest.map(b=><option key={b.id} value={String(b.id)}>
        {b.item_code} · {b.description} · {Number(b.quantity)} {b.unit}
       </option>)}
      </optgroup>
     </select>
    </label>
    {high&&draft[line.id]===undefined && <p className="text-xs text-blue-200">
     Correspondance probable proposée; aucune association n’est enregistrée automatiquement.
    </p>}
    <div className="flex flex-wrap gap-2">
     <button type="button" disabled={!enabled||Boolean(saving)||!value}
      onClick={()=>void write(line,'linked',value)}
      className="min-h-11 rounded-lg bg-blue-700 px-3 text-xs font-semibold disabled:opacity-50 flex items-center gap-2">
      <Link2 size={15}/> {saving===String(line.id)?'Enregistrement…':'Associer à l’estimation'}
     </button>
     <button type="button" disabled={!enabled||Boolean(saving)}
      onClick={()=>void write(line,'outside_budget')}
      className="min-h-11 rounded-lg border border-slate-600 px-3 text-xs disabled:opacity-50">
      Achat hors estimation
     </button>
    </div>
   </article>;
  })}
  {pending.length>10 && <button type="button" onClick={()=>setShowAll(v=>!v)}
   className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-blue-200">
   {showAll?'Afficher moins':'Voir les '+pending.length+' lignes non rapprochées'}
  </button>}
  {savedLinks.length>0 && <>
   <button type="button" onClick={()=>setShowResolved(v=>!v)}
    className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-blue-200">
    {showResolved?'Masquer':'Voir et corriger'} les {savedLinks.length} correspondance(s) enregistrée(s)
   </button>
   {showResolved && <div className="space-y-2">
    {savedLinks.map(link=>{
     const target=budgetLines.find(b=>String(b.id)===String(link.budget_line_id));
     return <div key={link.order_line_id} className="rounded-lg border border-slate-700 p-2 flex items-center justify-between gap-3 text-xs">
      <span className="min-w-0 break-words">Commande #{link.order_line_id} → {link.disposition==='outside_budget'
       ?'Hors estimation':(target?.item_code||'Référence inconnue')+' · '+(target?.description||'Article introuvable')}</span>
      <button type="button" disabled={!enabled||Boolean(saving)}
       onClick={()=>void forget(link.order_line_id)}
       className="min-h-11 shrink-0 rounded-lg border border-slate-600 px-2 text-blue-200 disabled:opacity-50">
       Corriger
      </button>
     </div>;
    })}
   </div>}
  </>}
  {error&&<p role="alert" className="text-xs text-red-300 flex gap-2"><AlertTriangle size={14}/>{error}</p>}
  {notice&&<p role="status" className="text-xs text-emerald-300">{notice}</p>}
 </section>;
}

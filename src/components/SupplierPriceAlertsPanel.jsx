import React,{useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,Link2} from 'lucide-react';
import {supabase} from '../supabaseClient';
import {activeSupplierQuotes,compareSupplierPrices} from '../utils/supplierPriceWatch';
import {normalizeToken} from '../utils/purchaseBudget';

const money=value=>new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'}).format(Number(value||0));
const unitPrice=value=>new Intl.NumberFormat('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:4})
 .format(Number(value||0))+' $';

export default function SupplierPriceAlertsPanel({
 site,companyId,quotes=[],quoteLines=[],orders=[],orderLines=[],links=[],enabled=true,onUpdated,
}){
 const [draft,setDraft]=useState({});
 const [saving,setSaving]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [expanded,setExpanded]=useState(false);
 const comparison=useMemo(()=>compareSupplierPrices({quotes,quoteLines,orders,orderLines,links}),
  [quotes,quoteLines,orders,orderLines,links]);
 const active=useMemo(()=>activeSupplierQuotes(quotes),[quotes]);
 const quoteBySupplier=new Map(active.map(q=>[normalizeToken(q.supplier),q]));
 const toReview=comparison.needsReview;
 const displayRows=expanded?toReview:toReview.slice(0,6);

 const link=async(line,targetId)=>{
  if(!enabled||saving||!targetId)return;
  setError('');setNotice('');setSaving(String(line.id));
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user?.id)throw new Error('Session administrateur expirée.');
   const {error:writeError}=await supabase.from('bt_supplier_price_line_links').upsert({
    order_line_id:line.id,quote_line_id:Number(targetId),
    site_id:site.id,company_id:companyId,created_by:user.id,
   },{onConflict:'order_line_id'});
   if(writeError)throw writeError;
   setNotice('Correspondance de prix enregistrée. Comparaison recalculée.');
   await onUpdated?.();
  }catch(e){setError(e?.message||'Correspondance non enregistrée.');}
  finally{setSaving('');}
 };
 if(!enabled)return null;
 return <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 sm:p-4 space-y-3"
  aria-label="Alertes de prix fournisseurs">
  <h3 className="text-sm font-semibold flex items-center gap-2">
   <AlertTriangle size={17}/> Contrôle des prix sur les commandes confirmées</h3>
  {!active.length&&<p className="text-xs text-slate-400">
   Importez d’abord la soumission fournisseur dans le volet Budget pour activer les alertes.
  </p>}
  {active.length>0&&<>
   <p className="text-xs text-slate-300">
    Comparaison hors taxes des prix unitaires sur les confirmations de commande tarifées.
    Un bon de livraison sans prix ne peut pas confirmer un dépassement.
   </p>
   <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
    <div className="rounded-lg border border-red-800/60 p-2">
     <p className="text-slate-400">Lignes au-dessus du prix convenu</p>
     <strong className="text-red-200 text-lg tabular-nums">{comparison.overpriceCount}</strong>
    </div>
    <div className="rounded-lg border border-red-800/60 p-2">
     <p className="text-slate-400">Surcoût détecté (HT)</p>
     <strong className="text-red-200 text-lg tabular-nums">{money(comparison.impact)}</strong>
    </div>
    <div className="rounded-lg border border-amber-800/60 p-2 col-span-2 sm:col-span-1">
     <p className="text-slate-400">Lignes à rapprocher</p>
     <strong className="text-amber-200 text-lg tabular-nums">{toReview.length}</strong>
    </div>
   </div>
   {comparison.overpriceCount>0&&<div role="alert" className="border border-red-700 rounded-lg p-3 space-y-2">
    <p className="text-red-200 font-semibold text-sm">
     Prix d’achat supérieur à la soumission : {money(comparison.impact)} HT
    </p>
    {comparison.overpriced.map(row=><article key={row.id} className="text-xs border-b border-red-900/60 pb-2">
     <p className="font-semibold">{row.item_code} · {row.description}</p>
     <p className="text-slate-300">PO {row.poNumber} · {row.supplier} · {row.quantity} {row.unit}</p>
     <p className="text-red-200 tabular-nums">Soumission {unitPrice(row.referenceUnitCost)} /
      {row.reference?.unit} → Confirmé {unitPrice(row.unit_cost)} / {row.unit}
      {' '}· Surcoût {unitPrice(row.deltaPerUnit)} / unité · {money(row.impact)} HT</p>
    </article>)}
   </div>}
   {comparison.overpriceCount===0&&toReview.length===0&&
    <p className="text-xs text-emerald-200 flex gap-2 items-center">
     <CheckCircle2 size={16}/> Aucune hausse détectée sur les lignes tarifées rapprochées.
    </p>}
   {toReview.length>0&&<div className="space-y-2 border border-amber-700/60 p-3 rounded-lg">
    <h4 className="font-semibold text-xs text-amber-200">
     {toReview.length} ligne(s) sans comparaison fiable — action nécessaire</h4>
    <p className="text-xs text-slate-300">
     Les codes ou unités peuvent différer. Aucune correspondance par description seule n’est validée automatiquement.
    </p>
    {displayRows.map(row=>{
     const q=quoteBySupplier.get(normalizeToken(row.supplier));
     const available=quoteLines.filter(line=>String(line.quote_id)===String(q?.id))
      .filter(line=>{
       const unit=normalizeToken(line.unit),actual=normalizeToken(row.unit);
       return unit===actual || (['FT','PI','PIED'].includes(unit)&&['FT','PI','PIED'].includes(actual)) ||
        (['UN','EA','PC'].includes(unit)&&['UN','EA','PC'].includes(actual));
      });
     return <article key={row.id} className="rounded-md bg-slate-950/40 p-2 space-y-2 text-xs">
      <p className="font-medium">{row.item_code||'Sans code'} · {row.description}</p>
      <p className="text-slate-400">PO {row.poNumber} · {row.quantity} {row.unit} ·
       prix confirmé {unitPrice(row.unit_cost)} · statut {row.status}</p>
      <label className="block text-slate-300">Associer manuellement au produit de la soumission
       <select value={draft[row.id]||''} disabled={Boolean(saving)}
        onChange={e=>setDraft(p=>({...p,[row.id]:e.target.value}))}
        className="mt-1 w-full min-h-11 rounded-md border border-slate-600 bg-slate-800 p-2">
        <option value="">Sélectionner la référence fournisseur</option>
        {available.map(line=><option key={line.id} value={String(line.id)}>
         {line.item_code} · {line.description} · {unitPrice(line.unit_cost)}/{line.unit}
        </option>)}
       </select>
      </label>
      <button type="button" disabled={!draft[row.id]||Boolean(saving)}
       onClick={()=>void link(row,draft[row.id])}
       className="min-h-10 rounded-lg bg-blue-700 px-3 font-medium disabled:opacity-50 flex items-center gap-1">
       <Link2 size={14}/> Confirmer la correspondance
      </button>
     </article>;
    })}
    {toReview.length>6&&<button type="button" onClick={()=>setExpanded(v=>!v)}
     className="min-h-10 rounded-lg border border-slate-600 px-3 text-xs text-blue-200">
     {expanded?'Afficher moins':'Afficher les '+toReview.length+' lignes'}
    </button>}
   </div>}
  </>}
  {error&&<p role="alert" className="text-sm text-red-200">{error}</p>}
  {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}
 </section>;
}

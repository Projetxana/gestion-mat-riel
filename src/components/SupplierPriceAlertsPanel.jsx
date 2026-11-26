import React,{useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,Link2} from 'lucide-react';
import {supabase} from '../supabaseClient';
import {activeSupplierQuotes,compareSupplierPrices} from '../utils/supplierPriceWatch';
import {normalizeToken} from '../utils/purchaseBudget';

const money=value=>new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'})
 .format(Number(value||0));
const unitPrice=value=>new Intl.NumberFormat('fr-CA',{
 minimumFractionDigits:2,maximumFractionDigits:4,
}).format(Number(value||0))+' $';

// Never ask an admin to link an ordered article to a product absent from the
// quotation. Such lines are visible separately, with an optional explicit
// equivalence override if the vendor used a different code.
export default function SupplierPriceAlertsPanel({
 site,companyId,quotes=[],quoteLines=[],orders=[],orderLines=[],links=[],enabled=true,onUpdated,
}){
 const [draft,setDraft]=useState({});
 const [saving,setSaving]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [expanded,setExpanded]=useState(false);
 const [showAllUnquoted,setShowAllUnquoted]=useState(false);
 const comparison=useMemo(()=>compareSupplierPrices({quotes,quoteLines,orders,orderLines,links}),
  [quotes,quoteLines,orders,orderLines,links]);
 const active=useMemo(()=>activeSupplierQuotes(quotes),[quotes]);
 const quoteBySupplier=new Map(active.map(q=>[normalizeToken(q.supplier),q]));
 const toReview=comparison.needsReview;
 const notInQuote=comparison.notInQuote||[];
 const comparable=comparison.lines.filter(row=>['ok','below','above'].includes(row.status));
 const withoutReference=comparison.lines.filter(row=>['no_reference','other_supplier'].includes(row.status));

 const link=async(row,targetId)=>{
  if(!enabled||saving||!targetId)return;
  const quoteLine=quoteLines.find(line=>String(line.id)===String(targetId));
  if(!quoteLine||!window.confirm(
   'Certifiez-vous que '+row.item_code+' et '+quoteLine.item_code+
   ' sont le même produit et que leurs unités sont compatibles ?\n'+
   'Cette correspondance activera la comparaison des prix sans modifier les achats.'
  ))return;
  setError('');setNotice('');setSaving(String(row.id));
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user?.id)throw new Error('Session administrateur expirée.');
   const {error:writeError}=await supabase.from('bt_supplier_price_line_links').upsert({
    order_line_id:row.id,quote_line_id:Number(targetId),
    site_id:site.id,company_id:companyId,created_by:user.id,
   },{onConflict:'order_line_id'});
   if(writeError)throw writeError;
   setNotice('Correspondance confirmée. Le contrôle des prix est recalculé.');
   await onUpdated?.();
  }catch(e){setError(e?.message||'Correspondance non enregistrée.');}
  finally{setSaving('');}
 };

 const manualMapping=row=>{
  const q=quoteBySupplier.get(normalizeToken(row.supplier));
  const available=quoteLines.filter(line=>String(line.quote_id)===String(q?.id))
   .filter(line=>{
    const unit=normalizeToken(line.unit),actual=normalizeToken(row.unit);
    return unit===actual ||
     (['FT','PI','PIED'].includes(unit)&&['FT','PI','PIED'].includes(actual))||
     (['UN','EA','PC'].includes(unit)&&['UN','EA','PC'].includes(actual));
   });
  return <div className="space-y-2">
   <label className="block text-xs text-slate-300">
    Choisir uniquement le même produit avec une autre référence
    <select value={draft[row.id]||''} disabled={Boolean(saving)}
     onChange={e=>setDraft(p=>({...p,[row.id]:e.target.value}))}
     className="mt-1 w-full min-h-11 rounded-md border border-slate-600 bg-slate-800 p-2">
     <option value="">Sélectionner l’article strictement équivalent</option>
     {available.map(line=><option key={line.id} value={String(line.id)}>
      {line.item_code} · {line.description} · {unitPrice(line.unit_cost)}/{line.unit}
     </option>)}
    </select>
   </label>
   <button type="button" disabled={!draft[row.id]||Boolean(saving)}
    onClick={()=>void link(row,draft[row.id])}
    className="min-h-10 rounded-lg bg-blue-700 px-3 text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2">
    <Link2 size={14}/> Confirmer la correspondance
   </button>
  </div>;
 };

 if(!enabled)return null;
 return <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 sm:p-4 space-y-3"
  aria-label="Alertes de prix fournisseurs">
  <h3 className="text-sm font-semibold flex items-center gap-2">
   <AlertTriangle size={17}/> Contrôle des prix sur les commandes confirmées
  </h3>
  {!active.length&&<p className="text-xs text-slate-400">
   Aucune référence de prix active. Les prix des commandes ne peuvent pas être comparés.
  </p>}
  {active.length>0&&<>
   <p className="text-xs text-slate-300">
    Comparaison hors taxes des prix unitaires des confirmations tarifées.
    Les commandes historiques sont comparées aux références actuellement actives.
   </p>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
    <div className="rounded-lg border border-red-800/60 p-2">
     <p className="text-slate-400">Prix au-dessus du devis</p>
     <strong className="text-red-200 text-lg tabular-nums">{comparison.overpriceCount}</strong>
    </div>
    <div className="rounded-lg border border-red-800/60 p-2">
     <p className="text-slate-400">Surcoût détecté HT</p>
     <strong className="text-red-200 text-lg tabular-nums">{money(comparison.impact)}</strong>
    </div>
    <div className="rounded-lg border border-slate-700 p-2">
     <p className="text-slate-400">Hors soumission</p>
     <strong className="text-slate-100 text-lg tabular-nums">{comparison.notInQuoteCount}</strong>
    </div>
    <div className="rounded-lg border border-amber-800/60 p-2">
     <p className="text-slate-400">Correspondances incertaines</p>
     <strong className="text-amber-200 text-lg tabular-nums">{toReview.length}</strong>
    </div>
   </div>
   {comparison.overpriceCount>0&&<div role="alert" className="border border-red-700 rounded-lg p-3 space-y-2">
    <p className="text-red-200 font-semibold text-sm">
     Prix confirmé supérieur à la soumission : {money(comparison.impact)} HT
    </p>
    {comparison.overpriced.map(row=><article key={row.id}
     className="text-xs border-b border-red-900/60 pb-2">
     <p className="font-semibold">{row.item_code} · {row.description}</p>
     <p className="text-slate-300">Commande {row.poNumber} · {row.quantity} {row.unit}</p>
     <p className="text-red-200 tabular-nums">
      Soumission {unitPrice(row.referenceUnitCost)}/{row.reference?.unit} →
      confirmé {unitPrice(row.unit_cost)}/{row.unit} ·
      hausse {unitPrice(row.deltaPerUnit)}/unité · {money(row.impact)} HT
     </p>
    </article>)}
   </div>}
   {withoutReference.length>0&&<p className="text-xs text-amber-200">{withoutReference.length} ligne(s) sans référence fournisseur active.</p>}
   {comparable.length===0&&<p className="text-xs text-amber-200">Aucune ligne comparable.</p>}
   {comparison.overpriceCount===0&&comparable.length>0&&<p className="text-xs text-emerald-200 flex items-center gap-2">
    <CheckCircle2 size={16}/> Aucune hausse détectée sur les lignes
    disposant d’une référence de prix fiable.
   </p>}
   {notInQuote.length>0&&<section className="space-y-2 border border-slate-600 rounded-lg p-3"
    aria-label="Articles commandés hors soumission Flocor">
    <h4 className="text-sm font-semibold">
     Articles commandés hors soumission · {notInQuote.length} ligne(s) ·
     {' '}{money(comparison.notInQuoteAmount)} HT engagés
    </h4>
    <p className="text-xs text-slate-300">
     Ces produits ont été commandés sans figurer dans la soumission de référence.
     Ils ne sont pas à rapprocher et n’ont pas de prix de comparaison.
     Leurs dépenses sont entièrement incluses dans le suivi du budget global.
    </p>
    <p className="text-xs text-slate-400">
     Liste informative conservée pour analyser les écarts entre estimations et
     achats réels en fin de chantier. Ces achats ne modifient ni la soumission
     initiale ni le montant du budget de référence. Aucune intervention requise.
    </p>
    {(showAllUnquoted?notInQuote:notInQuote.slice(0,6)).map(row=>
     <article key={row.id} className="rounded-md bg-slate-950/40 p-2 space-y-2 text-xs">
      <p className="font-medium break-words">{row.item_code||'Sans référence'} · {row.description}</p>
      <p className="text-slate-300">Commande {row.poNumber} · {row.quantity} {row.unit} ·
       {' '}{unitPrice(row.unit_cost)}/unité · {money(row.amount)} HT</p>
     </article>
    )}
    {notInQuote.length>6&&<button type="button" onClick={()=>setShowAllUnquoted(v=>!v)}
     className="min-h-10 rounded-lg border border-slate-600 px-3 text-xs text-blue-200">
     {showAllUnquoted?'Afficher moins':'Afficher toutes les '+notInQuote.length+' lignes'}
    </button>}
   </section>}
   {toReview.length>0&&<div className="space-y-2 border border-amber-700/60 p-3 rounded-lg">
    <h4 className="font-semibold text-xs text-amber-200">
     {toReview.length} correspondance(s) à examiner — action nécessaire
    </h4>
    <p className="text-xs text-slate-300">
     Une unité incompatible, un prix ambigu ou un ancien lien empêche la comparaison.
     N’associez jamais deux produits différents.
    </p>
    {(expanded?toReview:toReview.slice(0,6)).map(row=><article key={row.id}
     className="rounded-md bg-slate-950/40 p-2 space-y-2 text-xs">
     <p className="font-medium">{row.item_code||'Sans code'} · {row.description}</p>
     <p className="text-slate-400">Commande {row.poNumber} · {row.quantity} {row.unit} ·
      prix confirmé {unitPrice(row.unit_cost)} · état : {row.status}</p>
     {manualMapping(row)}
    </article>)}
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

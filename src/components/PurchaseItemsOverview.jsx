import React,{useMemo,useState} from 'react';
import {Search,ChevronDown,ChevronUp} from 'lucide-react';
import {buildPurchaseItemsView,filterPurchaseItems} from '../utils/purchaseItemsView';

const money=value=>new Intl.NumberFormat('fr-CA',{
 style:'currency',currency:'CAD',minimumFractionDigits:2,
}).format(Number(value||0));
const qty=value=>new Intl.NumberFormat('fr-CA',{
 maximumFractionDigits:3,
}).format(Number(value||0));
const unitPrice=value=>new Intl.NumberFormat('fr-CA',{
 minimumFractionDigits:2,maximumFractionDigits:4,
}).format(Number(value||0))+' $';
const statuses={
 none:{label:'Aucun achat identifié',color:'text-slate-300'},
 partial:{label:'Partiellement commandé',color:'text-blue-200'},
 complete:{label:'Quantité atteinte',color:'text-emerald-200'},
 over:{label:'Quantité dépassée',color:'text-amber-200'},
};

const Cell=({label,children})=><div className="min-w-0">
 <p className="text-[11px] text-slate-400">{label}</p>
 <p className="text-sm font-medium tabular-nums break-words">{children}</p>
</div>;

export default function PurchaseItemsOverview({budgetLines=[],comparisons}){
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState('all');
 const [visible,setVisible]=useState(20);
 const view=useMemo(()=>buildPurchaseItemsView(budgetLines,comparisons),
  [budgetLines,comparisons]);
 const matching=useMemo(()=>filterPurchaseItems(view.rows,query,filter),
  [view.rows,query,filter]);
 const rows=matching.slice(0,visible);
 const more=matching.length>visible;
 const changeQuery=next=>{setQuery(next);setVisible(20);};
 const changeFilter=next=>{setFilter(next);setVisible(20);};
 const handleStatus=row=>statuses[row.status]||statuses.none;

 return <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3 sm:p-4"
  aria-label="Articles prévus et achats par référence">
  <div className="space-y-1">
   <h3 className="text-base font-semibold">Articles prévus et achats</h3>
   <p className="text-xs text-slate-300">
    Les montants prévus viennent de la soumission de référence.
    Les quantités et coûts commandés correspondent uniquement aux références
    identifiées dans les confirmations. Tous les autres achats sont quand même
    inclus dans les dépenses globales du chantier.
   </p>
   <p className="text-xs text-slate-400">
    {view.counts.quotedLines} lignes de soumission regroupées en
    {' '}{view.counts.references} références ·
    {' '}{view.counts.withOrders} avec achats identifiés ·
    {' '}{view.counts.noOrders} sans achat identifié
    {view.counts.over>0?' · '+view.counts.over+' dépassement(s) de quantité':''}
   </p>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)] gap-2">
   <label className="relative block">
    <span className="sr-only">Rechercher une référence ou une description</span>
    <Search aria-hidden="true" size={17} className="absolute left-3 top-3.5 text-slate-400"/>
    <input type="search" value={query} onChange={e=>changeQuery(e.target.value)}
     placeholder="Rechercher un article ou un code"
     className="w-full min-h-11 rounded-lg border border-slate-600 bg-slate-950 pl-10 pr-3 text-sm text-white placeholder:text-slate-400"
    />
   </label>
   <label>
    <span className="sr-only">Filtrer les articles</span>
    <select value={filter} onChange={e=>changeFilter(e.target.value)}
     className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white">
     <option value="all">Tous les articles</option>
     <option value="ordered">Avec achats identifiés</option>
     <option value="none">Sans achat identifié</option>
     <option value="remaining">Quantité restante</option>
     <option value="over">Quantité dépassée</option>
    </select>
   </label>
  </div>
  <p role="status" className="text-xs text-slate-400">
   {matching.length} référence(s) correspondent à la recherche
  </p>
  <div className="hidden lg:block overflow-x-auto rounded-lg border border-slate-700">
   <table className="w-full min-w-[790px] border-collapse text-left text-xs">
    <thead className="bg-slate-800 text-slate-300">
     <tr>
      <th scope="col" className="px-3 py-3 font-semibold w-[27%]">Article / référence</th>
      <th scope="col" className="px-2 py-3 font-semibold">Prévu</th>
      <th scope="col" className="px-2 py-3 font-semibold">Commandé¹</th>
      <th scope="col" className="px-2 py-3 font-semibold">Prix unitaire réf.</th>
      <th scope="col" className="px-2 py-3 font-semibold">Montant prévu</th>
      <th scope="col" className="px-2 py-3 font-semibold">Coût commandé¹</th>
      <th scope="col" className="px-3 py-3 font-semibold">Suivi quantité</th>
     </tr>
    </thead>
    <tbody>
     {rows.map(row=><tr key={row.key} className="border-t border-slate-700/80 align-top">
      <th scope="row" className="px-3 py-3 font-normal break-words">
       <span className="block font-semibold text-slate-100">{row.item_code}</span>
       <span className="block mt-1 text-slate-300">{row.description}</span>
       {row.sourceLineCount>1&&<span className="text-slate-400">
        {row.sourceLineCount} lignes regroupées
       </span>}
      </th>
      <td className="px-2 py-3 tabular-nums whitespace-nowrap">
       {qty(row.estimatedQty)} {row.unit}</td>
      <td className="px-2 py-3 tabular-nums whitespace-nowrap">
       {qty(row.orderedQty)} {row.unit}</td>
      <td className="px-2 py-3 tabular-nums whitespace-nowrap">
       {row.approximateUnitPrice?'≈ ':''}{unitPrice(row.quotedUnitPrice)}</td>
      <td className="px-2 py-3 tabular-nums whitespace-nowrap font-semibold">
       {money(row.quotedTotal)}</td>
      <td className="px-2 py-3 tabular-nums whitespace-nowrap">
       {money(row.committedMatched)}</td>
      <td className="px-3 py-3">
       <span className={'block font-medium '+handleStatus(row).color}>
        {handleStatus(row).label}
       </span>
       <span className="block text-slate-400 tabular-nums mt-1">
        {row.extraQty>0?qty(row.extraQty)+' '+row.unit+' de plus':
         qty(row.remainingQty)+' '+row.unit+' restantes'}
       </span>
      </td>
     </tr>)}
    </tbody>
   </table>
  </div>
  <div className="lg:hidden space-y-2">
   {rows.map(row=><article key={row.key} className="rounded-lg border border-slate-700 p-3 space-y-3">
    <div className="space-y-1">
     <p className="text-sm font-semibold break-words">{row.item_code}</p>
     <p className="text-xs text-slate-300 break-words">{row.description}</p>
    </div>
    <div className="grid grid-cols-2 gap-3">
     <Cell label="Quantité prévue">{qty(row.estimatedQty)} {row.unit}</Cell>
     <Cell label="Quantité commandée¹">{qty(row.orderedQty)} {row.unit}</Cell>
     <Cell label="Prix unitaire Flocor">{row.approximateUnitPrice?'≈ ':''}{unitPrice(row.quotedUnitPrice)}</Cell>
     <Cell label="Montant prévu">{money(row.quotedTotal)}</Cell>
     <Cell label="Coût commandé¹">{money(row.committedMatched)}</Cell>
     <Cell label="Quantité restante">
      {row.extraQty>0?'+'+qty(row.extraQty):qty(row.remainingQty)} {row.unit}
     </Cell>
    </div>
    <p className={'text-xs font-semibold '+handleStatus(row).color}>
     {handleStatus(row).label}
    </p>
   </article>)}
  </div>
  {!matching.length&&<p className="text-sm text-slate-300 py-4 text-center">
   Aucun article ne correspond aux filtres choisis.
  </p>}
  {more&&<button type="button" onClick={()=>setVisible(n=>n+20)}
   className="w-full min-h-11 rounded-lg border border-blue-600 px-3 text-sm font-medium text-blue-200 inline-flex gap-2 items-center justify-center">
   Afficher 20 références supplémentaires <ChevronDown size={16} aria-hidden="true"/>
  </button>}
  {visible>20&&<button type="button" onClick={()=>setVisible(20)}
   className="min-h-10 px-2 text-xs text-slate-300 inline-flex gap-1 items-center">
   Replier la liste <ChevronUp size={15} aria-hidden="true"/>
  </button>}
  <p className="text-[11px] leading-5 text-slate-400">
   ¹ « Commandé » signifie : références reconnues par code fournisseur ou alias.
   Un zéro ne prouve pas l’absence d’achat. Les produits sans correspondance
   figurent dans « Articles commandés hors soumission » et restent comptés dans
   le montant total engagé. Le prix marqué ≈ est une moyenne si plusieurs
   lignes du budget possèdent des prix différents. Ces quantités ne servent
   jamais à recalculer le budget global.
  </p>
 </section>;
}

import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FileText,Search,X} from 'lucide-react';

const currency=value=>new Intl.NumberFormat('fr-CA',{
 style:'currency',currency:'CAD',
}).format(Number(value||0));
const quantity=value=>new Intl.NumberFormat('fr-CA',{
 maximumFractionDigits:3,
}).format(Number(value||0));
const unitPrice=value=>new Intl.NumberFormat('fr-CA',{
 minimumFractionDigits:2,maximumFractionDigits:4,
}).format(Number(value||0))+' $';
const folded=value=>String(value||'').normalize('NFKD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase();

/**
 * Read-only preview of previously extracted purchase information.
 *
 * It is intentionally NOT presented as a PDF rendition: no original bytes
 * are available until a separate, explicit archive action is completed.
 * All line values come from the stored quote/order, never from inference.
 */
export default function PurchaseDataPreview({
 kind,source,site,lines=[],onClose,
}){
 const closeRef=useRef(null);
 const onCloseRef=useRef(onClose);
 const [query,setQuery]=useState('');
 onCloseRef.current=onClose;
 useEffect(()=>{
  const formerFocus=document.activeElement;
  const originalOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  closeRef.current?.focus();
  const keyDown=event=>{
   if(event.key==='Escape'){event.preventDefault();onCloseRef.current?.();return;}
   if(event.key!=='Tab')return;
   const nodes=Array.from(document.querySelectorAll(
    '[data-purchase-data-preview] button:not([disabled]), [data-purchase-data-preview] input:not([disabled])'
   ));
   const first=nodes[0],last=nodes[nodes.length-1];
   if(!first||!last)return;
   if(event.shiftKey&&document.activeElement===first){
    event.preventDefault();last.focus();
   }else if(!event.shiftKey&&document.activeElement===last){
    event.preventDefault();first.focus();
   }
  };
  document.addEventListener('keydown',keyDown);
  return ()=>{
   document.removeEventListener('keydown',keyDown);
   document.body.style.overflow=originalOverflow;
   formerFocus?.focus?.();
  };
 },[]);

 const rows=useMemo(()=>{
  const term=folded(query).trim();
  if(!term)return lines;
  return lines.filter(line=>folded([
   line.item_code,line.customer_alias,line.description,line.unit,
  ].join(' ')).includes(term));
 },[lines,query]);
 const number=kind==='quote'?source?.quote_number:source?.po_number;
 const title=(kind==='quote'?'Soumission':'Commande')+' '+(number||'');
 const total=Number.isFinite(Number(source?.total_amount))
  ?Number(source.total_amount)
  :lines.reduce((sum,row)=>sum+Number(row.amount||0),0);
 const description=kind==='quote'?
  'Montants et prix unitaires de la soumission fournisseur enregistrée.':
  'Articles et coûts provenant de la confirmation de commande enregistrée.';

 return createPortal(
  <div className="fixed inset-0 z-[110] flex flex-col bg-slate-950 text-slate-100"
   data-purchase-data-preview role="dialog" aria-modal="true"
   aria-labelledby="purchase-data-preview-title"
   style={{paddingTop:'env(safe-area-inset-top)',paddingBottom:'env(safe-area-inset-bottom)'}}>
   <header className="shrink-0 border-b border-slate-700 bg-slate-900 p-3 sm:p-4">
    <div className="flex items-start justify-between gap-3">
     <div className="min-w-0">
      <h2 id="purchase-data-preview-title"
       className="text-base font-semibold break-words">{title}</h2>
      <p className="text-xs text-slate-300 mt-1">
       {kind==='quote'?'Fournisseur : '+(source?.supplier||'Flocor'):
        'Fournisseur : '+(source?.supplier||'Non précisé')}
       {' · '}Chantier : {site?.name||'Non précisé'}
      </p>
     </div>
     <button type="button" ref={closeRef} onClick={onClose}
      aria-label="Fermer l’aperçu"
      className="min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-600 focus-visible:outline-2 focus-visible:outline-blue-400">
      <X size={20} aria-hidden="true"/>
     </button>
    </div>
   </header>
   <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
    <div className="mx-auto max-w-5xl space-y-4">
     <div className="rounded-lg border border-blue-700/70 bg-slate-900 p-3 flex items-start gap-2">
      <FileText size={20} className="shrink-0 text-blue-300" aria-hidden="true"/>
      <div>
       <p className="text-sm font-semibold">Aperçu des données enregistrées</p>
       <p className="text-xs text-slate-300 mt-1">
        Le PDF original n’est pas encore archivé. Voici les informations déjà
        enregistrées dans BuildTrack. Il ne s’agit pas d’une reproduction du PDF.
       </p>
      </div>
     </div>
     <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3 sm:grid-cols-3">
      <div>
       <p className="text-xs text-slate-400">Montant total HT</p>
       <p className="text-base font-semibold tabular-nums">{currency(total)}</p>
      </div>
      <div>
       <p className="text-xs text-slate-400">Lignes enregistrées</p>
       <p className="text-base font-semibold tabular-nums">{lines.length}</p>
      </div>
      <div className="col-span-2 sm:col-span-1">
       <p className="text-xs text-slate-400">Référence du document</p>
       <p className="text-sm font-semibold break-words">{number||'Non précisée'}</p>
      </div>
     </div>
     <p className="text-xs text-slate-300">{description}</p>
     <label className="relative block">
      <span className="sr-only">Rechercher un article dans le document</span>
      <Search size={17} aria-hidden="true"
       className="absolute left-3 top-3 text-slate-400"/>
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
       placeholder="Rechercher un code ou une description"
       className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 pl-10 pr-3 text-sm placeholder:text-slate-400"/>
     </label>
     <p role="status" className="text-xs text-slate-400">
      {rows.length} article(s) affiché(s)
     </p>
     <div className="hidden sm:block overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full min-w-[650px] text-left text-xs">
       <thead className="bg-slate-800 text-slate-300">
        <tr>
         <th scope="col" className="px-3 py-3">Référence et description</th>
         <th scope="col" className="px-2 py-3 text-right">Quantité</th>
         <th scope="col" className="px-2 py-3 text-right">Prix unitaire HT</th>
         <th scope="col" className="px-3 py-3 text-right">Total HT</th>
        </tr>
       </thead>
       <tbody>
        {rows.map((line,index)=><tr key={line.id||index}
         className="border-t border-slate-700/80 align-top">
         <th scope="row" className="px-3 py-3 font-normal">
          <span className="block font-semibold">{line.item_code||'Sans code'}</span>
          <span className="block text-slate-300 mt-1 break-words">{line.description}</span>
         </th>
         <td className="px-2 py-3 text-right whitespace-nowrap tabular-nums">
          {quantity(line.quantity)} {line.unit||''}
         </td>
         <td className="px-2 py-3 text-right whitespace-nowrap tabular-nums">
          {unitPrice(line.unit_cost)}
         </td>
         <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
          {currency(line.amount)}
         </td>
        </tr>)}
       </tbody>
      </table>
     </div>
     <div className="sm:hidden space-y-2">
      {rows.map((line,index)=><article key={line.id||index}
       className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
       <p className="font-semibold text-sm">{line.item_code||'Sans code'}</p>
       <p className="text-xs text-slate-300 break-words">{line.description}</p>
       <div className="grid grid-cols-2 gap-2 text-xs">
        <div><p className="text-slate-400">Quantité</p>
         <p className="tabular-nums">{quantity(line.quantity)} {line.unit||''}</p></div>
        <div><p className="text-slate-400">Prix unitaire HT</p>
         <p className="tabular-nums">{unitPrice(line.unit_cost)}</p></div>
       </div>
       <p className="text-sm text-right font-semibold tabular-nums">{currency(line.amount)} HT</p>
      </article>)}
     </div>
     {!rows.length&&<p className="py-8 text-center text-sm text-slate-300">
      Aucun article ne correspond à cette recherche.
     </p>}
    </div>
   </main>
  </div>,
  document.body
 );
}

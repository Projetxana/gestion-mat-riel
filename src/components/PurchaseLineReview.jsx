import React,{useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Check,Trash2} from 'lucide-react';
import {safeSupplierNumber} from '../utils/purchaseDocumentLines.js';

const asText=value=>value==null?'':String(value);
const prepare=lines=>(lines||[]).slice(0,300).map((line,index)=>({
 key:index,
 included:true,
 item_code:asText(line.item_code).trim(),
 description:asText(line.description).trim(),
 quantity:asText(line.quantity),
 unit:asText(line.unit).trim(),
 unit_cost:asText(line.unit_cost),
 amount:asText(line.amount),
 arithmetic_warning:line.arithmetic_warning===true,
}));

export const validateReviewedOrderRows = rows=>{
 const selected=rows.filter(row=>row.included);
 if(selected.length===0)throw new Error('Sélectionnez au moins un article.');
 return selected.map((row,i)=>{
  const quantity=safeSupplierNumber(row.quantity);
  const price=safeSupplierNumber(row.unit_cost);
  const amount=row.amount.trim()?safeSupplierNumber(row.amount):null;
  const code=String(row.item_code||'').trim();
  const description=String(row.description||'').trim();
  const unit=String(row.unit||'').trim().toUpperCase();
  if(!code||!description||!unit||!(quantity>0)||price===null||
      (row.amount.trim()&&amount===null))
   throw new Error('Ligne '+(i+1)+' : référence, quantité, unité, prix ou montant invalide.');
  const computed=Math.round(quantity*price*100)/100;
  // Inconsistent costs must be corrected or explicitly understood; no silent overrides.
  if(amount!==null&&Math.abs(computed-amount)>Math.max(.02,amount*.02))
    throw new Error('Ligne '+(i+1)+' : écart entre quantité × prix et montant. Corrigez la ligne.');
  return {item_code:code,description,quantity,unit,unit_cost:price,
   amount:amount===null?computed:amount};
 });
};

// Human review surface; no database writes and no automatic price or quantity acceptance.
export default function PurchaseLineReview({lines,sourceName,onAccept}){
 const [rows,setRows]=useState(()=>prepare(lines));
 const [confirmed,setConfirmed]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{setRows(prepare(lines));setConfirmed(false);setError('');},[lines,sourceName]);
 const included=useMemo(()=>rows.filter(x=>x.included).length,[rows]);
 const update=(key,field,value)=>{
  setRows(prev=>prev.map(row=>row.key===key?{...row,[field]:value}:row));
  setConfirmed(false);setError('');
 };
 const approve=()=>{
  setError('');
  if(!confirmed){setError('Confirmez la comparaison avec le document original.');return;}
  try{const verified=validateReviewedOrderRows(rows);
    onAccept(verified,sourceName);
  }catch(e){setError(e.message||'Articles invalides');}
 };
 return <section className="space-y-3 rounded-xl border border-blue-700 p-3" aria-label="Vérification des articles extraits">
  <div>
   <h4 className="font-semibold">Articles proposés · {included}/{rows.length}</h4>
   <p className="text-xs text-slate-300">Comparer chaque ligne au PDF original. Rien n’est ajouté au budget avant la validation finale de la commande.</p>
  </div>
  {rows.some(x=>x.arithmetic_warning)&&
   <p className="text-xs text-amber-300 flex items-center gap-2"><AlertTriangle size={16}/>
   Montants suspects détectés : vérifiez les calculs.</p>}
  <div className="max-h-[55vh] overflow-auto space-y-3">
   {rows.map((row,index)=><fieldset key={row.key}
       className={'rounded-lg border p-3 space-y-2 '+(row.included?'border-slate-700 bg-slate-800':'border-slate-800 opacity-60')}>
      <legend className="text-xs text-slate-300">Ligne {index+1}</legend>
      <label className="flex items-center gap-2 text-sm">
       <input type="checkbox" checked={row.included}
        onChange={e=>update(row.key,'included',e.target.checked)}/>
       Inclure dans la commande
      </label>
      {row.included&&<>
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[['item_code','Code produit'],['description','Description']].map(([field,label])=>
          <label key={field} className="text-xs text-slate-300">{label}
           <input value={row[field]} maxLength={field==='description'?500:100}
            onChange={e=>update(row.key,field,e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm"/>
          </label>)}
       </div>
       <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['quantity','Quantité'],['unit','Unité'],['unit_cost','Prix unitaire HT'],['amount','Montant HT']].map(([field,label])=>
         <label key={field} className="text-xs text-slate-300">{label}
          <input value={row[field]} inputMode={field==='unit'?'text':'decimal'}
           maxLength={field==='unit'?30:40} onChange={e=>update(row.key,field,e.target.value)}
           className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm"/>
         </label>)}
       </div>
      </>}
    </fieldset>)}
  </div>
  <label className="flex items-start gap-2 text-sm">
   <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>
   <span>J’ai comparé les articles, unités, quantités et prix proposés au document original.</span>
  </label>
  {error&&<p role="alert" className="text-red-300 text-xs">{error}</p>}
  <button type="button" onClick={approve} disabled={!confirmed||included===0}
   className="min-h-11 w-full rounded-lg bg-blue-700 px-3 font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
   <Check size={16}/> Utiliser les lignes vérifiées
  </button>
 </section>;
}

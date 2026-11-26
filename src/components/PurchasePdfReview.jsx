import React,{useEffect,useState} from 'react';
import {normalizeToken,parseDecimal} from '../utils/purchaseBudget';

export default function PurchasePdfReview({pending,site,order,onOrder,onChange,onCancel,busy}) {
 const [url,setUrl]=useState('');
 const {review,rows,originalFile}=pending;
 useEffect(()=>{if(!originalFile)return;const next=URL.createObjectURL(originalFile);setUrl(next);return()=>URL.revokeObjectURL(next);},[originalFile]);
 const change=(field,value)=>onChange(p=>({...p,review:{...p.review,[field]:value}}));
 const update=(index,field,value)=>onChange(p=>({...p,rows:p.rows.map((row,i)=>i===index?{...row,[field]:value}:row),review:{...p.review,confirmed:false}}));
 const total=rows.filter(r=>r.included!==false).reduce((s,r)=>s+(parseDecimal(r.amount)||0),0);
 const inputClass='min-h-11 w-full rounded border border-slate-600 bg-slate-950 p-2 text-white';
 return <div className="space-y-3 rounded-xl border border-amber-600 p-3 text-sm" aria-label="Vérification manuelle du PDF">
  <h3 className="font-bold text-amber-100">Vérifier et valider le document</h3>
  <p>{pending.sourceName} · Chantier : {site.name}</p>
  {url&&<details><summary className="cursor-pointer text-blue-200">Afficher le PDF original</summary><iframe title="PDF original" src={url} className="w-full h-96 bg-white"/><a href={url} target="_blank" rel="noreferrer" className="underline text-blue-200">Ouvrir le PDF dans un nouvel onglet</a></details>}
  <fieldset disabled={busy} className="space-y-3">
  {review.kind==='order'&&<><p>Confirmez qu’il s’agit bien d’une confirmation de commande, et non d’une soumission ou d’une facture.</p>
   <label className="block">Fournisseur<input className={inputClass} value={order.supplier} onChange={e=>{onOrder({...order,supplier:e.target.value});change('confirmed',false);}}/></label>
   <label className="block">Numéro PO du document<input className={inputClass} value={order.poNumber} onChange={e=>{onOrder({...order,poNumber:e.target.value});change('confirmed',false);}}/></label>
   <label className="block">Référence fournisseur<input className={inputClass} value={order.supplierNumber} onChange={e=>{onOrder({...order,supplierNumber:e.target.value});change('confirmed',false);}}/></label>
  </>}
  <p>Chantier détecté : {review.extractedProject||'Non détecté'}</p>
  {normalizeToken(review.extractedProject)!==normalizeToken(site.name)&&<label className="block">Confirmer le chantier destinataire en saisissant son nom exact<input className={inputClass} value={review.siteConfirmation} onChange={e=>change('siteConfirmation',e.target.value)} placeholder={site.name}/></label>}
  <div className="max-h-96 overflow-auto space-y-2">
  {rows.map((row,index)=><div key={index} className="border border-slate-600 rounded p-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
   <label className="col-span-2 sm:col-span-3"><input type="checkbox" checked={row.included!==false} onChange={e=>update(index,'included',e.target.checked)}/> Article {index+1} à inclure</label>
   {[['item_code','Code'],['description','Description'],['quantity','Quantité'],['unit','Unité'],['unit_cost','Prix unitaire'],['amount','Montant HT']].map(([key,label])=><label key={key}>{label}<input className={inputClass} value={row[key]??''} onChange={e=>update(index,key,e.target.value)}/></label>)}
  </div>)}
  </div>
  <button type="button" className="underline text-blue-200" onClick={()=>onChange(p=>({...p,rows:[...p.rows,{item_code:'',description:'',quantity:'',unit:'UN',unit_cost:'',amount:'',included:true}],review:{...p.review,confirmed:false}}))}>Compléter un article manquant du PDF</button>
  <p>Total des lignes : <strong>{total.toLocaleString('fr-CA',{style:'currency',currency:'CAD'})}</strong></p>
  <label className="block">Nombre exact de lignes retenues<input className={inputClass} inputMode="numeric" value={review.expectedCount} onChange={e=>change('expectedCount',e.target.value)}/></label>
  {review.printedMaterialTotal!=null?<p>Total HT détecté : {review.printedMaterialTotal.toLocaleString('fr-CA',{style:'currency',currency:'CAD'})}</p>:<><label className="block">Total HT imprimé dans le PDF<input className={inputClass} inputMode="decimal" value={review.enteredTotal} onChange={e=>change('enteredTotal',e.target.value)}/></label><label className="block"><input type="checkbox" checked={review.acceptMissingTotal} onChange={e=>change('acceptMissingTotal',e.target.checked)}/> Le PDF ne présente pas de total HT.</label></>}
  <label className="block"><input type="checkbox" checked={review.acceptDifference} onChange={e=>change('acceptDifference',e.target.checked)}/> Je confirme tout écart entre le total imprimé et les articles retenus.</label>
  <label className="block"><input type="checkbox" checked={review.confirmed} onChange={e=>change('confirmed',e.target.checked)}/> J’ai vérifié les informations, le type de document et toutes les lignes avec le PDF original.</label>
  <button type="button" onClick={onCancel} className="underline text-slate-300">Annuler la vérification</button>
  </fieldset>
 </div>;
}

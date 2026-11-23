import React,{useState} from 'react';
import {AlertTriangle,FileUp,ShieldCheck} from 'lucide-react';
import {supabase} from '../supabaseClient';
import {normalizeToken,parseDecimal} from '../utils/purchaseBudget';
import {assessDigitalPdf} from '../utils/pdfImportEvidence';
import {quoteImportDate,activeSupplierQuotes} from '../utils/supplierPriceWatch';
import {validateSupplierQuoteDraft} from '../utils/supplierPriceQuoteImport';

const money=value=>new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD'}).format(Number(value||0));

export default function SupplierPriceReferencePanel({site,companyId,quotes=[],enabled=true,onSaved}){
 const [pending,setPending]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [count,setCount]=useState('');
 const [siteConfirmation,setSiteConfirmation]=useState('');
 const [enteredTotal,setEnteredTotal]=useState('');
 const active=activeSupplierQuotes(quotes);
 const flocor=active.find(item=>normalizeToken(item.supplier)==='FLOCOR');
 const select=async file=>{
  if(!file||busy||!enabled)return;
  setError('');setSuccess('');setPending(null);setConfirmed(false);setCount('');
  setSiteConfirmation('');setEnteredTotal('');setBusy(true);
  try{
   if(!/\.pdf$/i.test(file.name))throw new Error('Sélectionnez la soumission Flocor en PDF numérique.');
   const {readDigitalPdf}=await import('../utils/digitalPdfReader');
   const doc=await readDigitalPdf(file);
   const parsed=assessDigitalPdf(doc,{kind:'budget',site,hasExistingBudget:false});
   if(parsed.document.parser_id!=='flocor-quotation-v1' ||
      parsed.document.document_type!=='supplier_quotation')
    throw new Error('Ce document n’est pas une soumission Flocor reconnue. Aucune donnée enregistrée.');
   if(!parsed.document.all_pages_processed||!doc.sha256)
    throw new Error('Toutes les pages de la soumission doivent être lisibles.');
   if(quotes.some(q=>q.file_sha256===doc.sha256))
    throw new Error('Ce document a déjà été enregistré pour ce chantier.');
   const source=parsed.hints?.suggested_lines||[];
   if(source.length===0)throw new Error('Aucun produit lisible. Vérifiez la qualité du PDF.');
   setPending({
    sourceName:file.name.slice(0,250),sha:doc.sha256,
    supplier:'Flocor',quoteNumber:parsed.hints.quote_number||'',
    quoteDate:quoteImportDate(parsed.hints.quotation_date),
    documentSite:parsed.hints.shipping_project_name||'',
    printedTotal:parsed.document.printed_material_total,
    sourceCount:parsed.document.source_line_count,
    issues:[...(parsed.evidence?.warnings||[])],
    rows:source.map(line=>({
     item_code:line.item_code||'',customer_alias:line.customer_alias||'',
     description:line.description||'',unit:line.unit||'UN',
     quantity:line.quantity??'',unit_cost:line.unit_cost??'',
     amount:line.amount??'',source_sequence:line.source_sequence??null,
    })),
   });
  }catch(e){setError(e?.message||'Import du PDF impossible.');}
  finally{setBusy(false);}
 };
 const updateLine=(index,key,value)=>{
  setConfirmed(false);
  setPending(previous=>previous?{...previous,rows:previous.rows.map((row,i)=>
   i===index?{...row,[key]:value}:row)}:previous);
 };
 const save=async()=>{
  if(!pending||busy||!enabled)return;
  setError('');setSuccess('');
  let verified;
  try{
   verified=validateSupplierQuoteDraft({
    rows:pending.rows,site,documentSite:pending.documentSite,
    siteConfirmation,expectedCount:count,printedTotal:pending.printedTotal,
    enteredTotal,quoteNumber:pending.quoteNumber,supplier:pending.supplier,confirmed,
   });
  }catch(e){setError(e.message);return;}
  if(!window.confirm('Enregistrer la soumission '+pending.quoteNumber+
   ' comme référence des prix fournisseurs pour « '+site.name+' » ?\n'+
   verified.rows.length+' articles · '+money(verified.amount)+
   ' HT.\nLe budget estimatif et les commandes existantes resteront inchangés.'))return;
  setBusy(true);
  try{
   const {error:rpcError}=await supabase.rpc('bt_supplier_price_register',{
    p_company_id:companyId,p_site_id:site.id,p_supplier:pending.supplier,
    p_quote_number:pending.quoteNumber,p_quote_date:pending.quoteDate,
    p_source_name:pending.sourceName,p_file_sha256:pending.sha,
    p_expected_total:verified.amount,p_lines:verified.rows,p_confirmed:true,
   });
   if(rpcError)throw rpcError;
   setPending(null);setCount('');setConfirmed(false);
   setSuccess('Soumission enregistrée comme référence de prix. Les commandes déjà saisies seront comparées.');
   await onSaved?.();
  }catch(e){setError(e?.code==='23505'?'Cette soumission est déjà importée.':
   e?.message||'Sauvegarde du référentiel impossible.');}
  finally{setBusy(false);}
 };
 const sum=pending?pending.rows.reduce((acc,row)=>acc+
  Math.round((parseDecimal(row.amount)||0)*100),0)/100:0;
 const projectMatches=pending&&normalizeToken(pending.documentSite)===normalizeToken(site.name);
 return <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 sm:p-4 space-y-3"
  aria-label="Prix de référence fournisseur">
  <div>
   <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldCheck size={17}/>
    Soumission fournisseur · Prix de référence</h3>
   <p className="text-xs text-slate-400 mt-1">
    Prix unitaires convenus, séparés de l’estimation et des commandes engagées.
    Un nouveau PDF ajoute une version datée; les anciennes restent conservées.
   </p>
  </div>
  {flocor&&<div className="rounded-lg border border-emerald-700 bg-emerald-950/20 p-3 text-sm">
   <p className="font-semibold text-emerald-200">
    Flocor · Soumission nº {flocor.quote_number}</p>
   <p className="text-xs text-slate-300">
    {flocor.line_count} lignes · {money(flocor.total_amount)} HT ·
    {flocor.quote_date?' '+flocor.quote_date+' ·':''} référence active
   </p>
  </div>}
  {!enabled&&<p role="status" className="text-amber-200 text-sm">
   Référentiel de prix non encore activé sur Supabase. Migration nécessaire avant import.
  </p>}
  <label className={'flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blue-600 px-3 text-sm font-medium '+
   (enabled?'cursor-pointer text-blue-100':'opacity-50 text-slate-400')}>
   <FileUp size={17}/> Importer une soumission Flocor (PDF)
   <input type="file" accept=".pdf,application/pdf" className="sr-only"
    disabled={!enabled||busy||site.status!=='active'}
    onChange={e=>{void select(e.target.files?.[0]);e.target.value='';}}/>
  </label>
  {pending&&<div className="space-y-3 rounded-lg border border-blue-700 p-3 text-sm">
   <h4 className="font-semibold break-words">{pending.sourceName} · Soumission {pending.quoteNumber||'à confirmer'}</h4>
   <div className="grid grid-cols-2 gap-2 text-xs">
    <p>Articles détectés : <strong>{pending.rows.length}</strong></p>
    <p>Sous-total calculé : <strong>{money(sum)}</strong></p>
    <p>Lignes sources : <strong>{pending.sourceCount||'Non confirmé'}</strong></p>
    <p>Total imprimé : <strong>{pending.printedTotal===null?'Non reconnu':money(pending.printedTotal)}</strong></p>
   </div>
   {pending.issues.length>0&&<div role="alert" className="text-amber-200 text-xs">
    {pending.issues.map((issue,i)=><p key={i}><AlertTriangle size={13} className="inline mr-1"/>{issue}</p>)}
   </div>}
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    <label className="text-xs text-slate-300">Fournisseur
     <input type="text" value={pending.supplier}
      onChange={e=>{setConfirmed(false);setPending(p=>({...p,supplier:e.target.value}));}}
      className="mt-1 w-full min-h-10 rounded-md bg-slate-950 border border-slate-600 p-2"/>
    </label>
    <label className="text-xs text-slate-300">Numéro de soumission
     <input type="text" value={pending.quoteNumber}
      onChange={e=>{setConfirmed(false);setPending(p=>({...p,quoteNumber:e.target.value}));}}
      className="mt-1 w-full min-h-10 rounded-md bg-slate-950 border border-slate-600 p-2"/>
    </label>
   </div>
   {!projectMatches&&<label className="text-xs block text-amber-200">
    Le PDF indique « {pending.documentSite||'projet non reconnu'} ».
    Pour importer sur {site.name}, recopiez son nom :
    <input type="text" value={siteConfirmation} onChange={e=>setSiteConfirmation(e.target.value)}
     placeholder={site.name} className="mt-1 w-full min-h-11 rounded-md bg-slate-950 border border-amber-600 p-2"/>
   </label>}
   <details className="rounded-md border border-slate-700 p-2">
    <summary className="cursor-pointer min-h-11 text-sm font-semibold">
     Vérifier ou corriger les {pending.rows.length} lignes de prix</summary>
    <div className="max-h-96 overflow-y-auto space-y-2">
     {pending.rows.map((row,i)=><div key={i} className="rounded-md bg-slate-800 p-2 space-y-2">
      <p className="text-xs font-semibold">Article {i+1}</p>
      <div className="grid grid-cols-2 gap-2">
       {[['item_code','Référence Flocor'],['customer_alias','Code client (facultatif)'],
         ['description','Description']].map(([key,title])=>
        <label key={key} className={'text-xs text-slate-300 '+(key==='description'?'col-span-2':'')}>
         {title}<input type="text" value={row[key]}
          onChange={e=>updateLine(i,key,e.target.value)}
          className="mt-1 w-full min-h-10 rounded-md bg-slate-950 border border-slate-600 p-2"/>
        </label>)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
       {[['quantity','Qté'],['unit','Unité'],['unit_cost','Prix HT/unité'],['amount','Total HT']].map(([key,title])=>
        <label key={key} className="text-xs text-slate-300">{title}
         <input type="text" inputMode={key==='unit'?'text':'decimal'}
          value={row[key]} onChange={e=>updateLine(i,key,e.target.value)}
          className="mt-1 w-full min-h-10 rounded-md bg-slate-950 border border-slate-600 p-2"/>
        </label>)}
      </div>
     </div>)}
    </div>
    <button type="button" onClick={()=>{setConfirmed(false);setPending(p=>({...p,rows:[...p.rows,{
      item_code:'',customer_alias:'',description:'',unit:'UN',quantity:'',
      unit_cost:'',amount:'',source_sequence:null}]}));}}
     className="mt-2 min-h-10 rounded-md border border-blue-600 px-3 text-xs">Ajouter une ligne manquante</button>
   </details>
   <label className="block text-xs text-slate-300">Nombre exact d’articles vérifiés sur le PDF
    <input type="number" min="1" step="1" value={count} onChange={e=>setCount(e.target.value)}
     placeholder="Ex. : 80" className="mt-1 w-full min-h-11 rounded-md border border-slate-600 bg-slate-950 p-2"/>
   </label>
   {pending.printedTotal===null&&<label className="block text-xs text-slate-300">
    Sous-total HT lu sur le PDF
    <input type="text" inputMode="decimal" value={enteredTotal}
     onChange={e=>setEnteredTotal(e.target.value)}
     className="mt-1 w-full min-h-11 rounded-md border border-slate-600 bg-slate-950 p-2"/>
   </label>}
   <label className="flex gap-2 items-start text-xs">
    <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
    J’ai vérifié que les références, unités, prix et montants correspondent à la soumission originale,
    et que cette liste contient tous les produits à surveiller.
   </label>
   <button type="button" onClick={()=>void save()} disabled={!confirmed||busy}
    className="min-h-11 w-full rounded-lg bg-blue-600 px-3 font-semibold disabled:opacity-50">
    {busy?'Enregistrement…':'Activer ces prix de référence'}
   </button>
  </div>}
  {error&&<p role="alert" className="text-sm text-red-200">{error}</p>}
  {success&&<p role="status" className="text-sm text-emerald-200">{success}</p>}
 </section>;
}

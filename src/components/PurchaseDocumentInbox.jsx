import React,{useCallback,useEffect,useState} from 'react';
import {FileSearch,Mail,FileText} from 'lucide-react';
import {supabase} from '../supabaseClient';
import PurchaseLineReview from './PurchaseLineReview';
import {normalizeToken} from '../utils/purchaseBudget.js';

// All detected fields are untrusted suggestions, never auto-booked.
export default function PurchaseDocumentInbox({site,companyId,onUseDraft}) {
 const [docs,setDocs]=useState([]);
 const [token,setToken]=useState('');
 const [draft,setDraft]=useState(null);
 const [reviewingDocId,setReviewingDocId]=useState('');
 const [uploadKind,setUploadKind]=useState('order');
 const [projectOverride,setProjectOverride]=useState('');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  if(!site?.id||!companyId)return;
  setLoading(true);setError('');
  const [a,d]=await Promise.all([
   supabase.from('bt_purchase_inbox_aliases').select('alias_token').eq('company_id',companyId).eq('site_id',site.id).maybeSingle(),
   supabase.from('bt_purchase_documents').select('id,po_hint,shipping_project_hint,original_filename,storage_path,created_at,line_candidates,line_warnings')
    .eq('company_id',companyId).eq('site_id',site.id).order('created_at',{ascending:false}).limit(100)
  ]);
  if(a.error||d.error)setError('Boîte documentaire indisponible : vérifiez la migration MVP3.');
  else {setToken(a.data?.alias_token||'');setDocs(d.data||[]);}
  setLoading(false);
 },[site?.id,companyId]);
 useEffect(()=>{void load();},[load]);
 const generateAlias=async()=>{
  setLoading(true);setError('');setNotice('');
  const {data,error:e}=await supabase.rpc('bt_purchase_get_inbox_alias',{p_company_id:companyId,p_site_id:site.id});
  if(e)setError(e.message);
  else {setToken(data);setNotice('Adresse réservée; la réception reste inactive tant que Cloudflare n’est pas configuré.');}
  setLoading(false);
 };
 const analyze=async file=>{
  if(!file)return;
  setDraft(null);setError('');setProjectOverride('');
  if(file.size>7*1024*1024||!/\.(pdf|jpg|jpeg|png|webp)$/i.test(file.name)){
   setError('PDF ou image de 7 Mo maximum requis.');return;
  }
  setLoading(true);
  const form=new FormData();
  form.append('file',file);form.append('company_id',String(companyId));
  form.append('site_id',String(site.id));form.append('kind',uploadKind);
  const {data,error:e}=await supabase.functions.invoke('bt-analyze-purchase-document',{body:form});
  if(e||!data||data.error)setError('Analyse indisponible : vérifiez les paramètres du Worker et son budget IA.');
  else setDraft(data);
  setLoading(false);
 };
 const openOriginal=async doc=>{
  setError('');
  const {data,error:e}=await supabase.storage.from('bt-purchase-private').createSignedUrl(doc.storage_path,60);
  if(e||!data?.signedUrl){setError('Accès au document privé refusé.');return;}
  const link=document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';
  document.body.appendChild(link);link.click();link.remove();
 };
 const projectAccepted=source=>{
  const actual=normalizeToken(source?.shipping_project_name||source?.shipping_project_hint);
  const expected=normalizeToken(site?.name);
  return (actual.length>=3&&expected.length>=3&&actual===expected) ||
    projectOverride.trim().toLocaleLowerCase('fr-CA')===String(site?.name||'').trim().toLocaleLowerCase('fr-CA');
 };
 const projectReview=source=>projectAccepted(source)?null:(
  <label className="block text-xs text-amber-200">Chantier absent ou différent. Vérifiez le document, puis retapez le nom du chantier sélectionné : {site.name}
   <input type="text" value={projectOverride} onChange={e=>setProjectOverride(e.target.value)}
     placeholder={site.name} className="mt-1 min-h-11 w-full rounded-lg border border-amber-600 bg-slate-900 p-2 text-sm text-white"/>
  </label>
 );
 const useHint=(source,filename,verifiedLines=null)=>{
  if(!projectAccepted(source)){setError('Vérification du chantier obligatoire.');return;}
  onUseDraft({poNumber:source.po_number||source.po_hint||'',
   shippingProject:source.shipping_project_name||source.shipping_project_hint||'',
   supplierNumber:source.supplier_order_number||'',sourceName:filename,
   lines:verifiedLines,kind:source.kind||'order'});
  setNotice('Champs proposés. Vérifiez le PDF avant d’enregistrer une commande.');
 };
 const address=token?'commandes+'+token+'@'+(import.meta.env.VITE_PURCHASE_INBOX_DOMAIN||'achats.buildtrackapp.ca'):'';
 return <div className="space-y-4">
  <section className="rounded-lg border border-slate-700 p-3 space-y-2">
   <h3 className="font-semibold flex items-center gap-2"><Mail size={17}/> Adresse de réception du chantier</h3>
   {address?<><code className="block text-xs break-all text-blue-200">{address}</code>
    <button type="button" onClick={()=>void navigator.clipboard?.writeText(address)}
     className="min-h-11 rounded-lg border border-slate-600 px-3">Copier l’adresse</button>
    <p className="text-xs text-amber-200">Ne pas transmettre aux fournisseurs avant activation d’Email Routing Cloudflare.</p>
   </>:<button type="button" disabled={loading} onClick={generateAlias}
     className="min-h-11 rounded-lg bg-blue-700 px-4 font-semibold disabled:opacity-50">Générer l’adresse</button>}
  </section>
  <section className="rounded-lg border border-slate-700 p-3 space-y-2">
   <h3 className="font-semibold flex items-center gap-2"><FileSearch size={17}/> Lecture PDF / photo</h3>
   <p className="text-xs text-slate-300">Propositions du PO, du chantier et des articles. Rien ne sera enregistré sans vérification.</p>
   <label className="block text-sm text-slate-300">Type de document
    <select value={uploadKind} disabled={loading}
      onChange={e=>{setUploadKind(e.target.value);setDraft(null);setProjectOverride('');}}
      className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3">
     <option value="order">Confirmation de commande</option>
     <option value="budget">Liste d’estimation / budget initial</option>
    </select>
   </label>
   <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-600 p-3 text-sm text-blue-200">
    {loading?'Analyse…':'Choisir un document'}
    <input className="sr-only" disabled={loading} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
      onChange={e=>{void analyze(e.target.files?.[0]);e.target.value='';}}/>
   </label>
   {draft&&<div className="rounded-lg border border-blue-700 p-3 text-sm space-y-2">
    {draft.kind!=='budget'&&<p>PO détecté : <strong>{draft.po_number||'Non détecté'}</strong></p>}
    <p>Chantier lu : <strong>{draft.shipping_project_name||'Non détecté'}</strong></p>
    <p className={draft.proposed_project_match==='candidate'?'text-green-300':'text-amber-300'}>
     {draft.proposed_project_match==='candidate'?'Nom cohérent (à vérifier)':'Chantier différent ou inconnu : vérifier'}
    </p>
    {projectReview(draft)}
    <details><summary className="cursor-pointer">Afficher le texte lu</summary>
     <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{draft.text_excerpt}</pre></details>
    {draft.line_warnings?.length>0&&(
      <ul className="text-xs text-amber-200 list-disc pl-5">
       {draft.line_warnings.map((warning,index)=><li key={index}>{warning}</li>)}
      </ul>
    )}
    {draft.suggested_lines?.length>0?(
      <PurchaseLineReview lines={draft.suggested_lines} sourceName={draft.origin_filename}
       disabled={!projectAccepted(draft)}
       onAccept={(lines)=>useHint(draft,draft.origin_filename,lines)}/>
    ):(
      <button type="button" onClick={()=>useHint(draft,draft.origin_filename)}
       disabled={!projectAccepted(draft)}
       className="min-h-11 w-full rounded-lg bg-blue-700 disabled:opacity-50">Préremplir le PO (articles à importer séparément)</button>
    )}
   </div>}
  </section>
  <section className="space-y-2">
   <h3 className="font-semibold flex items-center gap-2"><FileText size={17}/> Confirmations reçues ({docs.length})</h3>
   <button type="button" onClick={()=>void load()} disabled={loading}
    className="min-h-11 rounded-lg border border-slate-600 px-3">Actualiser la boîte</button>
   {!docs.length&&<p className="text-sm text-slate-400">Aucun document reçu.</p>}
   {docs.map(doc=><article key={doc.id} className="rounded-lg bg-slate-800 p-3 space-y-2">
    <p className="font-semibold text-sm break-words">{doc.original_filename}</p>
    <p className="text-xs">PO : {doc.po_hint||'Inconnu'} · Chantier : {doc.shipping_project_hint||'Inconnu'}</p>
    <p className="text-xs text-slate-400">En attente de validation · {new Date(doc.created_at).toLocaleString('fr-CA')}</p>
    <div className="flex flex-wrap gap-2">
     <button type="button" onClick={()=>void openOriginal(doc)} className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm">Voir le PDF privé</button>
     <button type="button" onClick={()=>{setProjectOverride('');setReviewingDocId(prev=>prev===doc.id?'':doc.id);}}
       className="min-h-11 rounded-lg bg-blue-700 px-3 text-sm">Vérifier la commande</button>
    </div>
    {reviewingDocId===doc.id&&(
     <div className="space-y-2">
      {projectReview(doc)}
      {(doc.line_candidates||[]).length>0?(
       <PurchaseLineReview lines={doc.line_candidates} sourceName={doc.original_filename}
        disabled={!projectAccepted(doc)}
        onAccept={(lines)=>useHint(doc,doc.original_filename,lines)}/>
      ):(
       <div className="rounded-lg border border-amber-700 p-3 text-xs space-y-2">
        <p>Aucun tableau exploitable détecté : importer les lignes depuis Excel/CSV après avoir vérifié le PDF.</p>
        <button type="button" className="min-h-11 rounded-lg bg-blue-700 px-3 disabled:opacity-50"
         disabled={!projectAccepted(doc)} onClick={()=>useHint(doc,doc.original_filename)}>
         Préremplir le PO seulement
        </button>
       </div>)
      }
     </div>
    )}
   </article>)}
  </section>
  {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-300">{notice}</p>}
 </div>;
}

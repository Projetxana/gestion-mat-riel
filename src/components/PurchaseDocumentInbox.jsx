import React,{useCallback,useEffect,useState} from 'react';
import {FileSearch,Mail,FileText} from 'lucide-react';
import {supabase} from '../supabaseClient';

// All detected fields are untrusted suggestions, never auto-booked.
export default function PurchaseDocumentInbox({site,companyId,onUseDraft}) {
 const [docs,setDocs]=useState([]);
 const [token,setToken]=useState('');
 const [draft,setDraft]=useState(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  if(!site?.id||!companyId)return;
  setLoading(true);setError('');
  const [a,d]=await Promise.all([
   supabase.from('bt_purchase_inbox_aliases').select('alias_token').eq('company_id',companyId).eq('site_id',site.id).maybeSingle(),
   supabase.from('bt_purchase_documents').select('id,po_hint,shipping_project_hint,original_filename,storage_path,created_at')
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
  setDraft(null);setError('');
  if(file.size>7*1024*1024||!/\.(pdf|jpg|jpeg|png|webp)$/i.test(file.name)){
   setError('PDF ou image de 7 Mo maximum requis.');return;
  }
  setLoading(true);
  const form=new FormData();
  form.append('file',file);form.append('company_id',String(companyId));
  form.append('site_id',String(site.id));form.append('kind','order');
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
 const useHint=(source,filename)=>{
  onUseDraft({poNumber:source.po_number||source.po_hint||'',
   shippingProject:source.shipping_project_name||source.shipping_project_hint||'',
   supplierNumber:source.supplier_order_number||'',sourceName:filename});
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
   <p className="text-xs text-slate-300">Extraction du PO et du chantier. Aucun prix ni quantité enregistré automatiquement.</p>
   <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-600 p-3 text-sm text-blue-200">
    {loading?'Analyse…':'Choisir un document'}
    <input className="sr-only" disabled={loading} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
      onChange={e=>{void analyze(e.target.files?.[0]);e.target.value='';}}/>
   </label>
   {draft&&<div className="rounded-lg border border-blue-700 p-3 text-sm space-y-2">
    <p>PO détecté : <strong>{draft.po_number||'Non détecté'}</strong></p>
    <p>Chantier lu : <strong>{draft.shipping_project_name||'Non détecté'}</strong></p>
    <p className={draft.proposed_project_match==='candidate'?'text-green-300':'text-amber-300'}>
     {draft.proposed_project_match==='candidate'?'Nom cohérent (à vérifier)':'Chantier différent ou inconnu : vérifier'}
    </p>
    <details><summary className="cursor-pointer">Afficher le texte lu</summary>
     <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{draft.text_excerpt}</pre></details>
    <button type="button" onClick={()=>useHint(draft,draft.origin_filename)}
     className="min-h-11 w-full rounded-lg bg-blue-700">Préremplir une commande à valider</button>
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
     <button type="button" onClick={()=>useHint(doc,doc.original_filename)} className="min-h-11 rounded-lg bg-blue-700 px-3 text-sm">Vérifier la commande</button>
    </div>
   </article>)}
  </section>
  {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-300">{notice}</p>}
 </div>;
}

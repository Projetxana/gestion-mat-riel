import React,{useRef,useState} from 'react';
import {FileUp,FileText,LoaderCircle} from 'lucide-react';
import {archivePurchasePdf} from '../utils/purchasePdfArchive';
import PurchasePdfPreview from './PurchasePdfPreview';
import PurchaseDataPreview from './PurchaseDataPreview';

// One click opens the original when present; otherwise attaches the original
// once, after matching it to the existing quote / PO. No accounting writes.
export default function PurchasePdfCard({
 kind,source,site,companyId,documentRecord,onAttached,children,className='',detailLines=[],canAttach=true,
}){
 const picker=useRef(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [previewOpen,setPreviewOpen]=useState(false);
 const hasOriginal=Boolean(documentRecord?.storage_path);
 const action=hasOriginal?'Afficher l’aperçu du PDF original':'Consulter les informations enregistrées';
 const handleClick=()=>{
  setError('');setNotice('');
  setPreviewOpen(true);
 };
 const upload=async file=>{
  if(!file||busy||!source?.id)return;
  setError('');setNotice('');setBusy(true);
  try{
   await archivePurchasePdf(file,{kind,source,site,companyId});
   setNotice('PDF original archivé dans le stockage privé.');
   await onAttached?.();
  }catch(e){setError(e?.message||'Archivage impossible.');}
  finally{setBusy(false);}
 };
 return <div className="space-y-1">
  <button type="button" onClick={handleClick}
   disabled={busy||!source?.id}
   aria-label={action+' : '+(kind==='quote'?
    'soumission '+(source?.quote_number||''):
    'commande '+(source?.po_number||''))}
   className={'w-full text-left rounded-lg border border-slate-700 p-3 transition-colors hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50 '+className}>
   <div className="flex items-start justify-between gap-3">
    <div className="flex-1 min-w-0">{children}</div>
    {busy?<LoaderCircle size={17} className="shrink-0 animate-spin" aria-hidden="true"/>:
     hasOriginal?<FileText size={17} className="shrink-0 text-emerald-300" aria-hidden="true"/>:
     <FileUp size={17} className="shrink-0 text-blue-300" aria-hidden="true"/>}
   </div>
   <p className={'mt-2 text-xs font-medium '+(hasOriginal?'text-emerald-300':'text-blue-200')}>
    {busy?'Archivage en cours…':hasOriginal?'Voir l’aperçu du PDF original':'Voir les détails enregistrés'}
   </p>
  </button>
  {!hasOriginal&&canAttach&&<button type="button" onClick={()=>picker.current?.click()}
   disabled={busy||!source?.id}
   className="min-h-10 rounded-md px-2 text-xs font-medium text-blue-200 hover:underline disabled:opacity-50"
   aria-label={'Joindre le PDF original (facultatif) : '+(source?.quote_number||source?.po_number||'document')}>
   Joindre le PDF original (facultatif)
  </button>}
  <input ref={picker} className="sr-only" type="file" accept=".pdf,application/pdf"
   aria-label={'Sélectionner le PDF original : '+(source?.quote_number||source?.po_number||'document')}
   disabled={busy||hasOriginal||!canAttach}
   onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(file);}}/>
  {error&&<p role="alert" className="text-xs text-red-200">{error}</p>}
  {notice&&<p role="status" className="text-xs text-emerald-200">{notice}</p>}
  {previewOpen&&(hasOriginal?<PurchasePdfPreview
   record={documentRecord}
   title={kind==='quote'?'Soumission '+(source?.quote_number||''):
    'Commande '+(source?.po_number||'')}
   onClose={()=>setPreviewOpen(false)}
  />:<PurchaseDataPreview
   kind={kind} source={source} site={site} lines={detailLines}
   onClose={()=>setPreviewOpen(false)}
  />)}
 </div>;
}

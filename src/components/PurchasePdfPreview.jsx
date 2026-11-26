import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft,ChevronRight,LoaderCircle,ZoomIn,ZoomOut,X} from 'lucide-react';
import {fetchPrivatePurchasePdf} from '../utils/purchasePdfArchive';

// In-app, read-only PDF.js canvas preview. No links, download buttons or new tabs.
// PDF pages are rendered on demand to keep memory use bounded on mobile devices.
export default function PurchasePdfPreview({record,title,onClose,loadBytes}){
 const closeRef=useRef(null);
 const viewportRef=useRef(null);
 const canvasRef=useRef(null);
 const pdfRef=useRef(null);
 const renderTaskRef=useRef(null);
 const closeHandlerRef=useRef(onClose);
 closeHandlerRef.current=onClose;

 const [status,setStatus]=useState('loading');
 const [error,setError]=useState('');
 const [page,setPage]=useState(1);
 const [pages,setPages]=useState(0);
 const [zoom,setZoom]=useState(1);
 const [availableWidth,setAvailableWidth]=useState(320);
 const [rendering,setRendering]=useState(false);

 useEffect(()=>{
  const previousFocus=document.activeElement;
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  closeRef.current?.focus();
  const onKeyDown=event=>{
   if(event.key==='Escape'){
    event.preventDefault();
    closeHandlerRef.current?.();
   }
   if(event.key==='Tab'){
    const elements=Array.from(document.querySelectorAll(
     '[data-purchase-pdf-dialog] button:not([disabled])'
    ));
    if(!elements.length)return;
    const first=elements[0],last=elements[elements.length-1];
    if(event.shiftKey&&document.activeElement===first){
     event.preventDefault();last.focus();
    }else if(!event.shiftKey&&document.activeElement===last){
     event.preventDefault();first.focus();
    }
   }
  };
  document.addEventListener('keydown',onKeyDown);
  return ()=>{
   document.removeEventListener('keydown',onKeyDown);
   document.body.style.overflow=oldOverflow;
   previousFocus?.focus?.();
  };
 },[]);

 useEffect(()=>{
  const node=viewportRef.current;
  if(!node)return;
  const measure=()=>setAvailableWidth(Math.max(240,node.clientWidth-24));
  measure();
  if(typeof ResizeObserver==='undefined'){
   window.addEventListener('resize',measure);
   return ()=>window.removeEventListener('resize',measure);
  }
  const observer=new ResizeObserver(measure);
  observer.observe(node);
  return ()=>observer.disconnect();
 },[]);

 useEffect(()=>{
  let disposed=false,loadingTask=null;
  setStatus('loading');setError('');setPage(1);setPages(0);setZoom(1);
  const load=async()=>{
   const bytes=await (loadBytes ? loadBytes() : fetchPrivatePurchasePdf(record));
   if(disposed)return;
   const [{getDocument,GlobalWorkerOptions},{default:workerSrc}]=await Promise.all([
    import('pdfjs-dist/build/pdf.mjs'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
   ]);
   if(disposed)return;
   GlobalWorkerOptions.workerSrc=workerSrc;
   loadingTask=getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true});
   const pdf=await loadingTask.promise;
   if(disposed){await loadingTask.destroy();return;}
   if(pdf.numPages<1||pdf.numPages>200)
    throw new Error('Le document est trop volumineux pour cet aperçu.');
   pdfRef.current=pdf;
   setPages(pdf.numPages);
   setStatus('ready');
  };
  void load().catch(e=>{
   if(disposed)return;
   setError(e?.message||'Le document ne peut pas être affiché.');
   setStatus('error');
  });
  return ()=>{
   disposed=true;
   renderTaskRef.current?.cancel();
   renderTaskRef.current=null;
   pdfRef.current=null;
   if(loadingTask)void loadingTask.destroy().catch(()=>{});
  };
 },[record?.storage_path,loadBytes]);

 useEffect(()=>{
  if(status!=='ready'||!pdfRef.current||!canvasRef.current)return;
  let disposed=false,task=null;
  const draw=async()=>{
   const pdf=pdfRef.current;
   const pageProxy=await pdf.getPage(page);
   if(disposed)return;
   const base=pageProxy.getViewport({scale:1});
   const fit=Math.max(0.2,Math.min(2.2,(availableWidth-16)/base.width));
   const canvasScale=fit*zoom;
   const visual=pageProxy.getViewport({scale:canvasScale});
   // Limit actual backing pixels to avoid Safari/iPhone canvas memory crashes.
   const maxPixels=6000000;
   const dpr=Math.max(0.5,Math.min(2,window.devicePixelRatio||1,
    Math.sqrt(maxPixels/(visual.width*visual.height))));
   const canvas=canvasRef.current;
   if(!canvas)return;
   const previous=renderTaskRef.current;
   if(previous){
    previous.cancel();
    try{await previous.promise;}catch{}
   }
   if(disposed)return;
   const output=pageProxy.getViewport({scale:canvasScale*dpr});
   canvas.width=Math.ceil(output.width);
   canvas.height=Math.ceil(output.height);
   canvas.style.width=visual.width+'px';
   canvas.style.height=visual.height+'px';
   const context=canvas.getContext('2d',{alpha:false});
   if(!context)throw new Error('L’aperçu graphique n’est pas pris en charge.');
   task=pageProxy.render({canvas,canvasContext:context,viewport:output});
   renderTaskRef.current=task;
   setRendering(true);
   await task.promise;
   if(!disposed)setRendering(false);
  };
  void draw().catch(e=>{
   if(!disposed&&e?.name!=='RenderingCancelledException'){
    setError('Page impossible à afficher : '+(e?.message||'erreur de rendu'));
    setRendering(false);
   }
  });
  return ()=>{
   disposed=true;
   task?.cancel();
  };
 },[status,page,zoom,availableWidth]);

 const movePage=next=>{
  setPage(value=>Math.max(1,Math.min(pages,next(value))));
  if(viewportRef.current){
   viewportRef.current.scrollTop=0;
   viewportRef.current.scrollLeft=0;
  }
 };
 const zoomBy=delta=>setZoom(value=>Math.max(0.5,Math.min(2,Math.round((value+delta)*100)/100)));
 const heading=title||'Document PDF original';

 return createPortal(
  <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 text-slate-100"
   role="dialog" aria-modal="true" aria-labelledby="purchase-pdf-preview-title"
   data-purchase-pdf-dialog
   style={{paddingTop:'env(safe-area-inset-top)',paddingBottom:'env(safe-area-inset-bottom)'}}>
   <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-3 py-3 sm:px-5">
    <div className="min-w-0">
     <h2 id="purchase-pdf-preview-title" className="truncate text-sm sm:text-base font-semibold">
      {heading}
     </h2>
     <p className="text-xs text-slate-400">Aperçu privé dans BuildTrack · Lecture seule</p>
    </div>
    <button type="button" ref={closeRef} onClick={onClose}
     aria-label="Fermer l’aperçu PDF"
     className="shrink-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-blue-400">
     <X size={20} aria-hidden="true"/>
    </button>
   </header>
   {status==='ready'&&<nav className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-slate-700 bg-slate-900/90 px-2 py-2"
    aria-label="Navigation dans le document">
    <button type="button" aria-label="Page précédente"
     onClick={()=>movePage(n=>n-1)} disabled={page<=1}
     className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 disabled:opacity-40">
     <ChevronLeft size={20} aria-hidden="true"/>
    </button>
    <span className="min-w-[94px] text-center text-sm tabular-nums" aria-live="polite">
     Page {page} / {pages}
    </span>
    <button type="button" aria-label="Page suivante"
     onClick={()=>movePage(n=>n+1)} disabled={page>=pages}
     className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 disabled:opacity-40">
     <ChevronRight size={20} aria-hidden="true"/>
    </button>
    <span className="mx-1 h-6 border-l border-slate-700" aria-hidden="true"/>
    <button type="button" aria-label="Réduire le zoom"
     onClick={()=>zoomBy(-0.25)} disabled={zoom<=0.5}
     className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 disabled:opacity-40">
     <ZoomOut size={19} aria-hidden="true"/>
    </button>
    <span className="min-w-[48px] text-center text-xs tabular-nums">{Math.round(zoom*100)} %</span>
    <button type="button" aria-label="Agrandir le zoom"
     onClick={()=>zoomBy(0.25)} disabled={zoom>=2}
     className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 disabled:opacity-40">
     <ZoomIn size={19} aria-hidden="true"/>
    </button>
   </nav>}
   <main ref={viewportRef} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-800 px-3 py-4 sm:p-6"
    aria-label="Aperçu de la page PDF">
    {status==='loading'&&<div role="status" className="flex items-center justify-center gap-3 py-20 text-sm text-slate-200">
     <LoaderCircle className="animate-spin" size={22} aria-hidden="true"/> Préparation de l’aperçu…
    </div>}
    {status==='error'&&<p role="alert" className="mx-auto max-w-lg rounded-lg border border-red-700 p-4 text-sm text-red-200">
     {error||'Le PDF ne peut pas être affiché.'}
    </p>}
    {status==='ready'&&<div className="mx-auto w-fit max-w-none">
     <canvas ref={canvasRef} role="img"
      aria-label={'Page '+page+' sur '+pages+' du document '+heading}
      className="block rounded bg-white shadow-xl"/>
     {rendering&&<p className="pt-2 text-center text-xs text-slate-400" role="status">Affichage de la page…</p>}
     {error&&<p role="alert" className="pt-2 text-center text-sm text-red-200">{error}</p>}
    </div>}
   </main>
  </div>,
  document.body
 );
}

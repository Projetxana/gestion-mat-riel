import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, PackageCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { normalizePurchaseOrder } from '../utils/purchaseBudget';
import { deliveryReviewPayload, summarizeDeliveries } from '../utils/deliveryReconciliation';

export default function DeliveryReviewPanel({ site, currentCompanyId, orders, orderLines }) {
    const [notes, setNotes] = useState([]);
    const [deliveryLines, setDeliveryLines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [selectedNoteId, setSelectedNoteId] = useState('');
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [poRead, setPoRead] = useState('');
    const [supplierSlipNumber, setSupplierSlipNumber] = useState('');
    const [reviewRows, setReviewRows] = useState({});
    const [confirmed, setConfirmed] = useState(false);
    const [ocrBusy, setOcrBusy] = useState(false);
    const [ocrHint, setOcrHint] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const reload = useCallback(async () => {
        if (!site?.id || !currentCompanyId) return;
        setLoading(true);
        setError('');
        const notesResult = await supabase.from('bt_purchase_delivery_notes')
            .select('id,company_id,site_id,order_id,po_number,supplier,status,source_bucket,attachment_paths,created_at,verified_at')
            .eq('company_id', currentCompanyId).eq('site_id',site.id)
            .order('created_at',{ascending:false});
        const linesResult = await supabase.from('bt_purchase_delivery_lines')
            .select('id,delivery_id,order_id,order_line_id,shipped_qty,supplier_bo_qty')
            .eq('company_id',currentCompanyId).eq('site_id',site.id);
        if (notesResult.error || linesResult.error) {
            setError(notesResult.error?.code === '42P01' || linesResult.error?.code === '42P01'
                ? 'Le schéma de réception des bons n’est pas encore installé.'
                : 'Chargement des bons impossible : ' + (notesResult.error?.message || linesResult.error?.message));
        } else {
            setNotes(notesResult.data || []);
            setDeliveryLines(linesResult.data || []);
        }
        setLoading(false);
    }, [site?.id,currentCompanyId]);
    useEffect(() => { void reload(); }, [reload,refreshKey]);

    const selectedNote = notes.find(note => note.id === selectedNoteId && note.status === 'pending_review');
    const selectedOrder = orders.find(order => String(order.id) === selectedOrderId);
    const currentOrderLines = orderLines.filter(line => String(line.order_id) === selectedOrderId);
    const poValid = selectedOrder && normalizePurchaseOrder(poRead) &&
        normalizePurchaseOrder(poRead) === normalizePurchaseOrder(selectedOrder.po_number);
    const summary = useMemo(() => summarizeDeliveries(orderLines,notes,deliveryLines),
        [orderLines,notes,deliveryLines]);
    const pending = notes.filter(note => note.status === 'pending_review');
    const mailWarnings = notes.filter(note => note.status === 'sending' || note.status === 'send_failed');
    const supplierBoCount = summary.filter(line => line.status === 'supplier_bo').length;
    const remainingCount = summary.filter(line => line.remainingQty > 0).length;

    const viewAttachments = async note => {
        if(note?.source_bucket!=='bt-delivery-private') {
            setError('Ancien bon : consultez le courriel archivé à la comptabilité.');
            return;
        }
        const paths=note.attachment_paths||[];
        if(!paths.length) {setError('Aucune photo associée.');return;}
        setError('');
        for(const path of paths){
            const {data,error:e}=await supabase.storage.from('bt-delivery-private')
                .createSignedUrl(path,60);
            if(e||!data?.signedUrl){setError('Accès à la photo refusé.');return;}
            const link=document.createElement('a');
            link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';
            document.body.appendChild(link);link.click();link.remove();
        }
    };
    const analyzeNote = async note => {
        setOcrHint(null);
        if (!note || note.source_bucket !== 'bt-delivery-private' || !note.attachment_paths?.length) {
            setError('Le bon privé n’est pas disponible pour analyse.'); return;
        }
        setOcrBusy(true);setError('');
        try {
            const {data:blob,error:downloadError}=await supabase.storage
                .from('bt-delivery-private').download(note.attachment_paths[0]);
            if(downloadError||!blob)throw new Error('Photo indisponible');
            const file=new File([blob],'bon_livraison.jpg',{type:'image/jpeg'});
            const form=new FormData();form.append('file',file);
            form.append('company_id',String(currentCompanyId));
            form.append('site_id',String(site.id));form.append('kind','delivery');
            const {data,error:rpcError}=await supabase.functions.invoke(
                'bt-analyze-purchase-document',{body:form});
            if(rpcError||!data||data.error)throw new Error('Extraction non disponible');
            setOcrHint(data);
            if(data.po_number && data.proposed_project_match==='candidate')
                setPoRead(data.po_number);
            setConfirmed(false);
        }catch(err){setError('Analyse de photo impossible : '+(err.message||'réessayez plus tard'));}
        finally{setOcrBusy(false);}
    };
    const chooseNote = id => {
        setSelectedNoteId(id);
        setSelectedOrderId('');
        setPoRead('');
        setSupplierSlipNumber('');
        setReviewRows({});
        setConfirmed(false);setOcrHint(null);
        setError('');setNotice('');
    };
    const updateLine = (id, field, value) => {
        setReviewRows(prev => ({...prev,[String(id)]:{...prev[String(id)],[field]:value}}));
        setConfirmed(false);
    };
    const verify = async () => {
        if (busy || !selectedNote || !selectedOrder || !poValid || !confirmed) {
            setError('Vérifiez le numéro de PO du bon, la commande sélectionnée et les quantités.');
            return;
        }
        try {
            const entries = currentOrderLines
                .filter(line => {
                    const row = reviewRows[String(line.id)] || {};
                    return row.shipped !== undefined && row.shipped !== '' ||
                        row.bo !== undefined && row.bo !== '';
                })
                .map(line => {
                    const row = reviewRows[String(line.id)] || {};
                    return { order_line_id: line.id,
                        shipped_qty: row.shipped === '' || row.shipped === undefined ? 0 : row.shipped,
                        supplier_bo_qty: row.bo === '' || row.bo === undefined ? null : row.bo };
                });
            const payload = deliveryReviewPayload(entries);
            setBusy(true);setError('');setNotice('');
            const {error: rpcError} = await supabase.rpc('bt_purchase_verify_delivery',{
                p_company_id:currentCompanyId,
                p_delivery_id:selectedNote.id,
                p_order_id:selectedOrder.id,
                p_supplier_note_number:supplierSlipNumber.trim(),
                p_lines:payload,
            });
            if (rpcError) throw rpcError;
            setNotice('Bon vérifié. Les quantités reçues et les BO sont mis à jour sans modifier le budget.');
            setSelectedNoteId('');setSelectedOrderId('');setReviewRows({});
            setRefreshKey(value => value+1);
        } catch (err) {
            setError(err.code === '23514'
                ? 'Vérification refusée : commande incohérente, bon déjà traité ou quantité totale supérieure à la commande.'
                : err.message || 'Validation du bon impossible.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4 text-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold">Réceptions / BO</h3>
                    <p className="text-xs text-slate-400">
                        L’employé scanne, la comptabilité reçoit le courriel, puis l’administrateur vérifie les quantités.
                    </p>
                </div>
                <button type="button" disabled={loading || busy}
                    onClick={() => setRefreshKey(v=>v+1)}
                    className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm flex items-center gap-2 disabled:opacity-50">
                    <RefreshCw size={16}/> Actualiser
                </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                    ['Bons à vérifier',pending.length],
                    ['Lignes à recevoir',remainingCount],
                    ['BO fournisseur',supplierBoCount],
                ].map(([label,value]) => (
                    <div key={label} className="rounded-lg bg-slate-800 p-3">
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="text-lg font-semibold tabular-nums">{value}</p>
                    </div>
                ))}
            </div>
            {loading && <p role="status" className="text-sm text-blue-200">Chargement des livraisons…</p>}
            {error && <p role="alert" className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
            {notice && <p role="status" className="rounded-lg border border-green-700 bg-green-950/30 p-3 text-sm text-green-200">{notice}</p>}
            {mailWarnings.length>0 && (
              <p role="alert" className="text-sm text-amber-300">
                {mailWarnings.length} envoi(s) de bon non confirmé(s) : vérifier auprès de la comptabilité avant toute nouvelle transmission.
              </p>
            )}
            <div>
                <h4 className="text-sm font-semibold mb-2">Bons envoyés en attente de rapprochement</h4>
                {pending.length === 0 && <p className="text-xs text-slate-400">Aucun bon à vérifier.</p>}
                <div className="space-y-2">
                    {pending.map(note => (
                        <button type="button" key={note.id} onClick={()=>chooseNote(note.id)}
                            aria-pressed={selectedNoteId === note.id}
                            className={`block min-h-11 w-full rounded-lg border p-3 text-left text-sm ${selectedNoteId === note.id ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 bg-slate-800'}`}>
                            <span className="flex items-center gap-2"><ClipboardCheck size={16}/>
                                Scan du {new Date(note.created_at).toLocaleString('fr-CA')} · À vérifier
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {selectedNote && (
                <div className="rounded-xl border border-blue-700/60 bg-slate-900 p-3 space-y-3">
                    <h4 className="font-semibold">Vérification du bon sélectionné</h4>
                    <button type="button" onClick={()=>void viewAttachments(selectedNote)}
                      className="min-h-11 rounded-lg border border-blue-700 px-3 text-sm text-blue-200">
                      Ouvrir les photos originales (liens temporaires)
                    </button>
                    <button type="button" onClick={()=>void analyzeNote(selectedNote)} disabled={ocrBusy}
                      className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-blue-200 disabled:opacity-50">
                      {ocrBusy ? 'Lecture de la photo…' : 'Reconnaître le PO sur la photo'}
                    </button>
                    {ocrHint && (
                      <div className="rounded-lg border border-blue-600 p-3 text-xs space-y-1">
                        <p>PO proposé : <strong>{ocrHint.po_number || 'Non détecté'}</strong></p>
                        <p>Chantier lu : <strong>{ocrHint.shipping_project_name || 'Non détecté'}</strong></p>
                        <p className={ocrHint.proposed_project_match==='candidate'?'text-green-300':'text-amber-300'}>
                          {ocrHint.proposed_project_match==='candidate'
                            ? 'Chantier cohérent à vérifier' : 'Nom de chantier absent ou différent : vérifier manuellement'}
                        </p>
                        <p>Aucune quantité n’est validée automatiquement.</p>
                      </div>
                    )}
                    <p className="text-xs text-amber-200 flex items-start gap-2">
                        <AlertTriangle size={15} className="shrink-0"/>
                        Comparez avec les photos originales et le courriel comptable. Les champs détectés automatiquement devront être validés avant toute réception.
                    </p>
                    <label className="block text-sm">Numéro de PO lu sur le bon
                        <input type="text" value={poRead} onChange={e=>{setPoRead(e.target.value);setConfirmed(false);}}
                            placeholder="Ex. P02281" maxLength={100} autoCapitalize="characters"
                            className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-800 px-3"/>
                    </label>
                    <label className="block text-sm">Commande du chantier
                        <select value={selectedOrderId} onChange={e=>{setSelectedOrderId(e.target.value);setReviewRows({});setConfirmed(false);}}
                            className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-800 px-3">
                            <option value="">Sélectionner la commande…</option>
                            {orders.map(order => <option key={order.id} value={order.id}>
                                {order.supplier} · PO {order.po_number}
                            </option>)}
                        </select>
                    </label>
                    {selectedOrder && !poValid &&
                        <p role="alert" className="text-xs text-amber-300">Le PO saisi ne correspond pas à la commande choisie.</p>}
                    <label className="block text-sm">Numéro du bon fournisseur (si indiqué)
                        <input type="text" maxLength={100} value={supplierSlipNumber}
                            onChange={e=>setSupplierSlipNumber(e.target.value)}
                            className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-800 px-3"/>
                    </label>
                    {selectedOrder && poValid && (
                        <>
                            <div className="max-h-[45vh] overflow-auto space-y-2" aria-label="Articles de la commande">
                                {currentOrderLines.map(line => {
                                    const row=reviewRows[String(line.id)] || {};
                                    return (
                                        <div key={line.id} className="rounded-lg border border-slate-700 bg-slate-800 p-2 space-y-1">
                                            <p className="text-sm font-medium break-words">{line.item_code} {line.description}</p>
                                            <p className="text-xs text-slate-400">Commandé : {line.quantity} {line.unit}</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="text-xs">Livré sur ce bon
                                                    <input inputMode="decimal" type="number" min="0" step=".001"
                                                        value={row.shipped ?? ''} onChange={e=>updateLine(line.id,'shipped',e.target.value)}
                                                        placeholder="—" className="mt-1 min-h-11 w-full rounded-lg bg-slate-900 border border-slate-600 p-2"/>
                                                </label>
                                                <label className="text-xs">BO indiqué par le fournisseur
                                                    <input inputMode="decimal" type="number" min="0" step=".001"
                                                        value={row.bo ?? ''} onChange={e=>updateLine(line.id,'bo',e.target.value)}
                                                        placeholder="Non indiqué" className="mt-1 min-h-11 w-full rounded-lg bg-slate-900 border border-slate-600 p-2"/>
                                                </label>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <label className="flex items-start gap-2 text-sm">
                                <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>
                                <span>J’ai vérifié le chantier, le PO et les quantités sur le bon original. Aucun prix ne sera modifié.</span>
                            </label>
                            <button type="button" onClick={verify} disabled={!confirmed || busy}
                                className="min-h-11 w-full rounded-lg bg-blue-600 px-3 font-semibold disabled:opacity-50">
                                {busy ? 'Validation…' : 'Valider les quantités reçues'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {orders.length > 0 && (
                <details className="rounded-xl border border-slate-700 p-3">
                    <summary className="min-h-11 cursor-pointer font-semibold flex items-center gap-2">
                        <PackageCheck size={17}/> Synthèse par commande
                    </summary>
                    {orders.map(order => {
                        const lines=summary.filter(line=>String(line.orderId)===String(order.id));
                        const missing=lines.filter(line=>line.remainingQty>0);
                        const bo=lines.filter(line=>line.status==='supplier_bo');
                        return (
                            <div key={order.id} className="border-t border-slate-700 pt-3 mt-3 text-sm">
                                <p className="font-semibold">{order.supplier} · PO {order.po_number}</p>
                                <p className="text-xs text-slate-400">{missing.length} ligne(s) restant à livrer · {bo.length} BO fournisseur</p>
                                <div className="space-y-1 mt-2">
                                    {lines.map(line => (
                                        <div key={line.orderLineId} className="flex flex-wrap justify-between gap-2 text-xs py-1">
                                            <span className="min-w-0 break-words flex-1">{line.name}</span>
                                            <span className="tabular-nums">{line.receivedQty}/{line.orderedQty} {line.unit}</span>
                                            <span className={line.status==='supplier_bo'?'text-amber-300':'text-slate-400'}>
                                                {line.status==='complete'?'Complet':line.status==='supplier_bo'? 'BO fournisseur : '+line.supplierBoQty:'Reste : '+line.remainingQty}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </details>
            )}
        </div>
    );
}

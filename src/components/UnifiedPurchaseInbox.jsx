import React, { useEffect, useRef, useState } from 'react';
import { planPurchaseBatch, summarizePurchaseBatch } from '../utils/unifiedPurchaseBatch';
import { readDigitalPdf } from '../utils/digitalPdfReader';
import { fetchUnifiedPurchasePdf } from '../utils/unifiedPurchaseCommit';
import PurchasePdfPreview from './PurchasePdfPreview';

const labels = {
    ready: 'Prêt', confirm: 'Confirmation requise', review: 'À vérifier',
    blocked: 'Bloqué', duplicate: 'Doublon ignoré', non_financial: 'Sans engagement financier',
    imported: 'Enregistré', failed: 'Échec',
};
const kinds = {
    quotation: 'Soumission', estimate: 'Estimation', order: 'Confirmation', credit: 'Avoir',
    invoice: 'Facture', delivery: 'Bon de livraison', unknown: 'Document inconnu',
};
const issues = {
    confirm_site:'Vérifiez le chantier de livraison.', choose_revision:'Choisissez l’effet sur le budget.',
    coverage:'Certaines lignes sont manquantes ou illisibles.', subtotal:'Le sous-total imprimé diffère de la somme des articles.',
    arithmetic:'Le calcul de certaines lignes est incohérent.', amount:'Le calcul d’une ligne est incohérent.',
    sign:'Une quantité ou un montant a un signe incorrect.', missing_reference:'La référence fournisseur est introuvable.',
    missing_po:'Le PO est introuvable.', unknown_format:'Le format du fournisseur est inconnu.',
    read_failed:'Le PDF est illisible ou scanné.', same_pdf:'PDF identique déjà détecté.',
    reference_conflict:'Cette référence existe avec un autre fichier. Vérifiez la version du fournisseur.',
    unverified_credit:'Les valeurs de l’avoir ne concordent pas.', incomplete_pdf:'Certaines pages sont illisibles.',
    invalid_row:'Un article est incomplet.', missing_rows:'Aucun article exploitable.',
    file_changed:'Le PDF reçu diffère de celui sélectionné.', rows:'Des lignes contiennent des champs incomplets.',
    exception:'L’extraction comporte des écarts. Comparez le sous-total et les articles avec le PDF.',
    po:'Le PO est introuvable.', supplier:'Le fournisseur est introuvable.',
    total:'Le sous-total imprimé est introuvable ou incohérent.',
    unsupported_currency:'La devise du document ne peut pas être comptabilisée en dollars canadiens.',
};
const money = value => new Intl.NumberFormat('fr-CA', { style:'currency', currency:'CAD' }).format(value);
const control = 'min-h-11 rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-50';

export default function UnifiedPurchaseInbox({ site, commitDocument, history, pending, onSaved }) {
    const [entries, setEntries] = useState([]);
    const [progress, setProgress] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState(null);
    const lock = useRef(false);
    const generation = useRef(0);
    const input = useRef(null);
    const scope = JSON.stringify([site.company_id, site.id]);
    useEffect(() => {
        generation.current++;
        setEntries([]);
        setPreview(null);
        setError('');
        setProgress(null);
        return () => { generation.current++; };
    }, [scope]);
    const active = site.status === 'active';
    const update = entry => setEntries(previous => previous.map(current => current.id === entry.id ? entry : current));

    async function persist(entry, run) {
        try {
            const result = await commitDocument({ entry, site, choice: entry.choice });
            if (!['imported','duplicate','confirm','review'].includes(result?.status)) {
                throw new Error('Enregistrement non confirmé.');
            }
            const next = {
                ...entry, error:null, receiptId:result.receiptId || entry.receiptId,
                budgetState:result.budgetState || entry.budgetState,
                choice:result.budgetState && result.budgetState !== entry.budgetState
                    ? { ...entry.choice, revisionKind:'' } : entry.choice,
                plan:{
                    ...entry.plan, status:result.status, project:result.project ?? entry.plan.project,
                    issues:result.issues || [], total:result.total ?? entry.plan.total,
                },
            };
            if (run === generation.current) update(next);
            return result.status === 'imported';
        } catch (err) {
            if (run === generation.current) {
                update({ ...entry, receiptId:null, error:err.message, plan:{ ...entry.plan, status:'failed' } });
            }
            return false;
        }
    }

    async function runBatch(files, selected) {
        if (!active || lock.current || (!selected && !files?.length)) return;
        lock.current = true;
        setBusy(true);
        setError('');
        const run = generation.current;
        try {
            let batch = selected;
            if (!batch) {
                setPreview(null);
                const analyzed = await planPurchaseBatch(files, {
                    readPdf:readDigitalPdf, context:{ site },
                    onProgress:p => { if (run === generation.current) setProgress({ phase:'Analyse', ...p }); },
                });
                if (run !== generation.current) return;
                batch = analyzed.map(entry => ({ ...entry, id:crypto.randomUUID(), choice:{} }));
                setEntries(previous => [...batch, ...previous]);
            }
            let changed = false;
            for (const [index, entry] of batch.entries()) {
                if (run !== generation.current) break;
                setProgress({ phase:'Enregistrement', completed:index + 1, total:batch.length });
                if (['ready','confirm','non_financial','failed'].includes(entry.plan.status)) {
                    changed = await persist(entry, run) || changed;
                }
            }
            if (changed && run === generation.current) await onSaved();
        } catch (err) {
            if (run === generation.current) setError(err.message || 'Le lot n’a pas pu être traité.');
        } finally {
            lock.current = false;
            setBusy(false);
            setProgress(null);
        }
    }

    const summary = summarizePurchaseBatch(entries);
    const resumable = pending.filter(item => !entries.some(entry => entry.id === item.document_id));
    const resume = item => {
        const entry = {
            id:item.document_id, name:item.file_name, storage_path:item.storage_path, choice:{},
            plan:{ kind:item.kind, status:'failed', project:item.project, sha256:item.file_sha256 },
        };
        setEntries(previous => [entry, ...previous]);
        void runBatch(null, [entry]);
    };
    return <section className="space-y-3 rounded-xl border border-slate-700 p-4" aria-label="Importation des achats">
        <h3 className="font-semibold">Déposer les PDF fournisseurs</h3>
        <p className="text-sm text-slate-300">Jusqu’à 30 PDF. Les documents vérifiés sont enregistrés automatiquement.</p>
        <div className="rounded-lg border border-dashed border-blue-500 p-3"
            onDragOver={event => event.preventDefault()}
            onDrop={event => { event.preventDefault(); void runBatch(Array.from(event.dataTransfer.files)); }}>
            <input ref={input} type="file" multiple accept=".pdf,application/pdf" className="hidden"
                onChange={event => { const files = Array.from(event.target.files); event.target.value = ''; void runBatch(files); }} />
            <button type="button" disabled={!active || busy} className={control + ' w-full bg-blue-950'}
                onClick={() => input.current?.click()}>Sélectionner les PDF</button>
        </div>
        {progress && <p role="status">{progress.phase} · {progress.completed}/{progress.total}</p>}
        {error && <p role="alert" className="text-red-200">{error}</p>}
        {entries.length > 0 && <div role="status" className="text-sm">
            {Object.entries(summary.counts).filter(([, count]) => count > 0).map(([status,count]) =>
                <span key={status} className="mr-3">{count} {labels[status].toLowerCase()}</span>)}
            <p>Variation des engagements de cette session · {money(summary.netImported)} HT</p>
        </div>}
        {entries.filter(entry => entry.plan.status !== 'imported').map(entry => {
            const { plan, choice } = entry;
            const siteChoice = plan.issues?.includes('confirm_site');
            const budgetChoice = plan.issues?.includes('choose_revision');
            const choose = patch => update({ ...entry, choice:{ ...choice, ...patch } });
            return <article key={entry.id} className="space-y-2 rounded-lg border border-slate-700 p-3 text-sm">
                <strong className="break-all">{entry.name}</strong>
                <p>{kinds[plan.kind]} · {labels[plan.status]}{plan.po && ' · PO ' + plan.po}</p>
                {Number.isFinite(plan.total) && <p>{money(plan.total)} HT</p>}
                {plan.issues?.length > 0 && <p className="text-amber-200">
                    {plan.issues.map(issue => issues[issue] || 'Vérifiez les données de ce PDF.').join(' ')}
                </p>}
                {entry.error && <p role="alert" className="text-red-200">{entry.error}</p>}
                <button type="button" className={control} onClick={() => setPreview({ title:entry.name,
                    loadBytes:async () => entry.file ? new Uint8Array(await entry.file.arrayBuffer()) : fetchUnifiedPurchasePdf(entry) })}>Voir le PDF</button>
                {plan.status === 'confirm' && <div className="space-y-2">
                    {siteChoice && <label className="flex items-start gap-2">
                        <input type="checkbox" checked={Boolean(choice.confirmSite)}
                            onChange={event => choose({ confirmSite:event.target.checked })} />
                        <span>Confirmer {site.name} pour « {plan.project || 'chantier absent du PDF'} ».</span>
                    </label>}
                    {budgetChoice && <label className="block">Action sur le budget
                        <select className={control + ' block w-full bg-slate-900'} value={choice.revisionKind || ''}
                            onChange={event => choose({ revisionKind:event.target.value })}>
                            <option value="">Choisir</option>
                            <option value="replacement">Remplacer le budget de base</option>
                            <option value="extension">Ajouter une liste complémentaire</option>
                            {plan.kind === 'quotation' && <>
                                <option value="price_only">Actualiser seulement les prix de référence</option>
                                <option value="recovered">Rattacher la soumission au budget historique identique</option>
                            </>}
                        </select>
                    </label>}
                    <button type="button" className={control + ' bg-blue-700'}
                        disabled={busy || (siteChoice && !choice.confirmSite) || (budgetChoice && !choice.revisionKind)}
                        onClick={() => void runBatch(null, [entry])}>Confirmer et importer</button>
                </div>}
                {plan.status === 'failed' && <button type="button" disabled={busy} className={control}
                    onClick={() => void runBatch(null, [entry])}>Réessayer</button>}
            </article>;
        })}
        {resumable.length > 0 && <details className="space-y-2">
            <summary className="cursor-pointer font-semibold">Documents à reprendre ({resumable.length})</summary>
            {resumable.map(item => <div key={item.document_id} className="flex flex-wrap justify-between gap-2 text-sm">
                <p className="break-all">{item.file_name}</p>
                <button type="button" className={control} disabled={busy || !active} onClick={() => resume(item)}>Reprendre</button>
            </div>)}
        </details>}
        {history.length > 0 && <details className="space-y-2">
            <summary className="cursor-pointer font-semibold">Historique des imports ({history.length})</summary>
            {history.map(document => <div key={document.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-700 py-2 text-sm">
                <p className="break-all">{document.file_name} · {kinds[document.kind]}{document.total != null && ' · ' + money(Number(document.total))}</p>
                <button type="button" className={control}
                    onClick={() => setPreview({ title:document.file_name, loadBytes:() => fetchUnifiedPurchasePdf(document) })}>Voir le PDF original</button>
            </div>)}
        </details>}
        {preview && <PurchasePdfPreview title={preview.title} loadBytes={preview.loadBytes} onClose={() => setPreview(null)} />}
    </section>;
}

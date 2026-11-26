import UnifiedPurchaseInbox from './UnifiedPurchaseInbox';
import { commitUnifiedPurchase } from '../utils/unifiedPurchaseCommit';
import { activeUnifiedPriceReferences } from '../utils/unifiedPriceComparison';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Package, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { calculatePurchaseBudget, comparePurchaseItems, parsePurchaseRows, shippingProjectVerification, normalizeToken } from '../utils/purchaseBudget';
import { extractFlocorCredit, groupPurchaseDocuments, isPurchaseCredit } from '../utils/purchaseDocumentIdentity';
import PurchasePdfReview from './PurchasePdfReview';
import {preparePurchaseReview,validatePurchaseReview} from '../utils/purchasePdfReview';
import { assessDigitalPdf } from '../utils/pdfImportEvidence';
import PurchaseLineReconciliation from './PurchaseLineReconciliation';
import PurchaseBudgetRevisions from './PurchaseBudgetRevisions';
import PurchaseItemsOverview from './PurchaseItemsOverview';
import SupplierPriceReferencePanel from './SupplierPriceReferencePanel';
import SupplierPriceAlertsPanel from './SupplierPriceAlertsPanel';
import PurchasePdfCard from './PurchasePdfCard';
import { purchaseQueryPages } from '../utils/purchaseQueryPages';
import { importPurchasePdf } from '../utils/purchasePdfArchive';
import {compareSupplierPrices,activeSupplierQuotes} from '../utils/supplierPriceWatch';

const money = number => new Intl.NumberFormat('fr-CA', {
    style: 'currency', currency: 'CAD', minimumFractionDigits: 2,
}).format(Number(number || 0));

const emptyOrder = { supplier: '', poNumber: '', supplierNumber: '', shippingProject: '', date: '' };

const readSheet = async file => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
        throw new Error('Format accepté : Excel (.xlsx/.xls) ou CSV. Les PDF seront intégrés dans la prochaine étape.');
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('Fichier trop volumineux (5 Mo maximum).');
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const first = book.Sheets[book.SheetNames[0]];
    if (!first) throw new Error('Feuille Excel introuvable.');
    const raw = XLSX.utils.sheet_to_json(first, { defval: '', raw: false });
    return raw.filter(row => Object.values(row).some(value => String(value).trim() !== ''));
};

const downloadTemplate = () => {
    const csv = '\uFEFFCode;Description;Quantite;Unite;Prix unitaire;Montant\r\nART00429;Té CPVC 1 po;40;UN;3,80;152,00\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'buildtrack-modele-achats.csv';
    link.click();
    URL.revokeObjectURL(url);
};

export default function PurchaseBudgetPanel({ site, onPurchasesChanged }) {
    const { currentCompanyId, currentUser, companyRoleLoading } = useAppContext();
    const isAdmin = !companyRoleLoading && currentUser?.role === 'admin';
    const isCorrectTenant = String(site?.company_id) === String(currentCompanyId);
    const [budget, setBudget] = useState(null);
    const [budgetLines, setBudgetLines] = useState([]);
    const [budgetRevisions, setBudgetRevisions] = useState([]);
    const [orders, setOrders] = useState([]);
    const [orderLines, setOrderLines] = useState([]);
    const [purchaseLinks, setPurchaseLinks] = useState([]);
    const [linkingEnabled, setLinkingEnabled] = useState(true);
    const [tab, setTab] = useState('budget');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [pendingBudget, setPendingBudget] = useState(null);
    const [pendingOrder, setPendingOrder] = useState(null);
    const [order, setOrder] = useState(emptyOrder);
    const [reloadIndex, setReloadIndex] = useState(0);
    const [pdfIssues, setPdfIssues] = useState([]);
    const [priceQuotes,setPriceQuotes] = useState([]);
    const [priceQuoteLines,setPriceQuoteLines] = useState([]);
    const [priceLinks,setPriceLinks] = useState([]);
    const [priceReferenceEnabled,setPriceReferenceEnabled] = useState(true);
    const [priceRiskAcknowledged,setPriceRiskAcknowledged] = useState(false);
    const [purchaseDocuments,setPurchaseDocuments] = useState([]);
    const [archiveEnabled,setArchiveEnabled] = useState(false);
    const [inboxHistory,setInboxHistory] = useState(null);
    const unified = Boolean(inboxHistory);
    const [inboxPending,setInboxPending] = useState([]);

    const refresh = useCallback(async () => {
        if (!site?.id || !currentCompanyId || !isAdmin || !isCorrectTenant) return;
        setLoading(true);
        setError('');
        try {
            const conditions = ['company_id', 'site_id'];
            const selectProject = (table, cols) =>
                supabase.from(table).select(cols).eq(conditions[0], currentCompanyId).eq(conditions[1], site.id);
            const [budgetResult, budgetItemsResult, revisionResult, ordersResult, itemsResult, linkResult,
                quotesResult, quoteLinesResult, priceLinksResult,documentsResult,inboxResult,pendingResult] = await Promise.all([
                selectProject('bt_purchase_budgets', 'id, source_name, created_at').maybeSingle(),
                purchaseQueryPages(supabase.rpc('bt_purchase_effective_budget_lines', {
                    p_company_id:currentCompanyId,p_site_id:site.id
                }).order('id')),
                selectProject('bt_purchase_budget_revisions',
                    'id, revision_no, kind, label, source_name, file_sha256, line_count, total_amount, created_at')
                    .order('revision_no', { ascending: false }),
                purchaseQueryPages(selectProject('bt_purchase_orders', 'id, po_number, supplier, supplier_order_number, document_kind, shipping_project_name, created_at, order_date').order('created_at', { ascending: false }).order('id')),
                purchaseQueryPages(selectProject('bt_purchase_order_lines', 'id, order_id, description, item_code, quantity, unit, unit_cost, amount').order('id')),
                purchaseQueryPages(selectProject('bt_purchase_line_links', 'order_line_id, budget_line_id, disposition').order('order_line_id')),
                selectProject('bt_supplier_price_quotes',
                    'id, supplier, quote_number, quote_date, source_name, file_sha256, line_count, total_amount, created_at')
                    .order('created_at', { ascending: false }),
                selectProject('bt_supplier_price_lines',
                    'id, quote_id, item_code, customer_alias, description, unit, quantity, unit_cost, amount'),
                selectProject('bt_supplier_price_line_links', 'order_line_id, quote_line_id'),
                purchaseQueryPages(selectProject('bt_purchase_documents',
                    'id, source_kind, source_id, file_name, storage_path, uploaded_at').order('id')),
                purchaseQueryPages(selectProject('bt_purchase_inbox',
                    'id, company_id, site_id, file_name, storage_path, kind, status, budget_mode, revision_id, quote_id, supplier, total, created_at')
                    .order('created_at', { ascending:false }).order('id')),
                purchaseQueryPages(supabase.rpc('bt_purchase_v2_pending', {
                    p_company_id:currentCompanyId,p_site_id:site.id,
                }).order('document_id')),
            ]);
            const failure = [budgetResult, budgetItemsResult, revisionResult, ordersResult, itemsResult].find(result => result.error);
            if (failure) throw failure.error;
            setBudget(budgetResult.data);
            setBudgetLines(budgetItemsResult.data || []);
            setBudgetRevisions(revisionResult.data || []);
            setOrders(ordersResult.data || []);
            setOrderLines(itemsResult.data || []);
            setPurchaseLinks(linkResult.error ? [] : (linkResult.data || []));
            setLinkingEnabled(!linkResult.error);
            const pricesAvailable=!quotesResult.error&&!quoteLinesResult.error&&!priceLinksResult.error;
            setPriceReferenceEnabled(pricesAvailable);
            setPriceQuotes(pricesAvailable?(quotesResult.data||[]):[]);
            setPriceQuoteLines(pricesAvailable?(quoteLinesResult.data||[]):[]);
            setPriceLinks(pricesAvailable?(priceLinksResult.data||[]):[]);
            setArchiveEnabled(!documentsResult.error);
            setInboxHistory(inboxResult.error ? null : (inboxResult.data || []));
            setInboxPending(pendingResult.error ? [] : (pendingResult.data || []));
            setPurchaseDocuments(documentsResult.error?[]:(documentsResult.data||[]));
        } catch (e) {
            setError(e.code === '42P01'
                ? 'Les tables du module Achats ne sont pas encore activées dans Supabase.'
                : 'Chargement des achats impossible : ' + (e.message || 'erreur réseau'));
        } finally {
            setLoading(false);
        }
    }, [site?.id, currentCompanyId, isAdmin, isCorrectTenant]);

    useEffect(() => { void refresh(); }, [refresh, reloadIndex]);

    const activeReferences = useMemo(() => unified
        ? activeUnifiedPriceReferences({ site, history:inboxHistory, revisions:budgetRevisions, quotes:priceQuotes, quoteLines:priceQuoteLines })
        : { quotes:priceQuotes, quoteLines:priceQuoteLines },
    [site, unified, inboxHistory, budgetRevisions, priceQuotes, priceQuoteLines]);
    const quoteArchive = useMemo(() => [
        ...purchaseDocuments,
        ...(inboxHistory || []).filter(document => document.quote_id).map(document => ({
            ...document, source_kind:'quote', source_id:document.quote_id,
        })),
    ], [purchaseDocuments, inboxHistory]);
    const totals = useMemo(() => calculatePurchaseBudget(budgetLines, orderLines), [budgetLines, orderLines]);
    const shippingCheck = shippingProjectVerification(order.shippingProject, site?.name, pendingOrder?.siteConfirmed ? site.name : (pendingOrder?.review?.siteConfirmation || ''));
    const comparisons = useMemo(() => comparePurchaseItems(budgetLines, orderLines, purchaseLinks), [budgetLines, orderLines, purchaseLinks]);
    const pendingPriceComparison=useMemo(()=>pendingOrder && pendingOrder.kind !== 'credit' ? compareSupplierPrices({
        quotes:priceQuotes,quoteLines:priceQuoteLines,
        orders:[{id:'pending',supplier:order.supplier,po_number:order.poNumber}],
        orderLines:pendingOrder.rows.filter(line=>line.included!==false).map((line,index)=>({
            ...line,id:'draft-'+index,order_id:'pending'
        })),
    }):null,[pendingOrder,order,priceQuotes,priceQuoteLines]);
    const supplierHasQuote=Boolean(activeSupplierQuotes(priceQuotes).find(
        quote=>quote.supplier&&quote.supplier.trim().toLowerCase()===order.supplier.trim().toLowerCase()));
    // Extra purchases count in global spend without requiring catalogue pairing.
    const quoteBasedBudget=priceQuotes.length>0&&budgetRevisions.some(
        revision=>revision.kind==='replacement');
    const pendingPriceNeedsReview=Boolean(pendingOrder&&(
        pendingPriceComparison?.overpriceCount>0 ||
        pendingPriceComparison?.needsReview.length>0));
    const orderTotals = useMemo(() => new Map(orders.map(item => [
        item.id, orderLines.filter(line => line.order_id === item.id)
            .reduce((sum, line) => sum + Number(line.amount || 0), 0),
    ])), [orders, orderLines]);

    const savedOrder = (kind, rows) => {
        setPendingOrder(null);
        setOrder(emptyOrder);
        setPriceRiskAcknowledged(false);
        setPdfIssues([]);
        setReloadIndex(value => value + 1);
        onPurchasesChanged?.();
        setNotice((kind === 'credit' ? 'Avoir enregistré' : 'Confirmation enregistrée') +
            ' · ' + rows.length + ' article(s) · ' +
            money(rows.reduce((sum, row) => sum + row.amount, 0)) + ' HT.');
    };

    const findProjectAlias = async metadata => {
        if (normalizeToken(metadata.shippingProject).length < 3) return false;
        const { data, error } = await supabase.rpc('bt_purchase_matches_project_alias', {
            p_company_id: currentCompanyId, p_site_id: site.id,
            p_supplier: metadata.supplier, p_shipping_project_name: metadata.shippingProject,
        });
        return !error && data === true;
    };

    const persistOrder = (draft, metadata, rows) => importPurchasePdf(draft.originalFile, {
        companyId: currentCompanyId, siteId: site.id, kind: draft.kind, fingerprint: draft.fingerprint,
        metadata, rows, override: draft.siteConfirmed ? site.name : draft.review?.siteConfirmation,
    });

    const importOrder = async (file, pdf) => {
        const credit = isPurchaseCredit(pdf.text);
        const parsed = credit ? null : assessDigitalPdf(pdf, { kind: 'order', site });
        const extractedCredit = credit ? extractFlocorCredit(pdf.text) : null;
        if (credit && (!extractedCredit?.complete || !pdf.allPagesProcessed || !pdf.digitalText)) {
            throw new Error('Avoir illisible ou format fournisseur inconnu. Aucun montant enregistré.');
        }

        const metadata = credit ? {
            supplier: 'Flocor', poNumber: extractedCredit.po_number, supplierNumber: extractedCredit.reference,
            shippingProject: extractedCredit.shipping_project_name, originalSupplierNumber: extractedCredit.original_supplier_order_number,
        } : {
            supplier: parsed.supplier || '', poNumber: parsed.hints?.po_number || '',
            supplierNumber: parsed.hints?.supplier_order_number || '',
            shippingProject: parsed.hints?.shipping_project_name || '',
        };
        const draft = { kind: credit ? 'credit' : 'order', originalFile: file, sourceName: file.name.slice(0, 150), fingerprint: pdf.sha256 };
        const directMatch = shippingProjectVerification(metadata.shippingProject, site.name).match;
        const verified = parsed?.issues?.length && parsed.issues.every(issue => issue.code === 'project')
            ? assessDigitalPdf(pdf, { kind: 'order', site: { ...site, name: metadata.shippingProject } })
            : parsed;
        const rows = credit ? extractedCredit.rows : verified.verified_rows;
        if (!rows.length) {
            const review = preparePurchaseReview(parsed, site, pdf.text, 'order');
            setOrder({ ...metadata, shippingProject: review.extractedProject });
            setPendingOrder({ ...draft, review, rows: review.rows });
            setPdfIssues(parsed.issues.map(issue => issue.message));
            return;
        }

        const siteConfirmed = !directMatch && await findProjectAlias(metadata);
        const prices = credit ? null : compareSupplierPrices({
            quotes: priceQuotes, quoteLines: priceQuoteLines,
            orders: [{ id: 'pending', supplier: metadata.supplier, po_number: metadata.poNumber }],
            orderLines: rows.map((row, index) => ({ ...row, id: 'draft-' + index, order_id: 'pending' })),
        });
        const needsPriceReview = prices?.overpriceCount > 0 || prices?.needsReview.length > 0;
        if ((directMatch || siteConfirmed) && !needsPriceReview) {
            await persistOrder({ ...draft, siteConfirmed }, metadata, rows);
            savedOrder(draft.kind, rows);
            return;
        }
        setOrder(metadata);
        setPendingOrder({ ...draft, rows, verifiedPdf: true, simpleReview: !directMatch && !siteConfirmed, siteConfirmed });
        if (!directMatch && !siteConfirmed) setPdfIssues(['Confirmez le chantier de livraison.']);
    };

    // Orders cannot be created with typed fields. Spreadsheets remain available
    // only for the initial budget; supplier orders require their source PDF.
    const selectFile = async (file, mode) => {
        if (!file || mode !== 'budget') return;
        setError(''); setNotice(''); setPdfIssues([]);
        try {
            const rows = parsePurchaseRows(await readSheet(file), { kind: 'budget' });
            setPendingBudget({rows, sourceName:file.name});
        } catch (e) {
            setPendingBudget(null);
            setError(e.message || 'Import du budget impossible.');
        }
    };

    const importDigitalPdf = async (file, mode) => {
        if (!file || busy) return;
        if (!isAdmin || !isCorrectTenant || site?.status !== 'active') {
            setError('Seul un administrateur peut importer un document sur un chantier actif.');
            return;
        }
        setBusy(true);
        setError(''); setNotice(''); setPdfIssues([]);
        setPriceRiskAcknowledged(false);
        // A newly selected file must invalidate any prior confirmation draft.
        if (mode === 'budget') setPendingBudget(null);
        if (mode === 'order') {
            setPendingOrder(null);
            setOrder(emptyOrder);
        }
        try {
            const { readDigitalPdf } = await import('../utils/digitalPdfReader');
            const pdf = await readDigitalPdf(file);
            if (mode === 'order') {
                await importOrder(file, pdf);
                return;
            }
            const parsed = assessDigitalPdf(pdf, { kind: 'budget', site, hasExistingBudget: Boolean(budget) });
            const rows = parsed.verified_rows;
            if (parsed.status === 'auto_commit' && rows.length) {
                const { error: rpcError } = await supabase.rpc('bt_purchase_import_budget', {
                    p_company_id: currentCompanyId, p_site_id: site.id, p_source_name: file.name.slice(0, 150), p_lines: rows,
                });
                if (rpcError) throw rpcError;
                setReloadIndex(value => value + 1);
                onPurchasesChanged?.();
                setNotice('Budget initial enregistré · ' + rows.length + ' article(s).');
                return;
            }
            setPdfIssues(parsed.issues.map(issue => issue.message));
            if(budget) throw new Error('Utilisez le remplacement ou la liste complémentaire du budget existant.');
            const review=preparePurchaseReview(parsed,site,pdf.text,'budget');
            setPendingBudget({rows:review.rows,review,sourceName:file.name,originalFile:file});
        } catch(err) {
            setError(err?.code==='23505'
                ? 'Ce document a déjà été importé.'
                : err?.message || 'Lecture PDF impossible.');
            setPdfIssues([]);
        } finally { setBusy(false); }
    };

    const saveBudget = async () => {
        if (!pendingBudget || budget || busy) return;
        setBusy(true); setError(''); setNotice('');
        try {
            const { error: rpcError } = await supabase.rpc('bt_purchase_import_budget', {
                p_company_id: currentCompanyId, p_site_id: site.id,
                p_source_name: pendingBudget.sourceName, p_lines: pendingBudget.review ? validatePurchaseReview(pendingBudget.review,pendingBudget.rows,site) : pendingBudget.rows,
            });
            if (rpcError) throw rpcError;
            setPendingBudget(null);
            setNotice('Budget initial enregistré et figé pour ce chantier.');
            setReloadIndex(value => value + 1);
            onPurchasesChanged?.();
        } catch (e) { setError(e.message || 'Enregistrement du budget impossible.'); }
        finally { setBusy(false); }
    };

    const saveOrder = async () => {
        if (!pendingOrder?.originalFile || (!pendingOrder.verifiedPdf && !pendingOrder.review) || !shippingCheck.canAccept || busy ||
            site.status!=='active' || !order.supplier.trim() || !order.poNumber.trim() ||
            (!order.shippingProject.trim() && !pendingOrder.review?.siteConfirmation)) {
            setError('La commande doit provenir d’un PDF complet vérifié pour ce chantier.');
            return;
        }
        if (pendingPriceNeedsReview && !priceRiskAcknowledged) {
            setError('Veuillez prendre connaissance de l’alerte de prix avant de confirmer l’import.');
            return;
        }
        setBusy(true); setError(''); setNotice('');
        try {
            const rows = pendingOrder.review
                ? validatePurchaseReview(pendingOrder.review, pendingOrder.rows, site, order)
                : pendingOrder.rows;
            await persistOrder(pendingOrder, { ...order, shippingProject: order.shippingProject.trim() || site.name }, rows);
            savedOrder(pendingOrder.kind, rows);
        } catch (e) {
            setError(e.code === '23505'
                ? 'Ce document a déjà été importé.'
                : e.message || 'Import de la commande impossible.');
        } finally { setBusy(false); }
    };

    if (!site || !isAdmin || !isCorrectTenant) return null;
    return (
        <section className="glass-panel mb-8 p-4 sm:p-6 text-slate-100" aria-labelledby="purchases-title">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                    <h2 id="purchases-title" className="text-xl font-bold">Achats · Suivi budgétaire</h2>
                    <p className="text-sm text-slate-400">Engagements hors taxes · Aucun traitement de factures</p>
                </div>
                <button type="button" onClick={() => setReloadIndex(value => value + 1)}
                    disabled={busy || loading} aria-label="Actualiser les achats"
                    className="min-h-11 flex items-center gap-2 rounded-lg border border-slate-600 px-3 text-sm text-blue-200 disabled:opacity-50">
                    <RefreshCw size={16} aria-hidden="true"/> Actualiser
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                {[
                    { label: 'Budget matériel actualisé', value: budget ? money(totals.initial) : 'Non importé' },
                    { label: 'Commandes engagées', value: money(totals.committed) },
                    { label: 'Solde non engagé', value: budget ? money(totals.uncommitted) : '—' },
                ].map(item => (
                    <div key={item.label} className="rounded-xl bg-slate-800 p-3 border border-slate-700 min-w-0">
                        <p className="text-xs text-slate-400">{item.label}</p>
                        <p className="text-lg font-bold tabular-nums break-words">{item.value}</p>
                    </div>
                ))}
            </div>
            <p className="mb-4 text-xs text-slate-400">Le solde non engagé n’est pas une économie ni une prévision finale : il reste des articles à commander.</p>
            {loading && <p role="status" className="mb-3 text-sm text-blue-200">Actualisation…</p>}
            {error && <p role="alert" className="mb-3 rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
            {notice && <p role="status" className="mb-3 rounded-lg border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}
            {pdfIssues.length>0 && (
                <div role="alert" className="mb-3 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-100">
                    <p className="font-semibold">PDF à vérifier : aucun enregistrement automatique.</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                        {pdfIssues.slice(0,8).map((issue,index)=><li key={index}>{issue}</li>)}
                    </ul>
                    <p className="mt-2 text-xs">Vérifiez les informations et les articles dans le formulaire de validation ci-dessous.</p>
                </div>
            )}

            {unified && <UnifiedPurchaseInbox site={site} commitDocument={commitUnifiedPurchase}
                history={inboxHistory} pending={inboxPending} onSaved={async () => { await refresh(); onPurchasesChanged?.(); }} />}
            <SupplierPriceAlertsPanel site={site} companyId={currentCompanyId}
                quotes={activeReferences.quotes} quoteLines={activeReferences.quoteLines} orders={orders}
                orderLines={orderLines} links={priceLinks} enabled={priceReferenceEnabled}
                onUpdated={refresh}/>
            <div className="flex gap-2 border-b border-slate-700 mb-4" role="tablist" aria-label="Suivi des achats">
                {[['budget','Budget'],['orders','Commandes']].map(([key,label]) => (
                    <button key={key} type="button" role="tab" aria-selected={tab === key}
                        onClick={() => { setTab(key); setError(''); }}
                        className={`min-h-11 px-3 text-sm font-semibold border-b-2 ${tab === key ? 'border-blue-400 text-blue-200' : 'border-transparent text-slate-400'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'budget' && (
                <div role="tabpanel" className="space-y-3">
                    {budget ? (
                        <>
                            <p className="flex items-center gap-2 text-emerald-300 text-sm"><CheckCircle2 size={16}/>
                                Budget actif · {budgetLines.length} article(s) (estimation de base + avenants éventuels)
                             </p>
                             <SupplierPriceReferencePanel site={site} companyId={currentCompanyId}
                                 quotes={priceQuotes} quoteLines={priceQuoteLines}
                                 enabled={priceReferenceEnabled} hideImport={unified}
                                 documents={quoteArchive} archiveEnabled={archiveEnabled}
                                 onSaved={async()=>{await refresh();onPurchasesChanged?.();}}/>
                             <PurchaseBudgetRevisions site={site} companyId={currentCompanyId} hideImport={unified}
                                budget={budget} budgetLines={budgetLines} revisions={budgetRevisions}
                                onSaved={async()=>{await refresh();onPurchasesChanged?.();}}/>
                            <PurchaseItemsOverview
                                budgetLines={budgetLines}
                                comparisons={comparisons}
                            />
                            {!quoteBasedBudget&&orderLines.length>0&&(
                                <details className="rounded-lg border border-slate-700 p-3">
                                    <summary className="cursor-pointer min-h-11 text-sm font-semibold text-blue-200">
                                        Gérer les correspondances manuelles (autres estimations)
                                    </summary>
                                    <PurchaseLineReconciliation
                                        site={site} companyId={currentCompanyId} budgetLines={budgetLines}
                                        orders={orders} comparisons={comparisons} links={purchaseLinks}
                                        enabled={linkingEnabled} onUpdated={refresh}
                                    />
                                </details>
                            )}
                        </>
                    ) : (
                        !unified && <>
                            <p className="text-sm text-slate-300">Importer la liste d’achats du chantier. Un PDF numérique cohérent est enregistré automatiquement, sans vérification ligne par ligne.</p>
                            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-blue-600 bg-blue-950/30 p-3 text-sm font-semibold text-blue-100">
                                <FileSpreadsheet size={19}/> Importer le budget PDF automatiquement
                                <input type="file" accept=".pdf,application/pdf" className="sr-only"
                                    disabled={busy} onChange={event=>{void importDigitalPdf(event.target.files?.[0],'budget');event.target.value='';}}/>
                            </label>
                            <p className="text-xs text-slate-400">PDF avec texte sélectionnable seulement · Analyse locale sans frais IA · Excel/CSV en secours.</p>
                            <button type="button" onClick={downloadTemplate} className="text-sm underline text-blue-300">Télécharger le modèle CSV</button>
                            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-600 p-3 text-sm text-blue-200">
                                <FileSpreadsheet size={19}/> Choisir une liste Excel / CSV
                                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy} onChange={e => { void selectFile(e.target.files?.[0], 'budget'); e.target.value = ''; }}/>
                            </label>
                            {pendingBudget && (
                                <div className="rounded-xl border border-blue-700 p-3 text-sm">
                                    <p>{pendingBudget.sourceName} · {pendingBudget.rows.length} articles</p>
                                    {pendingBudget.review&&<PurchasePdfReview pending={pendingBudget} site={site} busy={busy} onChange={setPendingBudget} onCancel={()=>{setPendingBudget(null);setPdfIssues([]);}}/>}
                                    <p className="font-bold mt-1">Budget à confirmer : {money(pendingBudget.rows.filter(line=>line.included!==false).reduce((sum,line) => sum + (Number(line.amount)||0),0))}</p>
                                    <button type="button" onClick={saveBudget} disabled={busy || site.status !== 'active'}
                                        className="mt-3 min-h-11 w-full rounded-lg bg-blue-600 px-4 font-semibold disabled:opacity-50">
                                        {busy ? 'Enregistrement…' : 'Valider et figer le budget'}
                                    </button>
                                </div>
                            )}
                            <p className="text-xs text-amber-300 flex items-start gap-2"><AlertTriangle size={16} className="shrink-0"/> Les lignes non matérielles et les totaux non concordants sont signalés avant toute écriture.</p>
                        </>
                    )}
                </div>
            )}
            {tab === 'orders' && (
                <div role="tabpanel" className="space-y-3">
                    {!unified && <>
                    <p className="text-sm text-slate-300">
                        Les commandes s’ajoutent uniquement en important une confirmation PDF du fournisseur.
                        Les articles, quantités, prix et données de commande sont extraits automatiquement.
                    </p>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-blue-600 bg-blue-950/30 p-3 text-sm font-semibold text-blue-100">
                        <FileSpreadsheet size={19}/> Importer une confirmation ou un avoir PDF
                        <input type="file" accept=".pdf,application/pdf" className="sr-only"
                            disabled={busy||site.status!=='active'}
                            onChange={event=>{void importDigitalPdf(event.target.files?.[0],'order');event.target.value='';}}/>
                    </label>
                    <p className="text-xs text-slate-400">
                        PDF justificatif obligatoire. Si la lecture automatique est incertaine, vérifiez les données avant enregistrement.
                        Les achats hors soumission sont acceptés et comptabilisés normalement.
                    </p>
                    {pendingOrder && (
                        <div className="rounded-xl border border-slate-600 p-3 text-sm space-y-3">
                            <p className="font-semibold">{pendingOrder.kind === 'credit' ? 'Avoir PDF' : 'Confirmation PDF'} · {pendingOrder.sourceName}</p>
                            <p className="text-xs text-slate-300">
                                {order.supplier} · PO {order.poNumber} · Chantier : {order.shippingProject}
                            </p>
                            <p className="text-sm">
                                {pendingOrder.rows.length} articles ·
                                {' '}{money(pendingOrder.rows.filter(line=>line.included!==false).reduce((sum,line) => sum + (Number(line.amount)||0),0))} HT
                            </p>
                            {pendingOrder.simpleReview&&<div className="rounded-lg border border-amber-600 p-3 space-y-2">
                                <p>Nom sur le PDF : <strong>{order.shippingProject}</strong></p>
                                <p>Chantier destinataire : <strong>{site.name}</strong></p>
                                <label className="flex items-start gap-2"><input type="checkbox" checked={pendingOrder.siteConfirmed} onChange={e=>setPendingOrder(p=>({...p,siteConfirmed:e.target.checked}))}/> Je confirme ce chantier. Cette appellation fournisseur sera reconnue pour les prochaines commandes après enregistrement.</label>
                            </div>}
                            {pendingOrder.review&&<PurchasePdfReview pending={pendingOrder} site={site} order={order} onOrder={setOrder} busy={busy} onChange={fn=>{setPendingOrder(fn);setPriceRiskAcknowledged(false);}} onCancel={()=>{setPendingOrder(null);setPdfIssues([]);}}/>}
                            {pendingPriceComparison && (
                                <div className="rounded-lg border border-amber-700/70 p-3 text-sm space-y-2">
                                    <p className="font-semibold">Vérification des prix avant engagement</p>
                                    {!supplierHasQuote&&<p className="text-amber-200 text-xs">
                                        Aucune soumission de référence active pour {order.supplier||'ce fournisseur'}.
                                        Importez-la dans Budget pour contrôler les prix.
                                    </p>}
                                    {pendingPriceComparison.overpriceCount>0&&<div role="alert"
                                        className="text-red-200 text-xs space-y-1">
                                        <p className="font-semibold">
                                            {pendingPriceComparison.overpriceCount} dépassement(s) :
                                            {' '}{money(pendingPriceComparison.impact)} HT
                                        </p>
                                        {pendingPriceComparison.overpriced.map(row=>
                                            <p key={row.id}>{row.item_code} ·
                                                soumission {money(row.referenceUnitCost)} / {row.unit} →
                                                confirmé {money(row.unit_cost)} / {row.unit} ·
                                                écart {money(row.impact)} HT</p>
                                        )}
                                    </div>}
                                    {pendingPriceComparison.notInQuoteCount>0&&<p className="text-slate-300 text-xs">
                                        {pendingPriceComparison.notInQuoteCount} article(s) hors soumission ·
                                        {' '}{money(pendingPriceComparison.notInQuoteAmount)} HT
                                        comptabilisés dans les dépenses globales.
                                        Aucune correspondance n’est demandée.
                                    </p>}
                                    {pendingPriceComparison.needsReview.length>0&&<p className="text-amber-200 text-xs">
                                        {pendingPriceComparison.needsReview.length} ligne(s) avec
                                        une correspondance incertaine : vérifier les codes et unités.
                                    </p>}
                                    {pendingPriceNeedsReview&&<label className="flex items-start gap-2 text-xs">
                                        <input type="checkbox" checked={priceRiskAcknowledged}
                                            onChange={e=>setPriceRiskAcknowledged(e.target.checked)}/>
                                        J’ai pris connaissance des écarts de prix réels ou des unités ambiguës.
                                        La commande peut être enregistrée sans modifier les prix de référence.
                                    </label>}
                                    {!pendingPriceNeedsReview&&<p className="text-emerald-200 text-xs">
                                        Aucun dépassement détecté parmi les produits rapprochés.
                                    </p>}
                                </div>
                            )}
                            <p className="text-xs text-emerald-200">
                                {pendingOrder.review?'La validation engage les montants vérifiés du PDF.':'Le chantier doit correspondre au PDF ou avoir été confirmé.'}
                            </p>
                            <button type="button" onClick={saveOrder} disabled={busy || (!pendingOrder.verifiedPdf && !pendingOrder.review) || !shippingCheck.canAccept ||
                                    (pendingPriceNeedsReview&&!priceRiskAcknowledged) || site.status !== 'active'}
                                className="min-h-11 w-full rounded-lg bg-blue-600 font-semibold disabled:opacity-50">
                                {busy ? 'Enregistrement…' : 'Confirmer l’import du PDF'}
                            </button>
                        </div>
                    )}
                    </>}
                    <div className="space-y-2 pt-2">
                        <h3 className="font-semibold flex items-center gap-2"><Package size={17}/> Commandes et avoirs enregistrés ({orders.length})</h3>
                        {!orders.length && <p className="text-sm text-slate-400">Aucune commande à ce jour.</p>}
                        {groupPurchaseDocuments(orders,orderLines).map(group => (
                          <details key={group.key} open className="rounded-xl border border-slate-700 p-3 space-y-2">
                            <summary className="cursor-pointer font-semibold">{group.supplier} · PO {group.po_number} · {group.documents.length} document(s) · {money(group.total)}</summary>
                            {group.documents.map(item => (
                            <PurchasePdfCard key={item.id}
                                kind="order" source={{...item,
                                    line_count:orderLines.filter(line=>String(line.order_id)===String(item.id)).length,
                                    total_amount:orderTotals.get(item.id)}}
                                site={site} companyId={currentCompanyId}
                                canAttach={archiveEnabled}
                                documentRecord={purchaseDocuments.find(d=>d.source_kind==='order'&&String(d.source_id)===String(item.id))}
                                detailLines={orderLines.filter(line=>String(line.order_id)===String(item.id))}
                                onAttached={refresh} className="bg-slate-800">
                                <div className="flex justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm break-words">{item.document_kind === 'credit' ? 'Avoir' : 'Confirmation'} · {item.supplier_order_number||item.po_number}</p>
                                        <p className="text-xs text-slate-400 break-words">Livraison : {item.shipping_project_name}</p>
                                    </div>
                                    <span className="font-semibold tabular-nums text-sm shrink-0">{money(orderTotals.get(item.id))}</span>
                                </div>
                            </PurchasePdfCard>
                            ))}
                          </details>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400">Le PDF numérique est lu localement. L’import des courriels et le rapprochement des bons restent indépendants.</p>
                </div>
            )}
        </section>
    );
}

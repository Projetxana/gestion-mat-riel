import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Package, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { calculatePurchaseBudget, comparePurchaseItems, parsePurchaseRows, shippingProjectVerification } from '../utils/purchaseBudget';

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
    const [orders, setOrders] = useState([]);
    const [orderLines, setOrderLines] = useState([]);
    const [tab, setTab] = useState('budget');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [pendingBudget, setPendingBudget] = useState(null);
    const [pendingOrder, setPendingOrder] = useState(null);
    const [order, setOrder] = useState(emptyOrder);
    const [shippingVerified, setShippingVerified] = useState(false);
    const [shippingOverride, setShippingOverride] = useState('');
    const [reloadIndex, setReloadIndex] = useState(0);

    const refresh = useCallback(async () => {
        if (!site?.id || !currentCompanyId || !isAdmin || !isCorrectTenant) return;
        setLoading(true);
        setError('');
        try {
            const conditions = ['company_id', 'site_id'];
            const selectProject = (table, cols) =>
                supabase.from(table).select(cols).eq(conditions[0], currentCompanyId).eq(conditions[1], site.id);
            const [budgetResult, budgetItemsResult, ordersResult, itemsResult] = await Promise.all([
                selectProject('bt_purchase_budgets', 'id, source_name, created_at').maybeSingle(),
                selectProject('bt_purchase_budget_lines', 'id, item_code, description, quantity, unit, unit_cost, amount').order('id'),
                selectProject('bt_purchase_orders', 'id, po_number, supplier, supplier_order_number, shipping_project_name, created_at, order_date').order('created_at', { ascending: false }),
                selectProject('bt_purchase_order_lines', 'id, order_id, description, item_code, quantity, unit, amount').order('id'),
            ]);
            const failure = [budgetResult, budgetItemsResult, ordersResult, itemsResult].find(result => result.error);
            if (failure) throw failure.error;
            setBudget(budgetResult.data);
            setBudgetLines(budgetItemsResult.data || []);
            setOrders(ordersResult.data || []);
            setOrderLines(itemsResult.data || []);
        } catch (e) {
            setError(e.code === '42P01'
                ? 'Les tables du module Achats ne sont pas encore activées dans Supabase.'
                : 'Chargement des achats impossible : ' + (e.message || 'erreur réseau'));
        } finally {
            setLoading(false);
        }
    }, [site?.id, currentCompanyId, isAdmin, isCorrectTenant]);

    useEffect(() => { void refresh(); }, [refresh, reloadIndex]);

    const totals = useMemo(() => calculatePurchaseBudget(budgetLines, orderLines), [budgetLines, orderLines]);
    const shippingCheck = shippingProjectVerification(order.shippingProject, site?.name, shippingOverride);
    const comparisons = useMemo(() => comparePurchaseItems(budgetLines, orderLines), [budgetLines, orderLines]);
    const orderTotals = useMemo(() => new Map(orders.map(item => [
        item.id, orderLines.filter(line => line.order_id === item.id)
            .reduce((sum, line) => sum + Number(line.amount || 0), 0),
    ])), [orders, orderLines]);

    const selectFile = async (file, mode) => {
        if (!file) return;
        setError('');
        setNotice('');
        try {
            const rows = parsePurchaseRows(await readSheet(file), { kind: mode });
            if (mode === 'budget') setPendingBudget({ rows, sourceName: file.name });
            else {
                setPendingOrder({ rows, sourceName: file.name });
                setShippingVerified(false);
            }
        } catch (e) {
            if (mode === 'budget') setPendingBudget(null); else setPendingOrder(null);
            setError(e.message || 'Import du document impossible.');
        }
    };

    const saveBudget = async () => {
        if (!pendingBudget || budget || busy) return;
        setBusy(true); setError(''); setNotice('');
        try {
            const { error: rpcError } = await supabase.rpc('bt_purchase_import_budget', {
                p_company_id: currentCompanyId, p_site_id: site.id,
                p_source_name: pendingBudget.sourceName, p_lines: pendingBudget.rows,
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
        if (!pendingOrder || !shippingVerified || !shippingCheck.canAccept || busy || !order.supplier.trim()
            || !order.poNumber.trim() || !order.shippingProject.trim()) {
            setError('Fournisseur, numéro de PO, projet indiqué à la livraison et validation sont obligatoires.');
            return;
        }
        setBusy(true); setError(''); setNotice('');
        try {
            const { error: rpcError } = await supabase.rpc('bt_purchase_create_order', {
                p_company_id: currentCompanyId, p_site_id: site.id,
                p_po_number: order.poNumber.trim(), p_supplier: order.supplier.trim(),
                p_supplier_order_number: order.supplierNumber.trim(),
                p_shipping_project_name: order.shippingProject.trim(),
                p_order_date: order.date || null, p_source_name: pendingOrder.sourceName,
                p_project_verified: shippingVerified, p_override_confirmation: shippingOverride.trim(), p_lines: pendingOrder.rows,
            });
            if (rpcError) throw rpcError;
            setPendingOrder(null); setOrder(emptyOrder); setShippingVerified(false); setShippingOverride('');
            setNotice('Commande enregistrée dans le chantier sélectionné. Aucun montant de livraison ajouté.');
            setReloadIndex(value => value + 1);
            onPurchasesChanged?.();
        } catch (e) {
            setError(e.code === '23505'
                ? 'Ce PO existe déjà pour ce fournisseur. Aucune commande en double ajoutée.'
                : e.message || 'Enregistrement de la commande impossible.');
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
                    { label: 'Budget matériel initial', value: budget ? money(totals.initial) : 'Non importé' },
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
                            <p className="flex items-center gap-2 text-emerald-300 text-sm"><CheckCircle2 size={16}/> Budget figé depuis {budget.source_name} · {budgetLines.length} article(s)</p>
                            <div className="max-h-56 overflow-auto rounded-lg border border-slate-700">
                                {budgetLines.slice(0, 25).map(item => (
                                    <div key={item.id} className="flex justify-between gap-3 border-b border-slate-700 p-2 text-xs">
                                        <span className="min-w-0 break-words">{item.item_code} {item.description}</span>
                                        <strong className="shrink-0 tabular-nums">{money(item.amount)}</strong>
                                    </div>
                                ))}
                            </div>
                            {budgetLines.length > 25 && <p className="text-xs text-slate-400">25 premières lignes affichées sur {budgetLines.length}.</p>}
                            {orderLines.length > 0 && (
                                <details className="rounded-lg border border-slate-700 p-3">
                                    <summary className="cursor-pointer min-h-11 text-sm font-semibold text-blue-200">Comparer les quantités estimées et commandées</summary>
                                    <p className="text-xs text-slate-400 my-2">Rapprochement par code client et unité. Une description seule ne suffit jamais.</p>
                                    <div className="space-y-1">
                                        {comparisons.matched.slice(0, 40).map(row => (
                                            <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 py-2 text-xs">
                                                <span className="break-words min-w-0 flex-1">{row.item_code} · {row.description}</span>
                                                <span className={row.exceeded ? 'text-red-300 tabular-nums' : 'text-slate-300 tabular-nums'}>
                                                    {row.orderedQty} / {row.estimatedQty} {row.unit}
                                                </span>
                                                <span className="text-slate-400 tabular-nums">Reste {row.remainingQty}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {comparisons.matched.length > 40 && <p className="text-xs text-slate-400">40 articles affichés sur {comparisons.matched.length}.</p>}
                                    {comparisons.unmatched.length > 0 && (
                                        <p role="status" className="mt-3 text-xs text-amber-200">
                                            {comparisons.unmatched.length} ligne(s) commandée(s) sans code client/unité correspondant à l’estimation : vérification nécessaire. Les coûts restent engagés.
                                        </p>
                                    )}
                                </details>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-slate-300">Importer une seule fois la liste d’achats initiale du chantier en Excel ou CSV.</p>
                            <button type="button" onClick={downloadTemplate} className="text-sm underline text-blue-300">Télécharger le modèle CSV</button>
                            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-600 p-3 text-sm text-blue-200">
                                <FileSpreadsheet size={19}/> Choisir une liste Excel / CSV
                                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy} onChange={e => { void selectFile(e.target.files?.[0], 'budget'); e.target.value = ''; }}/>
                            </label>
                            {pendingBudget && (
                                <div className="rounded-xl border border-blue-700 p-3 text-sm">
                                    <p>{pendingBudget.sourceName} · {pendingBudget.rows.length} articles</p>
                                    <p className="font-bold mt-1">Budget à confirmer : {money(pendingBudget.rows.reduce((sum,line) => sum + line.amount,0))}</p>
                                    <button type="button" onClick={saveBudget} disabled={busy || site.status !== 'active'}
                                        className="mt-3 min-h-11 w-full rounded-lg bg-blue-600 px-4 font-semibold disabled:opacity-50">
                                        {busy ? 'Enregistrement…' : 'Valider et figer le budget'}
                                    </button>
                                </div>
                            )}
                            <p className="text-xs text-amber-300 flex items-start gap-2"><AlertTriangle size={16} className="shrink-0"/> Ne pas importer les lignes de main-d’œuvre ou les ajustements forfaitaires dans le budget matériel. Le lecteur PDF arrive dans une prochaine étape.</p>
                        </>
                    )}
                </div>
            )}
            {tab === 'orders' && (
                <div role="tabpanel" className="space-y-3">
                    <p className="text-sm text-slate-300">Une confirmation engage le budget. Le bon de livraison ne crée jamais de nouvel achat.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            ['supplier','Fournisseur','Flocor'],
                            ['poNumber','N° PO client','P02281'],
                            ['supplierNumber','Commande fournisseur (facultatif)','7252931'],
                            ['shippingProject','Nom indiqué à la livraison','DJ4 S.E.C.'],
                        ].map(([key,label,placeholder]) => (
                            <label key={key} className="text-sm text-slate-300">
                                {label}
                                <input type="text" maxLength={150} value={order[key]}
                                    onChange={e => { setOrder(prev => ({...prev, [key]:e.target.value})); setShippingVerified(false); setShippingOverride(''); }}
                                    placeholder={placeholder}
                                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-white"/>
                            </label>
                        ))}
                        <label className="text-sm text-slate-300">Date de la commande
                            <input type="date" value={order.date} onChange={e => setOrder(prev => ({...prev,date:e.target.value}))}
                                className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-white"/>
                        </label>
                    </div>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-600 p-3 text-sm text-blue-200">
                        <FileSpreadsheet size={19}/> Importer les lignes de commande Excel / CSV
                        <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy} onChange={e => { void selectFile(e.target.files?.[0], 'order'); e.target.value = ''; }}/>
                    </label>
                    {pendingOrder && (
                        <div className="rounded-xl border border-slate-600 p-3 text-sm space-y-3">
                            <p>{pendingOrder.sourceName} · {pendingOrder.rows.length} articles · {money(pendingOrder.rows.reduce((sum,line) => sum + line.amount,0))}</p>
                            {shippingCheck.requiresOverride && (
                                <div className="rounded-lg border border-amber-600/70 bg-amber-950/30 p-3 text-sm space-y-2">
                                    <p className="text-amber-200">Le nom indiqué à la livraison ne correspond pas exactement à « {site.name} ». Vérifiez le document et confirmez manuellement le chantier.</p>
                                    <label className="block">Retaper le nom du chantier sélectionné
                                        <input type="text" value={shippingOverride} onChange={e => { setShippingOverride(e.target.value); setShippingVerified(false); }}
                                            placeholder={site.name} autoComplete="off" className="mt-1 min-h-11 w-full rounded-lg border border-amber-700 bg-slate-900 px-3 text-white"/>
                                    </label>
                                </div>
                            )}
                            <label className="flex items-start gap-2">
                                <input type="checkbox" checked={shippingVerified}
                                    onChange={e => setShippingVerified(e.target.checked)} className="mt-1"/>
                                <span>J’ai vérifié que le nom de chantier indiqué à la livraison correspond bien à <strong>{site.name}</strong>. Le numéro PO seul ne prouve pas le chantier.</span>
                            </label>
                            <button type="button" onClick={saveOrder} disabled={busy || !shippingVerified || !shippingCheck.canAccept || site.status !== 'active'}
                                className="min-h-11 w-full rounded-lg bg-blue-600 font-semibold disabled:opacity-50">
                                {busy ? 'Enregistrement…' : 'Valider la commande'}
                            </button>
                        </div>
                    )}
                    <div className="space-y-2 pt-2">
                        <h3 className="font-semibold flex items-center gap-2"><Package size={17}/> Commandes enregistrées ({orders.length})</h3>
                        {!orders.length && <p className="text-sm text-slate-400">Aucune commande à ce jour.</p>}
                        {orders.map(item => (
                            <div key={item.id} className="rounded-lg border border-slate-700 bg-slate-800 p-3 flex justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-semibold text-sm break-words">{item.supplier} · PO {item.po_number}</p>
                                    <p className="text-xs text-slate-400 break-words">Livraison : {item.shipping_project_name}</p>
                                </div>
                                <span className="font-semibold tabular-nums text-sm shrink-0">{money(orderTotals.get(item.id))}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-amber-300">À venir : analyse des PDF par courriel, détection automatique du projet et rapprochement des bons/BO. Aucun bon de livraison n’est encore modifié.</p>
                </div>
            )}
        </section>
    );
}

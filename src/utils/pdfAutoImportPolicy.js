// Straight-through purchasing policy for digital supplier PDFs.
// All checks are deterministic. "PDF numérique" alone does NOT demonstrate
// complete extraction; text can be positioned out of visual order.
// Only complete, reconciled documents can write to existing purchase RPCs.
import { normalizePurchaseOrder, normalizeToken, parsePurchaseRows } from './purchaseBudget.js';

const cents = value => Math.round(Number(value) * 100);
const allowedKinds = new Set(['budget','order']);
const trustedParsers = new Set(['flocor-layout-v1','cd-estimate-v1','flocor-quotation-v1','structured-table-v1']);

export const assessPdfAutoImport = ({
    kind, site, hints, supplier = '', previousOrders = [], hasExistingBudget = false,
    document = {}, evidence = {},
} = {}) => {
    const issues = [];
    const add = (code, message) => {
        if (!issues.some(item => item.code === code)) issues.push({code,message});
    };
    if (!allowedKinds.has(kind)) add('kind','Type de document non pris en charge.');
    if (!site?.id || site.status !== 'active' || !site.company_id)
        add('site','Chantier actif et entreprise requis.');

    const expected = normalizeToken(site?.name);
    const extracted = normalizeToken(hints?.shipping_project_name);
    if (!extracted || !expected || extracted !== expected)
        add('project','Chantier indiqué dans le PDF absent ou différent.');

    if (document.mime_type !== 'application/pdf' || document.digital_text !== true)
        add('digital','Import automatique réservé aux PDF numériques avec texte extractible.');
    if (!trustedParsers.has(document.parser_id))
        add('template','Mise en page du fournisseur non reconnue.');
    if (!document.all_pages_processed || !Number.isInteger(document.page_count) ||
        document.page_count < 1)
        add('pages','Toutes les pages doivent être analysées.');
    if (!/^[a-f0-9]{64}$/i.test(String(document.sha256||'')))
        add('fingerprint','Empreinte du document manquante.');
    if (!Number.isInteger(document.source_line_count) || document.source_line_count < 1)
        add('coverage','Nombre total de lignes du document non confirmé.');

    if (document.document_type === 'supplier_quotation')
        add('quotation',kind==='order'
            ? 'Ce PDF est une SOUMISSION, pas une confirmation de commande : utilisez le volet Budget ou une véritable commande fournisseur.'
            : 'Soumission fournisseur, pas une commande : valider manuellement avant toute révision du budget.');
    if (kind === 'budget' && hasExistingBudget)
        add('duplicate','Budget initial déjà enregistré : il ne doit pas être remplacé.');
    if (kind === 'order') {
        const po=normalizePurchaseOrder(hints?.po_number);
        if (!po) add('po','Numéro PO absent ou non reconnu.');
        if (!supplier.trim()) add('supplier','Fournisseur non reconnu.');
        const duplicate=po && previousOrders.some(order =>
            normalizePurchaseOrder(order.po_number)===po &&
            normalizeToken(order.supplier)===normalizeToken(supplier));
        if (duplicate) add('duplicate','Cette commande fournisseur et ce PO sont déjà enregistrés.');
    }
    if (document.detected_line_count !== document.source_line_count)
        add('coverage','Certaines lignes du document ne sont pas reconnues.');

    const raw = hints?.suggested_lines;
    if (!Array.isArray(raw) || !raw.length || raw.length > 5000) {
        add('rows','Aucune liste complète d’articles reconnue.');
    }

    // Only selected material rows can form the initial budget; exclusions must
    // be proven from the printed material subtotal rather than silently dropped.
    const selected=Array.isArray(raw)?raw.filter(row=>row.included!==false):[];
    if (kind === 'budget' && selected.length !== document.material_line_count)
        add('coverage','Le nombre d’articles matériels ne concorde pas.');
    if (kind === 'order' && selected.length !== document.source_line_count)
        add('coverage','Une ou plusieurs lignes de commande sont manquantes.');

    let verifiedRows = [];
    if (selected.length) {
        try {
            verifiedRows=parsePurchaseRows(selected,{kind:kind==='budget'?'budget':'order'});
        } catch {
            add('rows','Quantité, unité, prix ou montant invalide.');
        }
        if (verifiedRows.length && verifiedRows.length!==selected.length)
            add('rows','Une ou plusieurs lignes sont manquantes.');
        if (selected.some(row=>row.is_complete===false || row.arithmetic_warning===true))
            add('amount','Un écart ou une valeur incomplète nécessite une vérification.');
        if (selected.some((row,i)=>{
            const verified=verifiedRows[i];
            return !verified || !verified.item_code || !verified.unit ||
                !Number.isFinite(Number(row.unit_cost)) ||
                Math.abs(cents(verified.quantity*verified.unit_cost)-cents(verified.amount))>2;
        })) add('amount','Écart entre quantité × prix unitaire et total.');
    }

    const sum=verifiedRows.reduce((total,row)=>total+cents(row.amount),0);
    const expectedTotal=Number(document.printed_material_total);
    if (!Number.isFinite(expectedTotal) || expectedTotal < 0 ||
        !document.total_verified_from_pdf)
        add('total','Total imprimé dans le PDF non identifié.');
    else if (Math.abs(sum-cents(expectedTotal))>2)
        add('total','Somme des articles différente du total imprimé.');
    if (Array.isArray(evidence.warnings) && evidence.warnings.length)
        add('exception','Le document contient des avertissements d’extraction.');

    return {
        status:issues.length?'attention_required':'auto_commit',
        needs_attention:issues.length>0,
        issues,
        verified_rows:issues.length?[]:verifiedRows,
        document_fingerprint:document.sha256||null,
    };
};

import { supabase } from '../supabaseClient';

const bucket = () => supabase.storage.from('bt-purchase-pdfs');

export async function commitUnifiedPurchase({ entry, site, choice }) {
    let receiptId = entry.receiptId;
    if (!receiptId) {
        const path = [site.company_id, site.id, 'order', entry.id, 'original.pdf'].join('/');
        if (entry.file) {
            const { error: uploadError } = await bucket().upload(path, entry.file, {
                contentType: 'application/pdf', upsert: false,
            });
            if (uploadError && String(uploadError.statusCode || uploadError.status) !== '409' &&
                !/already exists/i.test(uploadError.message || '')) {
                throw new Error('Le PDF n’a pas été déposé. Réessayez.');
            }
        }
        const filename = entry.name.length > 250 ? entry.name.slice(0,246) + '.pdf' : entry.name;
        const { data, error } = await supabase.functions.invoke('verify-purchase-document', {
            body: { companyId: site.company_id, siteId: site.id, documentId: entry.id, filename },
        });
        if (error) {
            let message;
            try { message = (await error.context?.json())?.error; } catch { /* transport error */ }
            throw new Error(message || 'La vérification du PDF a échoué. Réessayez.');
        }
        if (!data?.receiptId) return { ...data, status: 'review' };
        if (entry.plan.sha256 && entry.plan.sha256 !== data.sha256) {
            return { status:'review', issues:['file_changed'] };
        }
        receiptId = data.receiptId;
    }
    const { data, error } = await supabase.rpc('bt_purchase_commit_document_v2', {
        p_receipt_id: receiptId, p_confirm_site: choice.confirmSite === true,
        p_budget_mode: choice.revisionKind || null,
        p_expected_budget_state: entry.budgetState || null,
    });
    if (error) throw new Error(error.message || 'Enregistrement impossible.');
    return { ...data, receiptId };
}

export async function fetchUnifiedPurchasePdf(document) {
    const { data, error } = await bucket().download(document.storage_path);
    if (error || !data) throw new Error('Le PDF original est indisponible.');
    return new Uint8Array(await data.arrayBuffer());
}

import { prepareReviewedBudgetPdf, validateReviewedBudgetPdf } from './reviewedBudgetPdf.js';
import { normalizeToken, parsePurchaseRows } from './purchaseBudget.js';

export function preparePurchaseReview(parsed,site,text,kind) {
    if (kind==='order' && parsed.document?.document_type==='supplier_quotation')
        throw new Error('Ce PDF est une soumission : importez-le dans Budget, pas dans Commandes.');
    const review=prepareReviewedBudgetPdf(parsed,site,text);
    return {...review, expectedCount:'', enteredTotal:'', acceptDifference:false,
        acceptMissingTotal:false, siteConfirmation:'', confirmed:false, kind};
}
export function validatePurchaseReview(review,rows,site,order,previousOrders=[]) {
    const verified=validateReviewedBudgetPdf({...review,rows,site});
    if(review.kind==='order'){
        if(!order?.supplier?.trim() || !order?.poNumber?.trim()) throw new Error('Confirmez le fournisseur et le numéro PO du PDF.');
        if(previousOrders.some(o=>normalizeToken(o.po_number)===normalizeToken(order.poNumber)&&normalizeToken(o.supplier)===normalizeToken(order.supplier))) throw new Error('Cette commande est déjà enregistrée.');
    }
    return verified.rows;
}

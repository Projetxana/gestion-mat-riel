import {normalizeToken} from './purchaseBudget.js';

const matchesMoney=(a,b)=>a!==null&&a!==undefined&&b!==null&&b!==undefined&&
 Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=0.02;

// Pure proof check; no document may be bound to a different PO or quote.
export const validatePurchasePdfEvidence=(parsed,{kind,source,site})=>{
 if(!source?.id||!site?.id||!['quote','order'].includes(kind))
  throw new Error('Référence de document invalide.');
 if(!parsed?.document?.all_pages_processed)
  throw new Error('Toutes les pages du PDF doivent être lisibles.');
 if(kind==='quote'){
  if(parsed.document.document_type!=='supplier_quotation'||
   normalizeToken(parsed.hints?.quote_number)!==normalizeToken(source.quote_number)||
   normalizeToken(parsed.hints?.shipping_project_name)!==normalizeToken(site.name)||
   Number(parsed.document.detected_line_count)!==Number(source.line_count)||
   !matchesMoney(parsed.document.printed_material_total,source.total_amount))
   throw new Error('La soumission PDF diffère du devis enregistré : numéro, chantier, lignes ou total.');
 }else{
  if(parsed.document.document_type==='supplier_quotation'||
   normalizeToken(parsed.hints?.po_number)!==normalizeToken(source.po_number)||
   normalizeToken(parsed.hints?.shipping_project_name)!==normalizeToken(site.name)||
   normalizeToken(parsed.supplier)!==normalizeToken(source.supplier)||
   (source.line_count!==undefined&&
     Number(parsed.document.detected_line_count)!==Number(source.line_count))||
   (source.total_amount!==undefined&&
     !matchesMoney(parsed.document.printed_material_total,source.total_amount)))
   throw new Error('La confirmation PDF diffère de la commande enregistrée : fournisseur, PO, chantier, lignes ou total.');
 }
 return true;
};

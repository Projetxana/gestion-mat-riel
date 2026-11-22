// Deterministic, fail-closed adapter for Flocor's bilingual text-layout PDFs.
// The client-code marker appears on a separate line after the item row.
// Only creates untrusted candidates, not an order or a received quantity.
import {safeSupplierNumber} from './purchaseDocumentLines.js';

const productRow = /^\s*\d{3}\s+(\S+)\s{2,}(.{2,130}?)\s{2,}(UN|FT|PI|EA|PC)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+([.,\d]+)\s+([.,\d]+)\s+([.,\d]+)\s*$/i;
const customerItem = /^\s*No\s+Item\s+Client\.\.\s+(ART\d{4,})\b/i;
const flocorMarker = /COMMANDE\s+DE\s+VTE[\s\S]{0,120}CONFIRMATION/i;
const priceEqual = (a,b)=>a!==null&&b!==null&&Math.abs(a-b)<=.02;

export const extractFlocorLayoutLines=(text,{kind='order',maxLines=300}={})=>{
 const source=String(text||'').slice(0,120000);
 if(!flocorMarker.test(source)||!/CUSTOMER\s+P\.O\.\s+NUMBER/i.test(source))
  return {matched_format:false,items:[],warnings:[]};
 const items=[],warnings=[];
 let rejected=0,last=null;
 for(const line of source.split(/\r?\n/)){
  const row=line.match(productRow);
  if(row){
   if(items.length>=maxLines){warnings.push('Limite de lignes atteinte');break;}
   const supplier_code=row[1],description=row[2].trim(),unit=row[3].toUpperCase();
   const ordered=safeSupplierNumber(row[4]);
   const shipped=safeSupplierNumber(row[5]);
   const bo=safeSupplierNumber(row[6]);
   const price=safeSupplierNumber(row[7]);
   const net=safeSupplierNumber(row[8]);
   if(kind==='delivery'){
    last={item_code:supplier_code,supplier_code,description,unit,
      ordered_qty:ordered,shipped_qty:shipped,supplier_bo_qty:bo,
      is_complete:shipped!==null&&bo!==null,requires_review:true};
   }else{
    // The supplier's NET column may exclude backordered items.
    // The invoice-like net amount is never silently rewritten; the human
    // reviewer must reconcile it against the original ordered amount.
    const expected=ordered!==null&&price!==null
       ? Math.round(ordered*price*100)/100:null;
    last={item_code:supplier_code,supplier_code,description,unit,
      quantity:ordered,unit_cost:price,amount:net,
      is_complete:ordered>0&&price!==null&&net!==null,
      arithmetic_warning:expected!==null&&!priceEqual(expected,net),
      supplier_bo_qty:bo,requires_review:true};
   }
   items.push(last);
   continue;
  }
  const customer=line.match(customerItem);
  if(customer && last)last.item_code=customer[1];
  // Other continuation lines are descriptive only; never infer quantities.
 }
 if(!items.length)warnings.push('Aucune ligne produit Flocor reconnue');
 // An item without a customer ART code still has a unique supplier product code
 // from the primary item row. That is sufficient to record the commitment;
 // it simply will not auto-match a CD estimate line.
 if(items.some(x=>!x.supplier_code || !x.item_code))
  warnings.push('Article sans référence fournisseur exploitable');
 if(items.some(x=>x.arithmetic_warning))
  warnings.push('Montant net possiblement calculé sur les quantités expédiées (BO exclu) : valider le coût engagé');
 return {matched_format:true,items,warnings,rejected_rows:rejected,requires_review:true};
};

export const extractFlocorHeader=(text)=>{
 const source=String(text||'');
 if(!flocorMarker.test(source)||!/CUSTOMER\s+P\.O\.\s+NUMBER/i.test(source))
  return null;
 const m=source.match(/^\s*(P\d{4,})\s{3,}(.+?)\s{3,}\d{1,3}\s+\d{1,3}\b/im);
 return m?{po_number:m[1],shipping_project_name:m[2].trim()}:null;
};

import {normalizeToken} from './purchaseBudget.js';

// Historical budgets do not carry supplier metadata. Only explicitly named
// Flocor quotations qualify; a general estimate is not a negotiated price list.
export function budgetPriceReference({budget,budgetLines=[],revisions=[],quotes=[],quoteLines=[]}) {
 const result={quotes,quoteLines};
 if(!budget || quotes.some(q=>normalizeToken(q.supplier)==='FLOCOR'))return result;
 const replacement=revisions.filter(r=>r.kind==='replacement').sort((a,b)=>Number(b.revision_no)-Number(a.revision_no))[0];
 const base=replacement||budget;
 if(!/^soumission[ _-]+flocor(?:[ _-][\w -]+)?\.pdf$/i.test(String(base.source_name||'').trim()))return result;
 // Never mix extension rows into a supplier reference without provenance.
 if(revisions.some(r=>r.kind==='extension'))return result;
 const rows=budgetLines.filter(r=>normalizeToken(r.item_code)&&r.unit&&Number.isFinite(Number(r.unit_cost))&&r.unit_cost!==null&&r.unit_cost!==''&&Number(r.unit_cost)>=0);
 if(!rows.length)return result;
 const id='budget-reference:'+base.id;
 return {quotes:[...quotes,{id,supplier:'Flocor',quote_number:'Budget importé',source_name:base.source_name,derived_from_budget:true,line_count:rows.length,total_amount:rows.reduce((s,r)=>s+Math.round(Number(r.amount)*100),0)/100}],quoteLines:[...quoteLines,...rows.map(r=>({...r,id:'budget-reference:'+r.id,quote_id:id,derived_from_budget:true}))]};
}

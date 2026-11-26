import {activePriceDocuments} from './unifiedBudgetDocument.js';
import {compareSupplierPrices} from './supplierPriceWatch.js';

// Adapt active documents to the existing comparison engine without persisting
// synthetic quote IDs. All source row IDs remain available for audit.
export function compareUnifiedPrices({site,documents=[],orders=[],orderLines=[],links=[]}){
 const scoped=orders.filter(o=>String(o.company_id)===String(site.company_id)&&String(o.site_id)===String(site.id));
 const orderIds=new Set(scoped.map(o=>String(o.id)));
 const groups=activePriceDocuments(documents,site);
 const quotes=[],quoteLines=[];
 for(const [index,group] of groups.entries()){
  const id='active-price-group:'+index;
  quotes.push({id,supplier:group.supplier,quote_number:'Références actives'});
  for(const row of group.rows)quoteLines.push({...row,quote_id:id});
 }
 return compareSupplierPrices({quotes,quoteLines,orders:scoped,orderLines:orderLines.filter(l=>orderIds.has(String(l.order_id))&&String(l.company_id)===String(site.company_id)&&String(l.site_id)===String(site.id)),links:links.filter(l=>String(l.company_id)===String(site.company_id)&&String(l.site_id)===String(site.id))});
}

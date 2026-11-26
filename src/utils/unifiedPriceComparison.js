import {activePriceDocuments} from './unifiedBudgetDocument.js';
import {compareSupplierPrices, activeSupplierQuotes} from './supplierPriceWatch.js';
import { normalizeToken } from './purchaseBudget.js';

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

export function activeUnifiedPriceReferences({ site, history, revisions, quotes, quoteLines }) {
 const byQuote = new Map(quotes.map(quote => [String(quote.id), quote]));
 const lines = new Map();
 for (const row of quoteLines) {
  const key = String(row.quote_id);
  if (!lines.has(key)) lines.set(key, []);
  lines.get(key).push(row);
 }
 const represented = new Set(history.filter(document => document.quote_id).map(document => String(document.quote_id)));
 const revisionById = new Map(revisions.map(revision => [String(revision.id), revision]));
 const documents = history.filter(document => document.budget_mode && document.status === 'imported')
  .map(document => ({
   ...document, kind:document.budget_mode === 'recovered' ? 'initial' : document.budget_mode,
   revision_no:revisionById.get(String(document.revision_id))?.revision_no || 0,
   supplier:byQuote.get(String(document.quote_id))?.supplier || '',
   rows:lines.get(String(document.quote_id)) || [],
  }));
 for (const revision of revisions) {
  if (revision.kind === 'replacement' && !documents.some(d => String(d.revision_id) === String(revision.id))) {
   documents.push({ ...revision, company_id:site.company_id, site_id:site.id });
  }
 }
 const groups = activePriceDocuments(documents, site);
 const result = { quotes:[], quoteLines:[] };
 const trackedSuppliers = new Set(history.filter(d => d.quote_id).map(d => normalizeToken(d.supplier)));
 for (const quote of activeSupplierQuotes(quotes.filter(q => !represented.has(String(q.id))))) {
  if (trackedSuppliers.has(normalizeToken(quote.supplier))) continue;
  result.quotes.push(quote);
  result.quoteLines.push(...(lines.get(String(quote.id)) || []));
 }
 for (const group of groups) {
  const id = 'active-price-group:' + normalizeToken(group.supplier);
  result.quotes.push({ id,supplier:group.supplier,quote_number:'Références actives' });
  result.quoteLines.push(...group.rows.map(row => ({ ...row,quote_id:id })));
 }
 return result;
}

import {reconcileDocumentRows} from './unifiedPurchaseImport.js';
import {projectedBudgetRevision} from './purchaseBudgetRevisions.js';
import {normalizeToken} from './purchaseBudget.js';

// Produce one immutable intent for an atomic server transaction.
// No financial writes are performed here; the RPC must independently validate
// tenant, source bytes, document identity, revision state and row arithmetic.
export function prepareBudgetDocument({plan,site,hasBudget,revisionKind,activeLines=[],revisions=[]}){
 if(!site?.id||!site.company_id||site.status!=='active')throw Error('Chantier actif requis.');
 if(plan?.status!=='ready'||!['quotation','estimate'].includes(plan.kind))throw Error('Document non validé.');
 if(!/^[a-f0-9]{64}$/i.test(plan.sha256||''))throw Error('Empreinte PDF invalide.');
 if(hasBudget&& !['replacement','extension'].includes(revisionKind))throw Error('Choisir remplacement ou extension.');
 if(!hasBudget&&revisionKind)throw Error('Aucun budget à réviser.');
 const checked=reconcileDocumentRows(plan.rows,plan.printedTotal,{expectedCount:plan.expectedCount});
 if(!checked.valid)throw Error('Lignes ou total non concordants.');
 const kind=hasBudget?revisionKind:'initial';
 if(plan.kind==='quotation'&&(!normalizeToken(plan.supplier)||!normalizeToken(plan.reference)))throw Error('Référence fournisseur requise.');
 const rows=plan.rows.map(r=>({item_code:r.item_code,description:r.description,unit:r.unit,quantity:r.quantity,unit_cost:r.unit_cost,amount:r.amount,customer_alias:r.customer_alias||'',source_sequence:r.source_sequence??null}));
 const budgetRows=rows.map(({customer_alias,source_sequence,...row})=>row);
 return {companyId:site.company_id,siteId:site.id,kind,sha256:plan.sha256,total:checked.total,budgetRows,
  supplierReference:plan.kind==='quotation'?{supplier:plan.supplier,reference:plan.reference,rows}:null,
  projection:projectedBudgetRevision(activeLines,budgetRows,revisions,kind==='replacement'?'replacement':'extension')};
}

// Retain every active extension; replacing the base does not erase them.
// Independent price-only lists are explicit, never inferred from filenames.
// Keep conflicts for the comparison engine instead of choosing one arbitrarily.
export function activePriceDocuments(documents,site){
 const scoped=documents.filter(d=>String(d.company_id)===String(site.company_id)&&String(d.site_id)===String(site.id));
 const latestBase=scoped.filter(d=>d.kind==='initial'||d.kind==='replacement').sort((a,b)=>Number(b.revision_no)-Number(a.revision_no))[0];
 const active=scoped.filter(d=>d===latestBase||d.kind==='extension'||d.kind==='price_only');
 const groups=new Map();
 for(const d of active){
  if(!normalizeToken(d.supplier))continue;
  const key=normalizeToken(d.supplier);
  if(!groups.has(key))groups.set(key,{supplier:d.supplier,documents:[],rows:[]});
  const g=groups.get(key);g.documents.push(d.id);
  for(const row of d.rows||[])g.rows.push({...row,document_id:d.id});
 }
 return [...groups.values()];
}

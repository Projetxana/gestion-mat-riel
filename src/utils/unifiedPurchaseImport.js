// Pure planning layer. No database writes or network calls.
import {extractFlocorQuotationHeader,extractFlocorQuotationLines} from './flocorQuotationParser.js';
import {extractFlocorCredit,isPurchaseCredit} from './purchaseDocumentIdentity.js';
import {extractFlocorHeader} from './flocorLayoutParser.js';
import {extractCdEstimateHeader} from './cdEstimateLayoutParser.js';
import {assessDigitalPdf} from './pdfImportEvidence.js';
import {normalizeToken} from './purchaseBudget.js';

export function classifyPurchasePdf(text) {
 const source=String(text||'');
 const header=source.slice(0,2000);
 // Credit first: a credit also contains the word confirmation.
 if(isPurchaseCredit(source))return 'credit';
 if(/^\s*(?:facture|invoice)\b/im.test(header))return 'invoice';
 if(/^\s*(?:bon de livraison|delivery note|packing slip)\b/im.test(header))return 'delivery';
 if(extractFlocorQuotationHeader(source))return 'quotation';
 if(extractFlocorHeader(source)&&/\bFLOCOR\b/i.test(header))return 'order';
 if(extractCdEstimateHeader(source))return 'estimate';
 return 'unknown';
}

export function reconcileDocumentRows(rows,printedTotal,{credit=false,expectedCount}={}) {
 const issues=[];
 const cents=n=>Math.round(n*100);
 if(!Array.isArray(rows)||rows.length===0)return {valid:false,issues:['missing_rows'],total:null};
 if(!Number.isInteger(expectedCount)||expectedCount!==rows.length)issues.push('coverage');
 let total=0;
 for(const row of rows){
  const vals=[row.quantity,row.unit_cost,row.amount];
  if(!vals.every(v=>typeof v==='number'&&Number.isFinite(v))||
     !String(row.item_code||'').trim()||!String(row.unit||'').trim()||
     !String(row.description||'').trim()){
   issues.push('invalid_row');continue;
  }
  const [q,p,a]=vals;
  if(p<0||(credit?q>=0||a>0:q<=0||a<0))issues.push('sign');
  if(Math.abs(cents(q*p)-cents(a))>2)issues.push('arithmetic');
  total+=cents(a);
 }
 if(typeof printedTotal!=='number'||!Number.isFinite(printedTotal)||Math.abs(total-cents(printedTotal))>2)issues.push('subtotal');
 return {valid:issues.length===0,issues:[...new Set(issues)],total:total/100};
}

export function planPurchasePdf(read,{site,aliases=[],knownHashes=[],knownDocuments=[],hasBudget=false}={}) {
 const kind=classifyPurchasePdf(read?.text);
 const result={kind,sha256:read?.sha256||'',status:'blocked',issues:[],rows:[],action:null};
 const finish=(status,issues,extra={})=>({...result,status,issues,...extra});
 if(!site?.id||!site.company_id||site.status!=='active')return finish('blocked',['inactive_site']);
 if(!read?.digitalText||!read.allPagesProcessed||!Number.isInteger(read.numPages)||read.numPages<1||!/^[a-f0-9]{64}$/i.test(result.sha256))return finish('blocked',['incomplete_pdf']);
 if(knownHashes.includes(result.sha256))return finish('duplicate',['same_pdf']);
 if(kind==='invoice'||kind==='delivery')return finish('non_financial',['not_a_commitment']);
 if(kind==='unknown')return finish('blocked',['unknown_format']);
 let rows,printedTotal,expectedCount,supplier='',reference='',project='',po='',originalReference='',parserIssues=[];
 if(kind==='credit'){
  const parsed=extractFlocorCredit(read.text);
  if(!parsed?.complete)return finish('blocked',['unverified_credit']);
  ({rows,total:printedTotal,reference,po_number:po,shipping_project_name:project,original_supplier_order_number:originalReference}=parsed);
  expectedCount=rows.length;supplier='Flocor';
 }else if(kind==='quotation'){
  const parsed=extractFlocorQuotationLines(read.text);
  rows=parsed.items;printedTotal=parsed.printed_material_total;expectedCount=parsed.source_line_count;
  supplier='Flocor';reference=parsed.quotation_header?.quote_number||'';project=parsed.quotation_header?.shipping_project_name||'';
  parserIssues=parsed.warnings||[];
 }else{
  const parsed=assessDigitalPdf(read,{kind:kind==='estimate'?'budget':'order',site,hasExistingBudget:false});
  rows=parsed.hints?.suggested_lines?.filter(r=>r.included!==false)||[];
  printedTotal=parsed.document.printed_material_total;expectedCount=kind==='estimate'?parsed.document.material_line_count:parsed.document.source_line_count;
  supplier=parsed.supplier;project=parsed.hints.shipping_project_name;po=parsed.hints.po_number;reference=parsed.hints.supplier_order_number;
  parserIssues=parsed.issues.filter(i=>i.code!=='project'&&i.code!=='duplicate').map(i=>i.code);
 }
 const checked=reconcileDocumentRows(rows,printedTotal,{credit:kind==='credit',expectedCount});
 const extra={rows,supplier,reference,project,po,originalReference,total:checked.total};
 if(reference&&knownDocuments.some(d=>String(d.company_id)===String(site.company_id)&&normalizeToken(d.supplier)===normalizeToken(supplier)&&d.kind===kind&&normalizeToken(d.reference)===normalizeToken(reference)))return finish('duplicate',['same_reference'],extra);
 if(!checked.valid||parserIssues.length)return finish('review',[...checked.issues,...parserIssues],extra);
 if(['order','credit','quotation'].includes(kind)&&!reference)return finish('review',['missing_reference'],extra);
 if(['order','credit'].includes(kind)&&!po)return finish('review',['missing_po'],extra);
 const normalized=normalizeToken(project);
 const matches=aliases.filter(a=>String(a.company_id)===String(site.company_id)&&normalizeToken(a.supplier)===normalizeToken(supplier)&&normalizeToken(a.name)===normalized);
 const siteMatches=normalized.length>=3&&(normalized===normalizeToken(site.name)||(matches.length>0&&matches.every(a=>String(a.site_id)===String(site.id))));
 const action=kind==='quotation'||kind==='estimate'?(hasBudget?'choose_budget_revision':'create_budget'):kind==='credit'?'add_credit':'add_order';
 if(!siteMatches)return finish('confirm',['confirm_site'],{...extra,action});
 if(action==='choose_budget_revision')return finish('confirm',['choose_revision'],{...extra,action});
 return finish('ready',[],{...extra,action});
}

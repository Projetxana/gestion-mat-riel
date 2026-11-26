// Pure, deterministic unit-price monitoring. No fuzzy description auto-match.
// Quotes are pricing references, NEVER purchase orders or accounting spend.
import {normalizeToken} from './purchaseBudget.js';

const cents=n=>Math.round(Number(n)*100);
const unitKey=value=>{
 const unit=normalizeToken(value);
 if(['FT','PI','PIED','PIEDS','FEET','FOOT'].includes(unit))return 'PI';
 if(['UN','EA','EACH','PCS','PC','UNIT'].includes(unit))return 'UN';
 return unit;
};
const code=value=>normalizeToken(value);
const normalizedSupplier=value=>normalizeToken(value);
const numeric=n=>n!==null&&n!==''&&Number.isFinite(Number(n))?Number(n):null;
const rounding4=n=>Math.round(n*10000)/10000;

export const activeSupplierQuotes = (quotes = []) => {
 const latest=new Map();
 const sorted=[...quotes].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||
  String(b.id).localeCompare(String(a.id)));
 for(const quote of sorted){
  const key=normalizedSupplier(quote.supplier);
  if(key&&!latest.has(key))latest.set(key,quote);
 }
 return [...latest.values()];
};

export const compareSupplierPrices = ({
 quotes=[],quoteLines=[],orders=[],orderLines=[],links=[],
}={})=>{
 const active=activeSupplierQuotes(quotes);
 const quoteBySupplier=new Map(active.map(q=>[normalizedSupplier(q.supplier),q]));
 const ordersById=new Map(orders.map(o=>[String(o.id),o]));
 const linksByOrderId=new Map(links.map(link=>[String(link.order_line_id),link]));
 const result=[];
 for(const orderLine of orderLines){
  if (Number(orderLine.quantity) < 0) continue;
  const order=ordersById.get(String(orderLine.order_id));
  const supplier=normalizedSupplier(order?.supplier);
  const quote=quoteBySupplier.get(supplier);
  const base={...orderLine,supplier:order?.supplier||'',poNumber:order?.po_number||'',
   quoteNumber:quote?.quote_number||'',quoteId:quote?.id||null,
   reference:null,referenceUnitCost:null,deltaPerUnit:null,impact:null,
   status:'no_reference',matchType:null};
  if(!quote){
   result.push({...base,status:active.length?'other_supplier':'no_reference'});
   continue;
  }
  const priced=quoteLines.filter(line=>String(line.quote_id)===String(quote.id));
  const manual=linksByOrderId.get(String(orderLine.id));
  let candidates=[];
  if(manual){
   candidates=priced.filter(line=>String(line.id)===String(manual.quote_line_id));
   if(!candidates.length){result.push({...base,status:'stale_link'});continue;}
  }else{
   const source=code(orderLine.item_code);
   if(source)candidates=priced.filter(line=>source===code(line.item_code)||
    (line.customer_alias&&source===code(line.customer_alias)));
  }
  // A product absent from the original quotation is not a failed SKU match:
  // it is a separately identifiable, already committed purchase for which
  // no negotiated unit-price baseline exists.
  if(!candidates.length){result.push({...base,status:'not_in_quote'});continue;}
  const compatible=candidates.filter(line=>unitKey(line.unit)===unitKey(orderLine.unit));
  if(!compatible.length){
   result.push({...base,status:'unit_mismatch',candidateCount:candidates.length});continue;
  }
  // One code can appear on multiple quote lines. Never guess a price if
  // they disagree, even if the descriptions look similar.
  const distinct=[...new Set(compatible.map(line=>Number(line.unit_cost).toFixed(4)))];
  if(distinct.length!==1){
   result.push({...base,status:'ambiguous',candidateCount:compatible.length});continue;
  }
  const matched=compatible[0],actual=numeric(orderLine.unit_cost),baseline=numeric(matched.unit_cost);
  const quantity=numeric(orderLine.quantity);
  if(actual===null || baseline===null || quantity===null || !(quantity>0)){
   result.push({...base,status:'unpriced'});continue;
  }
  const difference=rounding4(actual-baseline);
  const impact=Math.max(0,cents(difference*quantity))/100;
  result.push({...base,status:difference>0?'above':difference<0?'below':'ok',
   reference:matched,referenceUnitCost:baseline,deltaPerUnit:difference,
   impact,matchType:manual?'manual':matched.customer_alias&&
    code(orderLine.item_code)===code(matched.customer_alias)?'alias':'sku'});
 }
 const overpriced=result.filter(line=>line.status==='above');
 const needsReview=result.filter(line=>[
  'ambiguous','unit_mismatch','stale_link','unpriced',
 ].includes(line.status));
 const notInQuote=result.filter(line=>line.status==='not_in_quote');
 return {lines:result,overpriced,needsReview,notInQuote,
  notInQuoteCount:notInQuote.length,
  notInQuoteAmount:notInQuote.reduce((sum,row)=>{
   const committed=numeric(row.amount);
   return sum+(committed!==null?cents(committed):cents((numeric(row.quantity)||0)*(numeric(row.unit_cost)||0)));
  },0)/100,
  overpriceCount:overpriced.length,
  impact:overpriced.reduce((sum,row)=>sum+cents(row.impact),0)/100};
};

export const quoteImportDate = input => {
 const value=String(input||'').trim();
 const result=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
 if(!result)return null;
 const [,mm,dd,yy]=result;
 const year=yy.length===2?2000+Number(yy):Number(yy);
 const date=new Date(Date.UTC(year,Number(mm)-1,Number(dd)));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==Number(mm)-1||
  date.getUTCDate()!==Number(dd))return null;
 return year+'-'+mm.padStart(2,'0')+'-'+dd.padStart(2,'0');
};

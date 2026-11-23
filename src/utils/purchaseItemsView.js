// Read-only view model of the current budget and identifiable orders.
// Never use per-product matching to calculate global committed spending.
import {normalizeCatalogCode,normalizeToken} from './purchaseBudget.js';

const unitKey=value=>{
 const raw=normalizeToken(value);
 if(['FT','PI','PIED','PIEDS','FOOT','FEET'].includes(raw))return 'PI';
 if(['UN','EA','EACH','PCS','PC','UNIT'].includes(raw))return 'UN';
 return raw;
};
const moneyCents=value=>Math.round(Number(value||0)*100);
const validNumber=value=>Number.isFinite(Number(value))?Number(value):0;

export const buildPurchaseItemsView=(budgetLines=[],comparisons={matched:[]})=>{
 const groups=new Map();
 for(const line of budgetLines){
  const sku=normalizeCatalogCode(line.item_code);
  if(!sku)continue;
  const key=sku+':'+unitKey(line.unit);
  const list=groups.get(key)||[];
  list.push(line);
  groups.set(key,list);
 }
 const rows=(comparisons.matched||[]).map(group=>{
  const sources=groups.get(group.key)||[];
  const qty=validNumber(group.estimatedQty);
  const ordered=validNumber(group.orderedQty);
  const total=validNumber(group.estimatedAmount);
  const priceCandidates=sources.map(x=>Number(x.unit_cost)).filter(Number.isFinite);
  const distinctPrices=new Set(priceCandidates.map(v=>v.toFixed(4)));
  const approximate=distinctPrices.size>1||!priceCandidates.length;
  const unitPrice=!approximate?priceCandidates[0]:(qty>0?total/qty:0);
  const kind=ordered>qty?'over':ordered===0?'none':ordered>=qty?'complete':'partial';
  return {
   ...group,
   quotedUnitPrice:unitPrice,approximateUnitPrice:approximate,
   quotedTotal:total,committedMatched:validNumber(group.orderedAmount),
   remainingQty:Math.max(0,qty-ordered),extraQty:Math.max(0,ordered-qty),
   status:kind,
   // Multiple lines of the same SKU/unit are grouped, never silently dropped.
   sourceLineCount:sources.length,
   searchText:normalizeToken([group.item_code,group.description,
    ...sources.map(x=>x.description)].join(' ')),
  };
 });
 return {
  rows,
  counts:{
   references:rows.length,quotedLines:budgetLines.length,
   withOrders:rows.filter(x=>x.orderedQty>0).length,
   noOrders:rows.filter(x=>x.orderedQty===0).length,
   over:rows.filter(x=>x.status==='over').length,
  },
  matchedAmount:rows.reduce((sum,x)=>sum+moneyCents(x.committedMatched),0)/100,
 };
};

export const filterPurchaseItems=(rows=[],query='',filter='all')=>{
 const term=normalizeToken(query).trim();
 return rows.filter(row=>
  (!term||row.searchText.includes(term))&&(
   filter==='all'||
   filter==='ordered'&&row.orderedQty>0||
   filter==='none'&&row.orderedQty===0||
   filter==='over'&&row.status==='over'||
   filter==='remaining'&&row.remainingQty>0
  )
 );
};

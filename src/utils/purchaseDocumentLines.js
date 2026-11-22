// Low-trust structured candidates from supplier PDF/photo Markdown.
// Deliberately accepts only explicit table headings and never guesses rows from prose.
// Output is always draft: validation of unit/price and shipping project is mandatory.
import { normalizeToken, parseDecimal } from './purchaseBudget.js';

const head = value => normalizeToken(String(value || '').replace(/<[^>]*>/g, ''));
const known = {
  item_code: ['CODECLIENT','ARTCLIENT','ARTICLECLIENT','ITEMCLIENT','CLIENTITEM','CLIENTCODE',
    'CUSTOMERITEM','CUSTOMERITEMNO','ITEMCODE','PRODUCTCODE','CODEARTICLE','ARTICLENO',
    'ARTICLE','SKU','CODE','REF'],
  supplier_code: ['SUPPLIERCODE','VENDORITEM','VENDORCODE','ITEMNO','PRODUCTNO','FOURNISSEUR'],
  description: ['DESCRIPTION','DESIGNATION','PRODUIT','PRODUCT','ITEMDESCRIPTION',
    'DESCRIPTIONPRODUIT','DESCRIPTIONARTICLE'],
  unit: ['UNIT','UNITOFMEASURE','UOM','UM','UNITE','UNITEDEMESURE','MEASURE'],
  quantity: ['QTY','QTYORDERED','QUANTITY','QUANTITE','QTE','ORDERED','QUANTITYORDERED',
    'QTECOMMANDEE','QTCE','ORDERQTY','QTYORD'],
  unit_cost: ['UNITPRICE','PRIXUNITAIRE','UNITCOST','COUTUNITAIRE','PRICEUNIT',
    'PRIXNET','PRICEEACH','PU','PRIX'],
  amount: ['AMOUNT','NETAMOUNT','LINETOTAL','EXTENDEDPRICE','TOTALPRICE','MONTANT',
    'MONTANTNET','PRIXTOTAL','TOTALHT','TOTAL'],
  shipped: ['SHIPPED','QTYSHIPPED','QUANTITYSHIPPED','SHIPQTY','EXPEDIE','EXPEDIEE',
    'QTEEXPEDIEE','QTELIVREE','LIVRE','LIVREE','RECU','RECEIVED','QTYRECEIVED'],
  bo: ['BO','BACKORDER','BACKORDERED','BACKORDERQTY','ENSOUFFRANCE','QTEENSOUFFRANCE',
    'RELIQUAT','BACKORDERS'],
};

const classify = value => {
 const normalized = head(value);
 // Longer aliases first avoids accidentally classifying a shipped quantity as ordered.
 return Object.keys(known).find(key => known[key].includes(normalized)) || null;
};
const cellsOf = row => String(row).trim()
 .replace(/^\|/,'').replace(/\|$/,'')
 .split(/(?<!\\)\|/g).map(cell => cell.replace(/\\\|/g,'|').trim().replace(/\*\*/g,''));
const isSeparator = row => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row);
const isSummary = description =>
 /^(?:SUBTOTAL|TOTAL|TOTALHT|TOTALTAXES|TAXES|TPS|TVQ|GST|QST|FREIGHT|TRANSPORT|SHIPPING|MAINDOEUVRE|LABOUR|LABOR|SOUSPRESTATION|SOUSCONTRAT|FIXEDPRICE|PRIXFIXE)$/i
  .test(head(description));

const normalizedCell = value => String(value ?? '')
 .replace(/\u00a0|\u202f/g,' ')
 .replace(/\bCAD\b|\bUSD\b|\$/gi,'')
 .trim();
// Never silently turn ambiguous "1,000" into 1.000 or 1000.
export const safeSupplierNumber = raw => {
 const value = normalizedCell(raw);
 if (!value || !/^-?[\d., ]+$/.test(value)) return null;
 const compact = value.replace(/ /g,'');
 if (/^-?\d{1,3}[.,]\d{3}$/.test(compact)) return null;
 const result = parseDecimal(value);
 return Number.isFinite(result) && result >= 0 ? result : null;
};
const columnValue = (cells, columns, name) => columns[name] === undefined
 ? '' : (cells[columns[name]] ?? '');

const validColumns = (headers, kind) => {
 const indices={};
 headers.forEach((h,i)=> {
  const k=classify(h);
  if(k && indices[k]===undefined) indices[k]=i;
 });
 // A table must include descriptions, plus either a client reference or supplier reference,
 // and quantity/price for orders or explicitly shipped quantity for deliveries.
 const codePresent=indices.item_code!==undefined || indices.supplier_code!==undefined;
 if(!codePresent || indices.description===undefined) return null;
 if(kind==='order' && (indices.quantity===undefined ||
   (indices.unit_cost===undefined && indices.amount===undefined)))return null;
 if(kind==='delivery' && indices.shipped===undefined)return null;
 return indices;
};
export const extractSupplierTableLines=(markdown,{kind='order',maxLines=300}={})=>{
 if(!['order','delivery'].includes(kind))throw new Error('Type de document invalide');
 const rows=String(markdown||'').slice(0,120000).replace(/\r\n?/g,'\n').split('\n');
 const items=[],warnings=[];
 let tableCount=0,rejectedRows=0;
 for(let i=0;i<rows.length-2;i++){
  const h=rows[i],sep=rows[i+1];
  if(!h.includes('|') || !isSeparator(sep))continue;
  const headers=cellsOf(h);
  const columns=validColumns(headers,kind);
  if(!columns)continue;
  tableCount++;
  i++;
  for(;i+1<rows.length;i++){
   const row=rows[i+1];
   if(!row.includes('|') || isSeparator(row))break;
   const cells=cellsOf(row);
   if(cells.length!==headers.length){rejectedRows++;continue;}
   const item_code=columnValue(cells,columns,'item_code').slice(0,100);
   const supplier_code=columnValue(cells,columns,'supplier_code').slice(0,100);
   const description=columnValue(cells,columns,'description').slice(0,500);
   if(isSummary(description))continue;
   if(!description || (!item_code&&!supplier_code)){rejectedRows++;continue;}
   if(items.length>=maxLines){warnings.push('Limite de lignes atteinte : vérifier les pages suivantes');break;}
   const unit=columnValue(cells,columns,'unit').toUpperCase().slice(0,30);
   if(kind==='order'){
    const quantity=safeSupplierNumber(columnValue(cells,columns,'quantity'));
    const unit_cost=safeSupplierNumber(columnValue(cells,columns,'unit_cost'));
    const amount=safeSupplierNumber(columnValue(cells,columns,'amount'));
    const computed=Number.isFinite(quantity)&&Number.isFinite(unit_cost)
     ? Math.round(quantity*unit_cost*100)/100 : null;
    // We do not silently correct supplier math or infer missing money values.
    const consistent=Number.isFinite(amount)&&Number.isFinite(computed)
      ? Math.abs(amount-computed)<=Math.max(.02,amount*.02) : false;
    const complete=quantity>0 && unit.length>0 &&
      Number.isFinite(unit_cost)&&Number.isFinite(amount);
    items.push({item_code:item_code||supplier_code,supplier_code,description,unit,
      quantity,unit_cost,amount,is_complete:complete,
      arithmetic_warning:complete&&!consistent,requires_review:true});
   } else {
    const ordered=safeSupplierNumber(columnValue(cells,columns,'quantity'));
    const shipped=safeSupplierNumber(columnValue(cells,columns,'shipped'));
    const boRaw=columnValue(cells,columns,'bo');
    const bo=boRaw ? safeSupplierNumber(boRaw) : null;
    items.push({item_code:item_code||supplier_code,supplier_code,description,unit,
      ordered_qty:ordered,shipped_qty:shipped,supplier_bo_qty:bo,
      is_complete:shipped!==null && (boRaw==='' || bo!==null),
      requires_review:true});
   }
  }
 }
 if(!tableCount)warnings.push('Aucun tableau d’articles avec des colonnes reconnues');
 if(rejectedRows)warnings.push(rejectedRows+' ligne(s) non interprétée(s)');
 if(items.some(item=>!item.is_complete))warnings.push('Des quantités, unités ou prix manquent : validation obligatoire');
 if(items.some(item=>item.arithmetic_warning))
  warnings.push('Un ou plusieurs montants ne correspondent pas à quantité × prix unitaire');
 return {kind,items,table_count:tableCount,rejected_rows:rejectedRows,warnings,requires_review:true};
};

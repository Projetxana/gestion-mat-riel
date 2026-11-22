// Draft reader for the CD multi-scenario estimate layout (6-page sample).
// Never treat a grouped estimate as a confirmed order or accounting invoice.
import {safeSupplierNumber} from './purchaseDocumentLines.js';

const rowRe=/^\s*CD\s*(\d{4,5})\s+(.+?)\s{2,}(-?[\d\s,]+)\s+([A-Z]{2})\s{2,}([\d\s,]+)\s*\/\s*([A-Z]{2})\s+\d+(?:[.,]\d+)?\s+([\d\s,]+)\s*\/\s*([A-Z]{2})\s+(-?[\d\s,]+)\s*$/i;
const excludedCategory=category=>/FABRICATION|AUTRES OPS|LOCATION|SOUS.TRAITANCE|MAIN.D.OEUVRE|PRIX FIXE/i.test(category);
const asNumber=raw=>safeSupplierNumber(raw);

export const extractCdEstimateHeader=text=>{
 const source=String(text||'');
 if(!/MULTI.SC[ÉE]NARIO/i.test(source)||!/Quantit[ée].*Prix.*Co[uû]t net/i.test(source))
  return null;
 const m=source.match(/^\s*\d{4}-\d{3}\s+(.+?)\s+\[\s*MULTI.SC[ÉE]NARIO\s*\]/im);
 return m?{shipping_project_name:m[1].trim()}:null;
};
export const extractCdEstimateLines=(text,{maxLines=500}={})=>{
 const source=String(text||'').slice(0,150000);
 const header=extractCdEstimateHeader(source);
 if(!header)return {matched_format:false,items:[],warnings:[]};
 const items=[],warnings=[];
 let category='',excluded=0,rejected=0,needsUnitCheck=0;
 for(const line of source.split(/\r?\n/)){
  const match=line.match(rowRe);
  if(match){
   const code=match[1],description=match[2].trim();
   const quantity=asNumber(match[3]);
   const unit=match[4];
   const quotedPrice=asNumber(match[5]);
   const priceBasis=match[6];
   const amount=asNumber(match[9]);
   if(!quantity||amount===null||quantity<0){
    rejected++;continue;
   }
   if(items.length>=maxLines){warnings.push('Limite de lignes atteinte');break;}
   const derivedPrice=Math.round(amount/quantity*1000000)/1000000;
   const nominal=priceBasis===unit?quotedPrice:
     priceBasis==='CT'&&unit==='UN'&&quotedPrice!==null?quotedPrice/100:null;
   const difference=nominal===null?0:Math.abs(nominal*quantity-amount);
   const needsReview=priceBasis!==unit || difference>.02 || excludedCategory(category);
   if(priceBasis!==unit)needsUnitCheck++;
   const included=!excludedCategory(category);
   if(!included)excluded++;
   items.push({
    item_code:'CD '+code,description,unit,quantity,unit_cost:derivedPrice,amount,
    source_category:category,source_price_unit:priceBasis,
    source_unit_price:quotedPrice,
    pricing_note:priceBasis!==unit
      ? 'Prix source par '+priceBasis+' : coût effectif par '+unit+' déduit du montant total'
      : '',
    arithmetic_warning:needsReview && difference>.02,
    is_complete:quantity>0 && Number.isFinite(derivedPrice) && amount>=0,
    included,requires_review:true,
   });
   continue;
  }
  if(/^\s*CD\s*\d/.test(line))rejected++;
  const trimmed=line.trim();
  if(trimmed && trimmed.length<68 && trimmed===trimmed.toUpperCase() &&
    /^[A-ZÀ-ÖØ-Þ0-9 .,'&/-]+$/.test(trimmed) &&
    !/^(?:DESCRIPTION|MATÉRIEL|LES SYST|PAGE|CD |N\.B)/.test(trimmed) &&
    !trimmed.includes(' / ')) category=trimmed;
 }
 if(rejected)warnings.push(rejected+' ligne(s) du rapport à examiner manuellement');
 if(excluded)warnings.push(excluded+' ligne(s) hors achats matériels exclue(s) par défaut');
 if(needsUnitCheck)warnings.push(needsUnitCheck+' ligne(s) avec unités de prix différentes : vérifier CT, LG et quantités');
 warnings.push('Budget estimatif : contrôler le total et les forfaits du rapport avant de figer le budget');
 return {matched_format:true,items,warnings,requires_review:true,
  project_name:header.shipping_project_name,excluded_rows:excluded,rejected_rows:rejected};
};

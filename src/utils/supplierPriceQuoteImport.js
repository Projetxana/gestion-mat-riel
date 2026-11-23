import {normalizeToken,parseDecimal,parsePurchaseRows} from './purchaseBudget.js';
const moneyCents=value=>Math.round(Number(value)*100);

export const validateSupplierQuoteDraft = ({
 rows=[],site,documentSite='',siteConfirmation='',expectedCount='',
 printedTotal=null,enteredTotal='',quoteNumber='',supplier='Flocor',confirmed=false,
}={})=>{
 if(!site?.id||site.status!=='active'||!site.company_id)
  throw new Error('Un chantier actif est requis.');
 if(!String(quoteNumber||'').trim()||!String(supplier||'').trim())
  throw new Error('Numéro de soumission et fournisseur obligatoires.');
 const matches=Boolean(normalizeToken(documentSite)) &&
  normalizeToken(documentSite)===normalizeToken(site.name);
 if(!matches && String(siteConfirmation).trim().toLocaleLowerCase('fr-CA') !==
  String(site.name||'').trim().toLocaleLowerCase('fr-CA'))
  throw new Error('Recopiez le nom exact du chantier pour confirmer la correspondance.');
 if(!confirmed)throw new Error('Confirmez les références, prix, unités et lignes avec le document original.');
 if(!Array.isArray(rows)||!rows.length||rows.length>5000)
  throw new Error('Aucune liste complète de prix.');
 if(!/^\d+$/.test(String(expectedCount).trim())||Number(expectedCount)!==rows.length)
  throw new Error('Confirmez le nombre exact de produits figurant dans la soumission.');
 const parsed=parsePurchaseRows(rows,{kind:'budget'});
 const cleaned=parsed.map((row,index)=>{
  if(!row.item_code.trim())throw new Error('Ligne '+(index+1)+' : code fournisseur manquant.');
  const delta=Math.abs(moneyCents(row.quantity*row.unit_cost)-moneyCents(row.amount));
  if(delta>2)throw new Error('Ligne '+(index+1)+' : quantité × prix unitaire incohérent.');
  const source=rows[index];
  return {...row,customer_alias:String(source.customer_alias||'').slice(0,100),
   source_sequence:Number.isInteger(Number(source.source_sequence))?
    Number(source.source_sequence):null};
 });
 const total=cleaned.reduce((sum,row)=>sum+moneyCents(row.amount),0);
 const expected=printedTotal!==null?Number(printedTotal):parseDecimal(enteredTotal);
 if(!Number.isFinite(expected)||expected<0)
  throw new Error('Indiquez le sous-total hors taxes inscrit sur la soumission.');
 if(Math.abs(total-moneyCents(expected))>2)
  throw new Error('Le total des articles ne concorde pas avec le sous-total de la soumission.');
 return {rows:cleaned,amount:total/100};
};

import {normalizeToken,parseDecimal} from './purchaseBudget.js';

export const sameSupplierDocument=(a,b)=>{
 if(a.file_sha256&&b.file_sha256&&a.file_sha256===b.file_sha256)return true;
 const ref=normalizeToken(a.supplier_order_number);
 return !!ref&&ref===normalizeToken(b.supplier_order_number)&&normalizeToken(a.supplier)===normalizeToken(b.supplier)&&(a.document_kind||'order')===(b.document_kind||'order');
};
export const groupPurchaseDocuments=(orders,lines)=>{
 const groups=new Map();
 for(const order of orders){
  const key=JSON.stringify([normalizeToken(order.supplier),normalizeToken(order.po_number)]);
  if(!groups.has(key))groups.set(key,{key,supplier:order.supplier,po_number:order.po_number,documents:[],total:0});
  const group=groups.get(key);
  group.documents.push(order);
  group.total+=lines.filter(l=>String(l.order_id)===String(order.id)).reduce((sum,l)=>sum+Math.round(Number(l.amount)*100),0);
 }
 return [...groups.values()].map(g=>({...g,total:g.total/100}));
};
export const parseCreditNumber=value=>{
 const raw=String(value??'').trim();
 return parseDecimal(raw.endsWith('-')?'-'+raw.slice(0,-1):raw);
};
export const extractFlocorCredit=text=>{
 const source=String(text||'');
 if(!/note\s+de\s+cr[ée]dit/i.test(source.slice(0,1500))||!/FLOCOR/i.test(source.slice(0,1500)))return null;
 const reference=source.match(/NOTE\s+DE\s+CR[ÉE]DIT\s+CONFIRMATION\s+(\d{5,})/i)?.[1]||'';
 const header=source.match(/^\s*(P\d{4,})\s{2,}(.+?)\s{2,}\d{1,3}\s+\d{1,3}\s+(\d{5,})\b/im);
 const rows=[];
 let anchors=0;
 for(const line of source.split(/\r?\n/)){
  if(/^\s*\d{3}\s+\S+\s+/.test(line))anchors++;
  const m=line.match(/^\s*\d{3}\s+(\S+)\s+(.+?)\s+(UN|FT|PI|EA|PC)\s+([\d.,]+-)\s+([\d.,]+-)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+-)\s*$/i);
  if(!m)continue;
  const quantity=parseCreditNumber(m[4]),unit_cost=parseCreditNumber(m[7]),amount=parseCreditNumber(m[8]);
  if(!(quantity<0&&unit_cost>=0&&amount<0&&Math.abs(Math.round(quantity*unit_cost*100)-Math.round(amount*100))<=2))continue;
  rows.push({item_code:m[1],description:m[2],unit:m[3],quantity,unit_cost,amount});
 }
 const total=parseCreditNumber(source.match(/Sous-total\s*\/\s*Sub-Total\s+([\d.,]+-)/i)?.[1]);
 const complete=!!reference&&!!header&&rows.length>0&&anchors===rows.length&&Number.isFinite(total)&&Math.round(total*100)===rows.reduce((s,r)=>s+Math.round(r.amount*100),0);
 return {reference,po_number:header?.[1]||'',shipping_project_name:header?.[2]||'',original_supplier_order_number:header?.[3]||'',rows,total,complete};
};

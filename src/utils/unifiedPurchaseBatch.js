import {planPurchasePdf} from './unifiedPurchaseImport.js';

// Sequential analysis only: no writes. The integration must revalidate
// against authoritative database state immediately before every commit.
export async function planPurchaseBatch(files,{readPdf,context,onProgress,maxFiles=30}={}){
 if(typeof readPdf!=='function')throw new Error('Lecteur PDF requis.');
 const list=Array.from(files||[]);
 if(list.length>maxFiles)throw new Error('Maximum '+maxFiles+' PDF par lot.');
 const seen=new Set((context?.knownHashes||[]).map(h=>String(h).toLowerCase()));
 const results=[];
 let budgetReserved=Boolean(context?.hasBudget);
 for(const [index,file] of list.entries()){
  let plan;
  try{
   const read=await readPdf(file);
   plan=planPurchasePdf(read,{...context,knownHashes:[...seen],hasBudget:budgetReserved});
   if(plan.sha256&&plan.status!=='duplicate'){
    seen.add(plan.sha256.toLowerCase());
    // Never allow a second initial budget in the same batch, even when
    // the first still needs confirmation.
    if(['ready','confirm'].includes(plan.status)&&plan.action==='create_budget')budgetReserved=true;
   }
  }catch{
   plan={kind:'unknown',status:'blocked',issues:['read_failed'],rows:[],action:null};
  }
  results.push({id:index,file,name:String(file.name||'Document PDF'),plan});
  onProgress?.({completed:index+1,total:list.length});
 }
 return results;
}

export function summarizePurchaseBatch(results){
 const counts={ready:0,confirm:0,review:0,blocked:0,duplicate:0,non_financial:0,imported:0,failed:0};
 let netCents=0;
 for(const entry of results){
  const {status,action,total}=entry.plan;
  if(Object.hasOwn(counts,status))counts[status]++;
  if(status==='imported'&&['add_order','add_credit'].includes(action)&&Number.isFinite(total))netCents+=Math.round(total*100);
 }
 return {total:results.length,counts,netImported:netCents/100};
}

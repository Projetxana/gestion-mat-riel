// Shared Edge-only HMAC authentication for the Cloudflare document worker.
// Sign byte-exact request bodies; no anonymous access and no client secrets.
const enc=new TextEncoder();
const combined=(head,bytes)=>{
 const prefix=enc.encode(head);
 const result=new Uint8Array(prefix.length+bytes.length);
 result.set(prefix);result.set(bytes,prefix.length);
 return result;
};
const importKey=async(secret,usage)=>
 crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,[usage]);
export const validTime=ts=>
 /^\d{13}$/.test(String(ts||'')) && Math.abs(Date.now()-Number(ts))<300000;
export const signedBytes=async(secret,head,bytes)=>{
 const digest=await crypto.subtle.sign('HMAC',await importKey(secret,'sign'),combined(head,bytes));
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
export const verifyBytes=async(secret,head,bytes,hex)=>{
 if(!secret || !/^[a-f0-9]{64}$/i.test(String(hex||''))) return false;
 const sig=Uint8Array.from(hex.match(/../g).map(s=>parseInt(s,16)));
 return crypto.subtle.verify('HMAC',await importKey(secret,'verify'),sig,combined(head,bytes));
};
export const workerExtract=async(name,mime,bytes)=>{
 const endpoint=Deno.env.get('DOCUMENT_WORKER_URL');
 const secret=Deno.env.get('DOCUMENT_INGEST_SECRET');
 if(!endpoint || !secret) return {text:'',status:'not_configured'};
 const ts=String(Date.now());
 const head=ts+'\n'+name+'\n'+mime+'\n';
 const signature=await signedBytes(secret,head,bytes);
 try{
  const response=await fetch(new URL('/internal/extract',endpoint),{
   method:'POST',
   headers:{
    'Content-Type':mime,'X-BT-Timestamp':ts,
    'X-BT-Document-Name':name,'X-BT-Signature':signature,
   },
   body:bytes,
   signal:AbortSignal.timeout(20000),
  });
  if(!response.ok) return {text:'',status:'unavailable'};
  const data=await response.json();
  return typeof data.text==='string' && data.text.trim()
   ? {text:data.text.slice(0,120000),status:'extracted'}
   : {text:'',status:'unavailable'};
 }catch{return {text:'',status:'unavailable'};}
};

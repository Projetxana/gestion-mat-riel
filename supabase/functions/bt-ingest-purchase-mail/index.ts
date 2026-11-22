// Supabase Edge Function (private): receives signed raw MIME emails from Cloudflare.
// Requires DOCUMENT_INGEST_SECRET and DOCUMENT_WORKER_URL secrets.
// Only creates 'pending_review' documents, never commits an order or a price.
import PostalMime from 'npm:postal-mime@4.2.1';
import { createClient } from 'npm:@supabase/supabase-js@2.90.0';
import { verifyBytes,validTime,workerExtract } from '../_shared/bt-document-signature.ts';
import { inboundAliasToken,allowedDocumentMime,extractDocumentHints } from '../../../src/utils/purchaseDocumentText.js';

const JSON_HEADERS={'Content-Type':'application/json','Cache-Control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const digestHex=async bytes=>{
 const sum=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(sum)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
const extFor=mime=>({
 'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'
})[mime];
const magicValid=(mime,bytes)=>{
 if(mime==='application/pdf')return bytes.length>=5 && String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
 if(mime==='image/jpeg')return bytes.length>=4 && bytes[0]===0xff && bytes[1]===0xd8;
 if(mime==='image/png')return bytes.length>=8 && bytes[0]===137 && bytes[1]===80 &&
  bytes[2]===78 && bytes[3]===71;
 if(mime==='image/webp')return bytes.length>=12 &&
  String.fromCharCode(...bytes.slice(0,4))==='RIFF' &&
  String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 return false;
};

Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 // The pilot is off until both a test tenant and site have been selected.
 if(Deno.env.get('DOCUMENT_INBOUND_ENABLED')!=='true' ||
    !Deno.env.get('PILOT_COMPANY_ID') ||
    !Deno.env.get('PILOT_SITE_ID'))
   return json({error:'Pilot email intake disabled'},503);
 const secret=Deno.env.get('DOCUMENT_INGEST_SECRET');
 const recipient=(req.headers.get('x-bt-recipient')||'').trim().toLowerCase();
 const sender=(req.headers.get('x-bt-sender')||'').trim().toLowerCase();
 const msgId=(req.headers.get('x-bt-message-id')||'').slice(0,250);
 const ts=req.headers.get('x-bt-timestamp')||'';
 if(!secret||!validTime(ts)||!recipient||!sender)return json({error:'Forbidden'},403);
 const bytes=new Uint8Array(await req.arrayBuffer());
 if(!bytes.length||bytes.length>12*1024*1024)return json({error:'Payload too large'},413);
 const head=ts+'\n'+recipient+'\n'+sender+'\n'+msgId+'\n';
 if(!await verifyBytes(secret,head,bytes,req.headers.get('x-bt-signature')))
   return json({error:'Forbidden'},403);
 const domain=Deno.env.get('DOCUMENT_INBOUND_DOMAIN')||'achats.buildtrackapp.ca';
 const alias=inboundAliasToken(recipient,domain);
 if(!alias)return json({error:'Invalid recipient'},422);
 const url=Deno.env.get('SUPABASE_URL');
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!serviceKey)return json({error:'Ingest not configured'},503);
 const supabase=createClient(url,serviceKey,{
   auth:{autoRefreshToken:false,persistSession:false}
 });
 try {
  const {data:inbox,error:aliasError}=await supabase
    .from('bt_purchase_inbox_aliases')
    .select('id,company_id,site_id')
    .eq('alias_token',alias).maybeSingle();
  if(aliasError||!inbox)return json({error:'Unrecognized project address'},422);
  const {data:site,error:siteError}=await supabase.from('sites')
    .select('id,name,company_id,status').eq('id',inbox.site_id)
    .eq('company_id',inbox.company_id).maybeSingle();
  if(siteError||site?.status!=='active')return json({error:'Inactive project'},422);
  if(String(inbox.company_id)!==Deno.env.get('PILOT_COMPANY_ID') ||
     String(inbox.site_id)!==Deno.env.get('PILOT_SITE_ID'))
    return json({error:'Pilot routing is restricted to a test project'},403);
  const parsed=await PostalMime.parse(bytes);
  const attachments=(parsed.attachments||[]).filter(a=>a.content);
  if(!attachments.length||attachments.length>6)
    return json({error:'No valid attachment count'},422);
  const files=attachments.filter(a=>allowedDocumentMime(a.mimeType,a.filename));
  if(files.length!==attachments.length)
    return json({error:'Unsupported attachment type'},422);
  let created=0,duplicates=0;
  for(const a of files){
    const payload=new Uint8Array(a.content);
    if(!payload.byteLength||payload.byteLength>7*1024*1024)
      return json({error:'Unsupported attachment size'},422);
    if(!magicValid(a.mimeType,payload))
      return json({error:'Attachment content does not match declared format'},422);
    const sha256=await digestHex(payload);
    const {data:existing}=await supabase.from('bt_purchase_documents')
      .select('id').eq('company_id',inbox.company_id)
      .eq('site_id',inbox.site_id).eq('sha256',sha256).maybeSingle();
    if(existing){duplicates++;continue;}
    const mime=a.mimeType;
    const extension=extFor(mime);
    const storagePath=[inbox.company_id,inbox.site_id,sha256+'.'+extension].join('/');
    const {error:uploadError}=await supabase.storage.from('bt-purchase-private')
      .upload(storagePath,payload,{contentType:mime,upsert:false});
    if(uploadError && !/already exists|duplicate/i.test(uploadError.message||''))
      throw new Error('Private storage failed');
    const result=await workerExtract('commande.'+extension,mime,payload);
    const hints=extractDocumentHints(result.text,'order');
    const {error:insertError}=await supabase.from('bt_purchase_documents').insert({
      company_id:inbox.company_id,site_id:inbox.site_id,
      inbox_alias_id:inbox.id,
      sender_email:sender,email_message_id:msgId,
      original_filename:String(a.filename||'document.'+extension).slice(0,180),
      mime_type:mime,sha256,storage_path:storagePath,
      extracted_text:result.text,po_hint:hints.po_number,
      shipping_project_hint:hints.shipping_project_name,
      line_candidates:hints.suggested_lines.slice(0,300),
      line_warnings:hints.line_warnings,
    });
    if(insertError){
      if(insertError.code==='23505'){duplicates++;continue;}
      throw new Error('Document queue insert failed');
    }
    created++;
  }
  return json({ok:true,pending_review:created,duplicates});
 }catch{
  // Do not leak supplier names or documents to HTTP callers/logs.
  return json({error:'Ingest failed; retry safely'},500);
 }
});

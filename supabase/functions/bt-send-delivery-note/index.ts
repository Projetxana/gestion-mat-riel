// Authenticated, private delivery-note submission: no public image URLs and
// no caller-controlled accounting recipient. Requires MVP3 migration.
import nodemailer from 'npm:nodemailer@6.9.13';
import {Buffer} from 'node:buffer';
import {createClient} from 'npm:@supabase/supabase-js@2.90.0';

const respond=(payload,status=200)=>new Response(JSON.stringify(payload),{
 status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
});
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const sha=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
const safe=value=>String(value||'').replace(/[&<>"']/g,s=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[s]).slice(0,160);
const sameFingerprint=async images=>{
 const hashes=[];
 for(const bytes of images)hashes.push(await sha(bytes));
 return sha(new TextEncoder().encode(hashes.join(':')));
};
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async req=>{
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL');
 const publicKey=Deno.env.get('SUPABASE_ANON_KEY');
 const secretKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const smtpUser=Deno.env.get('SMTP_USER'),smtpPass=Deno.env.get('SMTP_PASS');
 const accounting=Deno.env.get('DELIVERY_ACCOUNTING_EMAIL');
 if(!url||!publicKey||!secretKey||!smtpUser||!smtpPass||!accounting)
  return respond({error:'Service not configured'},503);
 const authorization=req.headers.get('Authorization')||'';
 if(!/^Bearer \S+$/.test(authorization))return respond({error:'Auth required'},401);
 const scoped=createClient(url,publicKey,{global:{headers:{Authorization:authorization}},
   auth:{autoRefreshToken:false,persistSession:false}});
 const {data:auth,error:authError}=await scoped.auth.getUser();
 if(authError||!auth.user)return respond({error:'Authentication failed'},401);
 const input=await req.json().catch(()=>null);
 const companyId=String(input?.company_id||'');
 const siteId=Number(input?.site_id);
 const paths=input?.paths;
 if(!UUID_RE.test(companyId)||!Number.isInteger(siteId)||siteId<=0||
    !Array.isArray(paths)||paths.length<1||paths.length>6||
    paths.some(p=>typeof p!=='string'||p.length>300))return respond({error:'Invalid delivery'},422);
 const uid=auth.user.id;
 const prefix=companyId+'/'+siteId+'/'+uid+'/';
 if(paths.some(p=>!p.startsWith(prefix)||
   !/^[a-zA-Z0-9_/-]+\.jpe?g$/i.test(p) || p.includes('..')))
   return respond({error:'Invalid file path'},403);
 const admin=createClient(url,secretKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const [{data:member,error:memberError},{data:site,error:siteError}]=await Promise.all([
   admin.from('company_users').select('role').eq('company_id',companyId).eq('user_id',uid).maybeSingle(),
   admin.from('sites').select('name,status,company_id').eq('id',siteId).eq('company_id',companyId).maybeSingle(),
 ]);
 if(memberError||siteError||!member||site?.status!=='active')return respond({error:'Not a project member'},403);
 const attachments=[],bytesList=[];
 let totalBytes=0;
 for(let i=0;i<paths.length;i++){
   const {data:blob,error:loadError}=await admin.storage.from('bt-delivery-private').download(paths[i]);
   if(loadError||!blob)return respond({error:'Photo unavailable'},422);
   const bytes=new Uint8Array(await blob.arrayBuffer());
   if(!bytes.length||bytes.length>3*1024*1024)return respond({error:'Photo too large'},413);
   totalBytes+=bytes.length;
   if(totalBytes>15*1024*1024)return respond({error:'Photos too large'},413);
   bytesList.push(bytes);
   attachments.push({filename:'bon_livraison_'+(i+1)+'.jpg',content:Buffer.from(bytes),contentType:'image/jpeg'});
 }
 const fingerprint=await sameFingerprint(bytesList);
 const {data:duplicate}=await admin.from('bt_purchase_delivery_notes')
   .select('id,status').eq('company_id',companyId).eq('fingerprint',fingerprint).maybeSingle();
 if(duplicate)return respond({error:'Document already sent or in progress',duplicate:true},409);
 // Atomic reservation before SMTP prevents concurrent submission of identical photos.
 const {data:reserved,error:reserveError}=await admin.from('bt_purchase_delivery_notes')
  .insert({
    company_id:companyId,site_id:siteId,uploaded_by:uid,
    attachment_paths:paths,source_bucket:'bt-delivery-private',
    fingerprint,status:'sending',
  }).select('id').single();
 if(reserveError||!reserved)
   return respond({error:reserveError?.code==='23505'?'Duplicate document':'Reservation failed'},409);
 const id=reserved.id;
 try{
  const transporter=nodemailer.createTransport({service:'gmail',auth:{user:smtpUser,pass:smtpPass}});
  await transporter.sendMail({
    from:'BuildTrack – Bons de livraison <'+smtpUser+'>',
    to:accounting,
    subject:('Bon de livraison - '+site.name).replace(/[\r\n]/g,' ').slice(0,160),
    html:'<p>Bon de livraison reçu via BuildTrack.</p>'+
      '<p><strong>Chantier :</strong> '+safe(site.name)+'</p>'+
      '<p><strong>Employé :</strong> '+safe(auth.user.email)+'</p>'+
      '<p><strong>Photos :</strong> '+attachments.length+'</p>',
    attachments,
  });
 }catch{
  await admin.from('bt_purchase_delivery_notes').update({status:'send_failed'}).eq('id',id);
  return respond({error:'Accounting email failed',tracking_id:id},502);
 }
 const {error:updateError}=await admin.from('bt_purchase_delivery_notes')
    .update({status:'pending_review',email_sent_at:new Date().toISOString()}).eq('id',id);
 if(updateError){
  // SMTP may have succeeded. Never retry automatically on an ambiguous result.
  return respond({sent:true,tracked:false,tracking_id:id,
    warning:'Email sent but tracking must be reconciled manually'},202);
 }
 return respond({sent:true,tracked:true,tracking_id:id},200);
});

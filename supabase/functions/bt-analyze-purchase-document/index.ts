// Supabase Edge Function: admin-only, low-trust draft extraction for PDF/photo.
import { createClient } from 'npm:@supabase/supabase-js@2.90.0';
import { workerExtract } from '../_shared/bt-document-signature.ts';
import { allowedDocumentMime,extractDocumentHints,getDocumentSiteStatus } from '../../../src/utils/purchaseDocumentText.js';

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const HEADERS={...CORS,'Content-Type':'application/json','Cache-Control':'no-store'};
const answer=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
 if(req.method!=='POST')return answer({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL');
 const anon=Deno.env.get('SUPABASE_ANON_KEY');
 const authorization=req.headers.get('Authorization')||'';
 if(!url||!anon||!/^Bearer \S+$/.test(authorization))
   return answer({error:'Authorization required'},401);
 const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},
   auth:{autoRefreshToken:false,persistSession:false}});
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user)return answer({error:'Not authenticated'},401);
 const form=await req.formData().catch(()=>null);
 if(!form)return answer({error:'Expected multipart data'},400);
 const file=form.get('file');
 const companyId=String(form.get('company_id')||'');
 const siteId=String(form.get('site_id')||'');
 const kind=String(form.get('kind')||'order');
 if(!(file instanceof File)||!allowedDocumentMime(file.type,file.name) ||
    file.size<1||file.size>7*1024*1024||!['order','delivery','budget'].includes(kind))
   return answer({error:'Unsupported document'},422);
 if(!/^[0-9a-f-]{36}$/i.test(companyId)||!/^\d+$/.test(siteId))
   return answer({error:'Invalid project'},422);
 const {data:membership,error:memberError}=await client
   .from('company_users').select('role')
   .eq('company_id',companyId).eq('user_id',auth.user.id).maybeSingle();
 if(memberError||membership?.role!=='admin')return answer({error:'Administrator required'},403);
 const {data:site,error:siteError}=await client.from('sites')
   .select('id,name,company_id,status')
   .eq('id',siteId).eq('company_id',companyId).maybeSingle();
 if(siteError||site?.status!=='active')return answer({error:'Project not active'},403);
 const bytes=new Uint8Array(await file.arrayBuffer());
 const extracted=await workerExtract(file.name,file.type,bytes);
 if(extracted.status!=='extracted')
   return answer({error:'Automatic document extraction is not configured or failed',
                  status:extracted.status},503);
 const hints=extractDocumentHints(extracted.text,kind);
 return answer({
   kind,site_id:site.id,company_id:companyId,origin_filename:file.name,
   extraction_status:extracted.status,
   proposed_project_match:getDocumentSiteStatus(hints,site),
   ...hints,
 });
});

import { createClient } from "npm:@supabase/supabase-js@2.90.0";
import webpush from "npm:web-push@3.6.7";
import { allowedPushEndpoint } from "./security.js";

type Due = {subscription_id:string;kind:"daily"|"weekly";reminder_date:string};
type Claim = {history_id:string;endpoint:string;subscription_id:string};
const response = (status:number, body:object) => new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
async function equalSecret(a:string,b:string) {
    if (!a || !b || a.length>512 || b.length<32) return false;
    const enc=new TextEncoder();
    const [x,y]=await Promise.all([a,b].map(s=>crypto.subtle.digest("SHA-256",enc.encode(s))));
    const aa=new Uint8Array(x),bb=new Uint8Array(y);let diff=0;
    for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];
    return diff===0;
}
Deno.serve(async req=>{
    if(req.method!=="POST")return response(405,{error:"Method not allowed"});
    const secret=Deno.env.get("BT_PUSH_CRON_SECRET")||"";
    if(!await equalSecret(req.headers.get("x-buildtrack-cron")||"",secret))return response(401,{error:"Unauthorized"});
    // Independent kill switch; enabled only after staging + physical iPhone sign-off.
    if(Deno.env.get("BT_PUSH_SEND_ENABLED")!=="true")return response(200,{disabled:true});
    const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const pub=Deno.env.get("BT_PUSH_VAPID_PUBLIC"),priv=Deno.env.get("BT_PUSH_VAPID_PRIVATE"),subject=Deno.env.get("BT_PUSH_VAPID_SUBJECT");
    if(!url||!key||!pub||!priv||!subject)return response(503,{error:"Push not configured"});
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    try {
        const {error:pruneError}=await db.rpc("bt_push_prune");if(pruneError)throw pruneError;
        const {data,error}=await db.rpc("bt_push_due").limit(40);if(error)throw error;
        const due=(data||[]) as Due[];
        let accepted=0,failed=0,skipped=0;
        async function send(item:Due){
            // Claim transaction checks the current membership, hours and absence again.
            const {data:claims,error:claimError}=await db.rpc("bt_push_claim",{
                p_subscription_id:item.subscription_id,p_kind:item.kind,p_day:item.reminder_date,
            });
            if(claimError){failed++;return;}
            const claim=(claims as Claim[]|null)?.[0];if(!claim){skipped++;return;}
            let status="failed";
            try{
                if(!allowedPushEndpoint(claim.endpoint)){status="skipped";skipped++;return;}
                // Payloadless: VAPID authentication, no employee/project data or
                // browser encryption keys leave the database. No redirects/SSRF.
                const details=webpush.generateRequestDetails({endpoint:claim.endpoint},null,{
                    TTL:900,urgency:"normal",vapidDetails:{subject,publicKey:pub,privateKey:priv},
                });
                const result=await fetch(claim.endpoint,{method:"POST",headers:details.headers,
                    redirect:"error",signal:AbortSignal.timeout(8000)});
                if(result.ok){status="accepted";accepted++;}
                else if(result.status===404||result.status===410){
                    status="expired";failed++;
                    await db.from("bt_push_subscriptions").delete().eq("id",claim.subscription_id);
                }else failed++;
                await result.body?.cancel().catch(()=>{});
            }catch{failed++;}
            finally{
                // Never log endpoints, secrets, provider bodies or employee details.
                const {error:historyError}=await db.from("bt_push_history").update({status}).eq("id",claim.history_id).eq("status","claimed");
                if(historyError) console.warn("Push history update failed");
            }
        }
        for(let i=0;i<due.length;i+=8)await Promise.all(due.slice(i,i+8).map(send));
        return response(200,{selected:due.length,accepted,failed,skipped});
    }catch{
        console.warn("Hour reminder dispatcher failed");
        return response(500,{error:"Reminder processing failed"});
    }
});

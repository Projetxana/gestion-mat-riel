// Cloudflare Email Worker + private AI document extractor.
// No public OCR or budget mutation endpoints. This service requires configuration;
// do NOT attach an Email Routing rule until the Supabase ingest function and RLS are live.
const encoder = new TextEncoder();
const supportedMime = new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const bytesOf = s => encoder.encode(s);
const signaturePayload = (head, bytes) => {
  const prefix=bytesOf(head);
  const out=new Uint8Array(prefix.byteLength + bytes.byteLength);
  out.set(prefix);
  out.set(bytes, prefix.byteLength);
  return out;
};
async function hmac(secret, data) {
  const key=await crypto.subtle.importKey('raw',bytesOf(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const digest=await crypto.subtle.sign('HMAC',key,data);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function validSignature(secret, data, hex) {
  if (!/^[a-f0-9]{64}$/i.test(String(hex||''))) return false;
  const key=await crypto.subtle.importKey('raw',bytesOf(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(hex.match(/../g).map(chunk=>parseInt(chunk,16)));
  return crypto.subtle.verify('HMAC',key,signature,data);
}
const okTime = value => Number.isInteger(Number(value)) &&
  Math.abs(Date.now()-Number(value)) <= 5*60*1000;

export default {
  async email(message, env) {
    if (!env.INGEST_URL || !env.INGEST_SECRET || !env.INBOUND_DOMAIN)
      throw new Error('Email ingest is not configured');
    if (message.rawSize > 12*1024*1024) {
      message.setReject('Message too large');
      return;
    }
    const recipient=String(message.to).toLowerCase().trim();
    const from=String(message.from).toLowerCase().trim();
    const msgId=String(message.headers.get('message-id')||'').trim().slice(0,250);
    // Cloudflare prepends the trusted Authentication-Results header; reject unauthenticated mail.
    const auth=String(message.headers.get('authentication-results')||'');
    if (!auth.toLowerCase().startsWith('mx.cloudflare.net;') || !/\bdmarc\s*=\s*pass\b/i.test(auth)) {
      message.setReject('Sender email authentication required');
      return;
    }
    const domain=env.INBOUND_DOMAIN.toLowerCase();
    const local=recipient.endsWith('@'+domain)
      ? recipient.slice(0,-1-domain.length) : '';
    if (!/^commandes\+[0-9a-f]{32}$/.test(local)) {
      message.setReject('Unknown recipient');
      return;
    }
    const raw=new Uint8Array(await new Response(message.raw).arrayBuffer());
    const ts=String(Date.now());
    const head=ts+'\n'+recipient+'\n'+from+'\n'+msgId+'\n';
    const signature=await hmac(env.INGEST_SECRET,signaturePayload(head,raw));
    const response=await fetch(env.INGEST_URL,{
      method:'POST',
      headers:{
        'Content-Type':'message/rfc822',
        'X-BT-Timestamp':ts,'X-BT-Signature':signature,
        'X-BT-Recipient':recipient,'X-BT-Sender':from,'X-BT-Message-Id':msgId,
      },body:raw,
    });
    if (!response.ok) throw new Error('Ingest refused ('+response.status+')');
  },

  async fetch(request, env) {
    const url=new URL(request.url);
    if (request.method!=='POST'||url.pathname!=='/internal/extract')
      return new Response('Not found',{status:404});
    if (env.ENABLE_DOCUMENT_AI!=='true' || !env.AI || !env.INGEST_SECRET)
      return Response.json({error:'Document AI disabled'},{status:503});
    const ts=request.headers.get('x-bt-timestamp')||'';
    const filename=(request.headers.get('x-bt-document-name')||'').slice(0,160);
    const mime=request.headers.get('content-type')||'';
    if (!okTime(ts)||!supportedMime.has(mime)||!/\.(pdf|jpg|jpeg|png|webp)$/i.test(filename))
      return Response.json({error:'Unsupported file or request'},{status:400});
    const contentLength=Number(request.headers.get('content-length')||0);
    if (contentLength > 7*1024*1024) return Response.json({error:'Too large'},{status:413});
    const bytes=new Uint8Array(await request.arrayBuffer());
    if (!bytes.length||bytes.length>7*1024*1024)
      return Response.json({error:'Too large'},{status:413});
    const prefix=ts+'\n'+filename+'\n'+mime+'\n';
    if (!await validSignature(env.INGEST_SECRET,signaturePayload(prefix,bytes),
        request.headers.get('x-bt-signature')))
      return Response.json({error:'Forbidden'},{status:403});
    try {
      // One file only; no document may be auto-committed from this extraction result.
      const output=await env.AI.toMarkdown({
        name:filename, blob:new Blob([bytes],{type:mime})
      });
      const result=Array.isArray(output)?output[0]:output;
      if (!result || result.format==='error' || typeof result.data!=='string')
        throw new Error('Document conversion returned no text');
      return Response.json({
        format:result.format,
        text:result.data.slice(0,120000),
        requires_review:true,
      },{headers:{'Cache-Control':'no-store'}});
    } catch {
      return Response.json({error:'Conversion unavailable'},{status:422});
    }
  }
};

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/buildtrack-documents/index.js';

const env={INGEST_URL:'https://ingest.example.test/mail',
 INBOUND_DOMAIN:'achats.buildtrackapp.ca',INGEST_SECRET:'test-shared-secret',
 ENABLE_INBOUND_EMAIL:'true',PILOT_ALLOWED_SENDERS:'orders@flocor.example,supplier@example.com'};

const stream=content=>new ReadableStream({start(controller){
 controller.enqueue(new TextEncoder().encode(content));controller.close();
}});
test('Cloudflare rejects DMARC failure before forwarding any document',async()=>{
 let rejected=false;
 const message={to:'commandes+0123456789abcdef0123456789abcdef@achats.buildtrackapp.ca',
  from:'supplier@example.com',rawSize:20,raw:stream('testing'),
  headers:new Headers({'Authentication-Results':'mx.cloudflare.net; dmarc=fail'}),
  setReject:()=>{rejected=true;}};
 await worker.email(message,env);
 assert.equal(rejected,true);
});
test('Cloudflare email signs envelope and byte-exact body',async()=>{
 const original=globalThis.fetch;let captured;
 globalThis.fetch=async(url,opts)=>{
  captured={url,opts};return new Response('{}',{status:200});
 };
 try{
 const message={to:'commandes+0123456789abcdef0123456789abcdef@achats.buildtrackapp.ca',
  from:'orders@flocor.example',rawSize:12,raw:stream('raw mail'),
  headers:new Headers({'Authentication-Results':'mx.cloudflare.net; dmarc=pass',
   'Message-Id':'<test-id@example>'}),setReject:()=>{throw new Error('unexpected');}};
 await worker.email(message,env);
 assert.equal(captured.url,env.INGEST_URL);
 assert.equal(captured.opts.headers['X-BT-Recipient'],message.to);
 assert.match(captured.opts.headers['X-BT-Signature'],/^[a-f0-9]{64}$/);
 assert.equal(new TextDecoder().decode(captured.opts.body),'raw mail');
 } finally {globalThis.fetch=original;}
});
test('private conversion refuses unauthenticated requests and is disabled by default',async()=>{
 const request=new Request('https://worker.test/internal/extract',{
  method:'POST',body:new TextEncoder().encode('image-data'),
  headers:{'content-type':'image/jpeg','x-bt-document-name':'photo.jpg',
   'x-bt-timestamp':String(Date.now())}});
 assert.equal((await worker.fetch(request,{...env,ENABLE_DOCUMENT_AI:'false'})).status,503);
 const request2=new Request('https://worker.test/internal/extract',{
  method:'POST',body:new TextEncoder().encode('image-data'),
  headers:{'content-type':'image/jpeg','x-bt-document-name':'photo.jpg',
   'x-bt-timestamp':String(Date.now())}});
 assert.equal((await worker.fetch(request2,{
  ...env,ENABLE_DOCUMENT_AI:'true',AI:{toMarkdown:async()=>({format:'markdown',data:'SECRET'})}
 })).status,403);
});
test('valid signed conversion returns draft text and never mutates a purchase',async()=>{
 const ts=String(Date.now()),name='confirmation.pdf',mime='application/pdf';
 const bytes=new TextEncoder().encode('PDF bytes');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.INGEST_SECRET),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const payload=new TextEncoder().encode(ts+'\n'+name+'\n'+mime+'\n');
 const all=new Uint8Array(payload.length+bytes.length);all.set(payload);all.set(bytes,payload.length);
 const sig=await crypto.subtle.sign('HMAC',key,all);
 const digest=[...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
 let calls=0;
 const ai={toMarkdown:async docs=>{
  calls++;assert.equal(Array.isArray(docs),true);assert.equal(docs.length,1);
  assert.equal(docs[0].name,name);return [{format:'markdown',data:'Customer PO#: P02281'}];
 }};
 const response=await worker.fetch(new Request('https://worker.test/internal/extract',{
  method:'POST',body:bytes,headers:{'Content-Type':mime,'X-BT-Document-Name':name,
   'X-BT-Timestamp':ts,'X-BT-Signature':digest}
 }),{...env,AI:ai,ENABLE_DOCUMENT_AI:'true'});
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.text,'Customer PO#: P02281');
 assert.equal(result.requires_review,true);
 assert.equal(calls,1);
});

test('no supplier emails accepted when pilot is disabled or sender is not approved',async()=>{
 let rejected=0, forwarded=0;
 const mock={to:'commandes+0123456789abcdef0123456789abcdef@achats.buildtrackapp.ca',
  from:'attacker@other.example',rawSize:7,raw:stream('mail'),
  headers:new Headers({'Authentication-Results':'mx.cloudflare.net; dmarc=pass'}),
  setReject:()=>{rejected++;}};
 const old=globalThis.fetch;
 globalThis.fetch=async()=>{forwarded++;return new Response('ok');};
 try{
  await worker.email(mock,{...env,ENABLE_INBOUND_EMAIL:'false'});
  await worker.email(mock,{...env,ENABLE_INBOUND_EMAIL:'true'});
  assert.equal(rejected,2);assert.equal(forwarded,0);
 } finally{globalThis.fetch=old;}
});

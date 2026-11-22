import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('pilot gates refuse unconfigured mail, OCR is disabled by default',()=>{
 const worker=source('workers/buildtrack-documents/index.js');
 const ingest=source('supabase/functions/bt-ingest-purchase-mail/index.ts');
 const sender=source('supabase/functions/bt-send-delivery-note/index.ts');
 assert.match(worker,/ENABLE_INBOUND_EMAIL/);
 assert.match(worker,/PILOT_ALLOWED_SENDERS/);
 assert.match(worker,/ENABLE_DOCUMENT_AI/);
 assert.match(worker,/env\.AI\.toMarkdown\(\[\{/);
 assert.match(ingest,/DOCUMENT_INBOUND_ENABLED/);
 assert.match(ingest,/PILOT_COMPANY_ID/);
 assert.match(ingest,/PILOT_SITE_ID/);
 assert.match(sender,/DELIVERY_PILOT_ENABLED/);
 assert.match(sender,/PILOT_COMPANY_ID/);
 assert.match(sender,/PILOT_SITE_ID/);
});
test('pilot accounting destination is server-controlled and SMTP avoids blocked 25/587 ports',()=>{
 const sender=source('supabase/functions/bt-send-delivery-note/index.ts');
 assert.match(sender,/Deno\.env\.get\('DELIVERY_ACCOUNTING_EMAIL'\)/);
 assert.match(sender,/port:465,secure:true/);
 assert.doesNotMatch(sender,/to\s*:\s*input\./);
});

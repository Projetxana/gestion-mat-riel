import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

// Syntax-only guard for Deno Edge code; does not replace Supabase runtime tests.
const files = [
 'supabase/functions/_shared/bt-document-signature.ts',
 'supabase/functions/bt-ingest-purchase-mail/index.ts',
 'supabase/functions/bt-analyze-purchase-document/index.ts',
 'supabase/functions/bt-send-delivery-note/index.ts'
];
for (const file of files) {
 const content = readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const output = transformSync(content,{loader:'ts',format:'esm',target:'es2022'});
 if(!output.code) throw new Error('Empty Edge build: '+file);
}
process.stdout.write('Edge syntax checks: '+files.length+' passed\n');

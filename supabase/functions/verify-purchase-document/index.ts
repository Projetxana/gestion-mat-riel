import { createClient } from 'npm:@supabase/supabase-js@2.90.0';
import { getResolvedPDFJS } from 'npm:unpdf@1.8.1';
import { rebuildPdfPageLayout } from '../../../src/utils/pdfTextLayout.js';
import { planPurchasePdf } from '../../../src/utils/unifiedPurchaseImport.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const url = Deno.env.get('SUPABASE_URL')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Méthode invalide.' }, 405);
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return reply({ error: 'Authentification requise.' }, 401);
  const user = createClient(url, publicKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  try {
    const { data: identity, error: authError } = await user.auth.getUser();
    if (authError || !identity.user) return reply({ error: 'Session expirée.' }, 401);
    if (Number(request.headers.get('content-length')) > 4096) return reply({ error: 'Requête trop volumineuse.' }, 413);
    const { companyId, siteId, documentId, filename } = await request.json();
    if (!uuid.test(companyId) || !uuid.test(documentId) || !/^[1-9]\d{0,15}$/.test(String(siteId)) ||
        typeof filename !== 'string' || !/\.pdf$/i.test(filename) || filename.length > 250) {
      return reply({ error: 'Document ou chantier invalide.' }, 400);
    }
    const [access, project] = await Promise.all([
      user.rpc('bt_stage2_is_admin', { p_company: companyId }),
      user.from('sites').select('id,name,company_id,status').eq('company_id', companyId).eq('id', siteId).eq('status', 'active').maybeSingle(),
    ]);
    if (access.error || access.data !== true || project.error || !project.data) {
      return reply({ error: 'Chantier indisponible ou administrateur requis.' }, 403);
    }
    const storagePath = [companyId, siteId, 'order', documentId, 'original.pdf'].join('/');
    const { data: file, error: downloadError } = await user.storage.from('bt-purchase-pdfs').download(storagePath);
    if (downloadError || !file || file.size < 50 || file.size > 12 * 1024 * 1024) {
      return reply({ error: 'PDF original absent ou trop volumineux.' }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') return reply({ error: 'PDF invalide.' }, 400);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
    const { getDocument } = await getResolvedPDFJS();
    const task = getDocument({ data:bytes, isEvalSupported:false, useSystemFonts:false, useWorkerFetch:false });
    let plan;
    try {
      const pdf = await task.promise;
      if (pdf.numPages < 1 || pdf.numPages > 40) return reply({ status:'review', issues:['incomplete_pdf'] });
      const pages = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        pages.push(rebuildPdfPageLayout((await page.getTextContent()).items));
        page.cleanup();
      }
      plan = planPurchasePdf({
        text: pages.join('\n\f\n'), numPages: pdf.numPages,
        digitalText: pages.every(page => page.trim().length > 0), allPagesProcessed: true, sha256,
      }, { site: project.data });
    } finally {
      await task.destroy();
    }
    if (!['ready', 'confirm', 'non_financial'].includes(plan.status)) {
      return reply({ status:'review', kind:plan.kind, issues:plan.issues });
    }
    const issuer = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: receipt, error: issueError } = await issuer.from('bt_purchase_verification_receipts').insert({
      document_id: documentId, company_id: companyId, site_id: siteId, actor_id: identity.user.id,
      file_sha256: sha256, file_name: filename, file_size: file.size, storage_path: storagePath,
      evidence: { ...plan, currency: 'CAD' },
    }).select('id').single();
    if (issueError || !receipt) return reply({ error: 'La vérification n’a pas pu être enregistrée.' }, 503);
    return reply({ receiptId:receipt.id, kind:plan.kind, project:plan.project, sha256 });
  } catch {
    return reply({ error:'Le PDF n’a pas pu être vérifié. Réessayez avec un original numérique.' }, 422);
  }
});

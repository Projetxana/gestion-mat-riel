import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const companyA = '10000000-0000-0000-0000-000000000001';
const companyB = '20000000-0000-0000-0000-000000000001';
const memberA = '00000000-0000-0000-0000-000000000001';
const adminA = '00000000-0000-0000-0000-000000000002';
const adminB = '00000000-0000-0000-0000-000000000006';
const id = number => '30000000-0000-0000-0000-' + String(number).padStart(12, '0');
const signature = 'SELECT public.bt_purchase_import_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)';
const line = (quantity, amount) => JSON.stringify([{ item_code:'SKU1', description:'Article', unit:'UN', quantity, unit_cost:39.53, amount }]);
const importArgs = (number, reference, hash, kind = 'order', quantity = 2, amount = 79.06, company = companyA, site = 11) =>
    [company, site, id(number), kind, 'P12345', 'Flocor', reference, kind === 'credit' ? 'S100' : '',
     'Alias A', 'Site A', 'order.pdf', hash.repeat(64), 120, line(quantity, amount)];

test('document RPC and private archive enforce tenant, identity, sign and all-or-nothing writes', async () => {
    const db = new PGlite();
    try {
        const fixture = await source('tests/purchases-rls-postgres.sql');
        await db.exec(fixture.split('\n\\ir ')[0].replace(/^\\set[^\n]*\n/, ''));
        await db.exec(`
            CREATE SCHEMA storage;
            GRANT USAGE ON SCHEMA storage TO authenticated, anon;
            CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
            CREATE TABLE storage.objects(
                bucket_id text, name text, owner_id text, metadata jsonb,
                archived_at timestamptz, is_delete_marker boolean,
                PRIMARY KEY(bucket_id, name)
            );
            CREATE FUNCTION storage.foldername(path text) RETURNS text[]
            LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(path, '/') $$;
            ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
            GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
        `);
        for (const name of [
            'bt_purchases_mvp1_PROPOSED.sql',
            'bt_purchase_line_links_20261123_PROPOSED.sql',
            'bt_supplier_quote_price_watch_20261123_PROPOSED.sql',
            'bt_purchase_documents_private_20261123_PROPOSED.sql',
            'bt_purchase_documents_policy_scope_fix_20261123_PROPOSED.sql',
            'bt_purchase_confirmations_credits_20261126.sql',
        ]) await db.exec(await source('migrations/' + name));

        const as = user => db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${user}'; SET ROLE authenticated;`);
        const stage = (number, owner = adminA, company = companyA, site = 11) => db.query(
            "INSERT INTO storage.objects VALUES ('bt-purchase-pdfs', $1, $2, '{\"size\":120,\"mimetype\":\"application/pdf\"}')",
            [`${company}/${site}/order/${id(number)}/original.pdf`, owner]
        );
        const run = (...args) => db.query(signature, importArgs(...args));
        const count = async table => (await db.query('SELECT count(*)::int AS count FROM ' + table)).rows[0].count;
        await as(adminA);
        await assert.rejects(run(1, 'S100', 'a'), /PDF original absent/);
        await assert.rejects(stage(99, adminA, companyB, 22), { code: '42501' });
        await stage(1);
        await stage(2);
        await stage(3);
        await run(1, 'S100', 'a');
        await run(2, 'S101', 'b');
        await db.query(`
            SELECT public.bt_purchase_import_budget($1, 11, 'budget.csv',
                '[{"item_code":"EST1","description":"Article","unit":"UN","quantity":10,"unit_cost":39.53,"amount":395.30}]');
        `, [companyA]);
        await db.query(`
            INSERT INTO public.bt_purchase_line_links (order_line_id,budget_line_id,company_id,site_id,disposition,created_by)
            SELECT ol.id, b.id, ol.company_id, ol.site_id, 'linked', auth.uid()
            FROM public.bt_purchase_order_lines ol CROSS JOIN public.bt_purchase_budget_lines b WHERE ol.order_id = $1;
        `, [id(1)]);
        await run(3, 'S100', 'c', 'credit', -2, -79.06);
        assert.equal(await count('public.bt_purchase_line_links'), 2);
        assert.equal(await count('public.bt_purchase_documents'), 3);
        assert.equal(await count('storage.objects'), 3);
        await db.query('DELETE FROM storage.objects WHERE name = $1', [`${companyA}/11/order/${id(1)}/original.pdf`]);
        assert.equal(await count('storage.objects'), 3);

        const totals = await db.query('SELECT sum(amount)::float8 AS amount, sum(quantity)::float8 AS qty FROM public.bt_purchase_order_lines');
        assert.deepEqual(totals.rows, [{ amount:79.06, qty:2 }]);
        const alias = (company, site) => db.query(
            "SELECT public.bt_purchase_matches_project_alias($1,$2,'Flocor','Alias-A') AS matches", [company, site]
        );
        assert.deepEqual((await alias(companyA, 11)).rows, [{ matches:true }]);
        assert.deepEqual((await alias(companyA, 12)).rows, [{ matches:false }]);

        await stage(4);
        await assert.rejects(run(4, 'S102', 'a'), { code: '23505' });
        await assert.rejects(run(4, ' S 101 ', 'd'), { code: '23505' });
        await assert.rejects(run(4, 'S102', 'd', 'order', -2, -79.06), { code: '23514' });
        await assert.rejects(run(4, 'S102', 'd', 'credit', 2, 79.06), { code: '23514' });
        assert.equal(await count('public.bt_purchase_orders'), 3);
        assert.equal(await count('public.bt_purchase_documents'), 3);
        await assert.rejects(db.query('INSERT INTO public.bt_purchase_orders DEFAULT VALUES'), { code: '42501' });
        await assert.rejects(run(4, 'S102', 'd', 'order', 2, 79.06, companyA, 22), { code: '42501' });
        await assert.rejects(run(4, 'S102', 'd', 'order', 2, 79.06, companyA, 33), { code: '42501' });

        await as(memberA);
        await assert.rejects(stage(5, memberA), { code: '42501' });
        await assert.rejects(run(5, 'S103', 'e'), { code: '42501' });
        assert.equal(await count('public.bt_purchase_order_lines'), 0);
        assert.equal(await count('storage.objects'), 0);

        await as(adminB);
        assert.equal(await count('public.bt_purchase_documents'), 0);
        assert.equal(await count('storage.objects'), 0);
        assert.deepEqual((await alias(companyA, 11)).rows, [{ matches:false }]);
        await assert.rejects(run(4, 'S102', 'd'), { code: '42501' });
        await stage(6, adminB, companyB, 22);
        const tenantB = importArgs(6, 'S100', 'a', 'order', 2, 79.06, companyB, 22);
        tenantB[8] = 'Site B';
        tenantB[9] = '';
        await db.query(signature, tenantB);
        assert.equal(await count('public.bt_purchase_documents'), 1);
        await as(adminA);
        await db.query("SELECT public.bt_purchase_create_order($1,11,'LEGACY','Flocor','LEGACY-1','Site A',null,'legacy.pdf',true,'',$2)", [companyA, line(2, 79.06)]);
        await assert.rejects(run(4, 'LEGACY-1', 'd'), { code: '23505' });
        await assert.rejects(db.query(
            "SELECT public.bt_purchase_create_order($1,11,'LEGACY','Flocor','LEGACY-2','Site A',null,'legacy.pdf',true,'',$2)",
            [companyA, line(2, 79.06)]
        ), { code: '23505' });
    } finally {
        await db.close();
    }
});

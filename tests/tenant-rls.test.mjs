import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const A = '10000000-0000-0000-0000-000000000001';
const B = '20000000-0000-0000-0000-000000000001';
const MEMBER_A = '00000000-0000-0000-0000-000000000001';
const ADMIN_A = '00000000-0000-0000-0000-000000000002';
const MEMBER_B = '00000000-0000-0000-0000-000000000003';
const NOT_MEMBER = '00000000-0000-0000-0000-000000000004';

async function as(db, uid, role = 'authenticated') {
  await db.exec(`RESET ROLE; SET test.uid = '${uid}'; SET ROLE ${role};`);
}
async function values(db, query) { return (await db.query(query)).rows; }

// Fabricated identities and rows only. Does not certify production PostgREST or Realtime.
test('legacy RLS candidate scopes tasks, companies and invitations', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
      CREATE TABLE public.company_users(user_id uuid, company_id uuid, role text);
      CREATE TABLE public.companies(id uuid PRIMARY KEY, name text, owner_user_id uuid, created_at timestamp);
      CREATE TABLE public.sites(id bigint PRIMARY KEY, name text, company_id uuid);
      CREATE TABLE public.tasks(id bigint PRIMARY KEY, name text NOT NULL, site_id bigint, company_id uuid, is_active boolean, created_at timestamptz);
      CREATE TABLE public.company_info(id bigint PRIMARY KEY, name text, address text);
      CREATE TABLE public.invites(id uuid PRIMARY KEY, company_id uuid, email text, token text, status text, created_at timestamp);
      CREATE TABLE public.company_modules(id uuid PRIMARY KEY, company_id uuid, module_name text, is_active boolean);
      CREATE TABLE public.bookings(id uuid PRIMARY KEY, source text, guest text);
      INSERT INTO company_users VALUES
        ('${MEMBER_A}','${A}','member'),
        ('${ADMIN_A}','${A}','admin'),
        ('${MEMBER_B}','${B}','member');
      INSERT INTO companies(id,name) VALUES ('${A}','Tenant A'),('${B}','Tenant B');
      INSERT INTO sites VALUES (11,'Site A','${A}'),(22,'Site B','${B}');
      INSERT INTO tasks(id,name,site_id,company_id) VALUES
        (111,'Legacy A',11,NULL),(222,'Legacy B',22,NULL);
      INSERT INTO company_info(id,name) VALUES (1,'Legacy global');
      INSERT INTO invites(id,company_id,email) VALUES
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','${A}','a@example.test'),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','${B}','b@example.test');
      INSERT INTO company_modules(id,company_id,module_name) VALUES
        ('cccccccc-cccc-cccc-cccc-cccccccccccc','${A}','hours'),
        ('dddddddd-dddd-dddd-dddd-dddddddddddd','${B}','hours');
      INSERT INTO bookings(id,guest) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Fictional');
      ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Acces Total Public" ON public.company_info FOR ALL TO public USING (true) WITH CHECK (true);
      ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Allow all for authenticated users" ON public.tasks FOR ALL TO public
        USING (auth.uid() IS NOT NULL);
      CREATE POLICY "multi-tenant-safe" ON public.tasks FOR ALL TO public USING (true);
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    `);
    await as(db, MEMBER_A);
    assert.equal((await values(db, 'SELECT id FROM public.tasks')).length, 2);
    await as(db, MEMBER_A, 'anon');
    assert.equal((await values(db, 'SELECT id FROM public.companies')).length, 2);
    await db.exec('RESET ROLE');
    const migration = await readFile(new URL('../docs/collective-hours/proposed-tenant-rls-hardening.sql', import.meta.url), 'utf8');
    await db.exec(migration);

    await as(db, MEMBER_A, 'anon');
    assert.equal((await values(db, 'SELECT id FROM public.companies')).length, 0);
    assert.equal((await values(db, 'SELECT id FROM public.company_info')).length, 0);
    assert.equal((await values(db, 'SELECT id FROM public.bookings')).length, 0);
    await as(db, MEMBER_A);
    assert.deepEqual((await values(db, 'SELECT id FROM public.tasks ORDER BY id')).map(x => Number(x.id)), [111]);
    assert.deepEqual((await values(db, 'SELECT name FROM public.companies')).map(x => x.name), ['Tenant A']);
    assert.equal((await values(db, 'SELECT id FROM public.invites')).length, 0);
    assert.equal((await values(db, 'SELECT id FROM public.company_modules')).length, 1);
    await as(db, ADMIN_A);
    assert.equal((await values(db, 'SELECT id FROM public.invites')).length, 1);
    assert.equal((await values(db, 'SELECT id FROM public.tasks')).length, 1);
    await as(db, MEMBER_B);
    assert.deepEqual((await values(db, 'SELECT id FROM public.tasks')).map(x => Number(x.id)), [222]);
    await as(db, NOT_MEMBER);
    assert.equal((await values(db, 'SELECT id FROM public.tasks')).length, 0);
    assert.equal((await values(db, 'SELECT id FROM public.companies')).length, 0);
  } finally {
    await db.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('SQL réel : calculs, corrections, clés, isolation et permissions', async () => {
 const db = new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE company_users(user_id uuid,company_id uuid,role text);
 CREATE TABLE users(id text,company_id uuid);
 CREATE TABLE sites(id bigint,name text,company_id uuid,planned_hours numeric);
 CREATE TABLE project_tasks(id bigint,project_id bigint,name text,planned_hours numeric);
 CREATE TABLE time_sessions(user_id text,company_id uuid,site_id bigint,section_id bigint,punch_start_at timestamptz,punch_end_at timestamptz,corrected_start_at timestamptz,corrected_end_at timestamptz,duration_hours numeric);
 INSERT INTO company_users VALUES ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','member');
 INSERT INTO users VALUES ('employee','10000000-0000-0000-0000-000000000001'),('colleague','10000000-0000-0000-0000-000000000001'),('foreign','20000000-0000-0000-0000-000000000001');
 INSERT INTO sites VALUES (1,'Chantier fictif','10000000-0000-0000-0000-000000000001',50),(2,'Chantier fictif','10000000-0000-0000-0000-000000000001',null),(3,'Autre entreprise','20000000-0000-0000-0000-000000000001',20);
 INSERT INTO project_tasks VALUES (10,1,'Démolition',50),(20,2,'Démolition',0);
 INSERT INTO time_sessions VALUES
 ('employee','10000000-0000-0000-0000-000000000001',1,10,'2026-11-16 08:00Z','2026-11-17 00:00Z',null,null,null),
 ('colleague','10000000-0000-0000-0000-000000000001',1,10,'2026-01-01 00:00Z','2026-01-02 00:00Z',null,'2026-01-02 02:00Z',null),
 ('colleague','10000000-0000-0000-0000-000000000001',2,20,'2026-01-01 00:00Z','2026-01-01 02:00Z',null,null,3),
 ('colleague','10000000-0000-0000-0000-000000000001',1,10,'2026-01-01 00:00Z',null,null,null,100),
 ('foreign','20000000-0000-0000-0000-000000000001',1,10,'2026-01-01 00:00Z','2026-01-02 00:00Z',null,null,100),
 ('colleague','10000000-0000-0000-0000-000000000001',1,10,'2026-01-02 00:00Z','2026-01-01 00:00Z',null,null,100);
 `);
 await db.exec(await readFile(new URL('../docs/collective-hours/proposed-migration.sql',import.meta.url),'utf8'));
 const call = `SELECT * FROM public.collective_hours_progress('10000000-0000-0000-0000-000000000001')`;
 await assert.rejects(db.query(call), /Accès refusé/);
 await db.exec(`SET ROLE authenticated; SET test.uid='00000000-0000-0000-0000-000000000001'`);
 const {rows} = await db.query(call);
 assert.equal(rows.length,4);
 assert.equal(Number(rows.find(r=>r.kind==='site'&&r.site_id==='1').consumed_hours),42);
 assert.equal(Number(rows.find(r=>r.kind==='task'&&r.section_id==='20').consumed_hours),3);
 assert.equal(rows.find(r=>r.site_id==='2').budget_hours,null);
 assert.deepEqual(Object.keys(rows[0]).sort(),['kind','site_id','section_id','name','site_name','budget_hours','consumed_hours'].sort());
 await assert.rejects(db.query(`SELECT * FROM public.collective_hours_progress('20000000-0000-0000-0000-000000000001')`), /Accès refusé/);
 await assert.rejects(db.query('SELECT * FROM public.time_sessions'), /permission denied/);
 await db.exec("RESET ROLE; UPDATE company_users SET role='admin'; SET ROLE authenticated");
 assert.equal((await db.query(call)).rows.length,4);
 await assert.rejects(db.query("SELECT * FROM public.collective_hours_progress('20000000-0000-0000-0000-000000000001')"), /Accès refusé/);
 await db.exec('RESET ROLE; SET ROLE anon');
 await assert.rejects(db.query(call), /permission denied/);
 await db.close();
});

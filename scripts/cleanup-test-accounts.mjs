// One-shot: deletes test accounts (@example.com) created during QA, plus their
// memberships, reset tokens, and the empty companies they created. The demo
// company is preserved (its user isn't @example.com). Run once:
//   cd ~/facturamea && node scripts/cleanup-test-accounts.mjs
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const c = await pool.connect();

const test = (await c.query("select id, company_id from users where email like '%@example.com'")).rows;
const ids = test.map((r) => r.id);
const cids = [...new Set(test.map((r) => r.company_id).filter(Boolean))];
console.log('test accounts found:', ids.length, '| companies:', cids.length);

if (ids.length) {
  await c.query('delete from password_reset_tokens where user_id = ANY($1)', [ids]);
  await c.query('delete from user_company_memberships where user_id = ANY($1)', [ids]);
  const du = await c.query('delete from users where id = ANY($1)', [ids]);
  console.log('users deleted:', du.rowCount);
  // delete only companies that now have no users (the test signups); demo stays.
  const dc = await c.query('delete from companies where id = ANY($1) and not exists (select 1 from users u where u.company_id = companies.id)', [cids]);
  console.log('empty test companies deleted:', dc.rowCount);
} else {
  console.log('nothing to clean.');
}
c.release();
await pool.end();

// Daily blog generator using Claude Code (the `claude` CLI) on the user's
// claude.ai SUBSCRIPTION — never the pay-per-token Anthropic API.
//
//   1. GET the next article prompt from the prod publish endpoint.
//   2. Run `claude -p <prompt>` with ANTHROPIC_API_KEY UNSET so the CLI uses the
//      claude.ai login (not API credits).
//   3. POST the raw output back; the endpoint parses + stores + pings IndexNow.
//
// Env: CRON_SECRET (required), BLOG_BASE_URL (default https://facturamea.com),
//      CLAUDE_BIN (default `claude`).
import { execFileSync } from 'node:child_process';

const BASE = (process.env.BLOG_BASE_URL || 'https://facturamea.com').replace(/\/$/, '');
const SECRET = process.env.CRON_SECRET;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const stamp = () => new Date().toISOString();

if (!SECRET) { console.error(`${stamp()} CRON_SECRET lipsește`); process.exit(1); }
const auth = { Authorization: `Bearer ${SECRET}` };

try {
  // 1) Ask the server for the next prompt (topic selection lives there, with the DB).
  const g = await fetch(`${BASE}/api/cron/blog-publish`, { headers: auth });
  const gj = await g.json().catch(() => ({}));
  if (!g.ok || !gj.ok || !gj.prompt) {
    console.error(`${stamp()} GET prompt failed`, g.status, JSON.stringify(gj).slice(0, 300));
    process.exit(1);
  }

  // 2) Generate with Claude Code on the subscription — strip the API key for this call.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const raw = execFileSync(CLAUDE_BIN, ['-p', gj.prompt], {
    env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 6 * 60 * 1000,
  });

  if (!raw || raw.replace(/\s+/g, '').length < 200) {
    console.error(`${stamp()} claude output empty/short:`, JSON.stringify(raw).slice(0, 200));
    process.exit(1);
  }

  // 3) Publish.
  const p = await fetch(`${BASE}/api/cron/blog-publish`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  const pj = await p.json().catch(() => ({}));
  console.log(`${stamp()} ${JSON.stringify(pj)}`);
  process.exit(pj.ok ? 0 : 1);
} catch (e) {
  console.error(`${stamp()} error:`, String(e?.message || e).slice(0, 400));
  process.exit(1);
}

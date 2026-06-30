// Generates one SEO blog article (Romanian) via Claude. Returns clean HTML body
// + metadata. Used by the daily auto-publish cron. Sonnet for quality, Haiku fallback.
import type { BlogTopic } from './blog-topics';

const PRIMARY_MODEL = 'claude-sonnet-4-6';
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';

export interface GeneratedArticle {
  title: string;
  description: string;
  keywords: string;
  bodyHtml: string;
  readMinutes: number;
}

const SYSTEM = `Ești redactor SEO senior pentru facturamea, un program de facturare online din România (facturi, e-Factura ANAF, e-Transport, SAF-T, gestiune, contabilitate; plată unică, fără abonament).
Scrii articole de blog în limba română, corecte fiscal, practice și optimizate pentru căutare Google.
Reguli stricte:
- Limba română, ton clar și profesionist, pe înțelesul unui antreprenor/PFA fără cunoștințe contabile avansate.
- NU folosi NICIODATĂ liniuța lungă (—); folosește virgulă, punct sau două puncte.
- Corectitudine fiscală: nu inventa cifre/termene; dacă un detaliu depinde de an sau de situație, spune-o explicit. Contextul e România, anul 2026.
- Structură SEO: introducere scurtă care răspunde direct la întrebarea-cheie, apoi secțiuni cu <h2> și <h3>, paragrafe <p>, liste <ul><li>.
- Cuvinte cheie: folosește NATURAL cuvintele cheie țintă PLUS variații, sinonime și termeni înrudiți (LSI) în titlul primului <h2>, în primul paragraf și pe parcurs. Acoperă întrebări conexe ("ce este", "cum se face", "cine, când, cât"). Fără keyword stuffing.
- Încheie OBLIGATORIU cu o secțiune <h2>Întrebări frecvente</h2> cu 3-4 perechi: întrebare ca <h3> (formulată ca o căutare reală, long-tail) + răspuns scurt ca <p>. Ajută la featured snippets.
- Menționează facturamea natural, de maximum 1-2 ori, ca soluție practică (ex: "într-un program ca facturamea poți..."), fără să sune ca reclamă.
- Lungime: 1000-1500 cuvinte.
- Output: DOAR HTML pentru corpul articolului (fără <html>, <head>, <h1>, fără markdown). Permise: <h2> <h3> <p> <ul> <ol> <li> <strong> <em> <a>. Fără stiluri inline, fără clase.
Răspunde EXACT în formatul de mai jos, fără text în plus, fără markdown, fără JSON. Câmpurile de antet pe câte o linie, apoi marcajul ===CORP=== și DOAR corpul HTML după el:
TITLU: <titlul rafinat>
DESCRIERE: <meta description, maximum 155 caractere>
KEYWORDS: <cuvant1, cuvant2, cuvant3>
===CORP===
<h2>...</h2><p>...</p>...`;

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function callModel(model: string, topic: BlogTopic, apiKey: string): Promise<GeneratedArticle> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const user = `Scrie articolul pentru subiectul:
Titlu de lucru: ${topic.title}
Categorie: ${topic.category}
Cuvinte cheie țintă: ${topic.keywords}
Ce trebuie să acopere: ${topic.brief}

Rafinează titlul ca să fie atractiv și bun pentru SEO. Returnează DOAR JSON-ul.`;
  const resp = await client.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  });
  const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  // Delimiter format (not JSON): the HTML body lives after ===CORP=== and needs no
  // escaping, so unescaped quotes/newlines in the article can't break parsing.
  const parts = text.split(/===\s*CORP\s*===/i);
  const head = parts[0] || '';
  const bodyHtml = (parts[1] || '')
    .replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '')
    .replace(/—/g, ', ').trim();
  if (!bodyHtml || bodyHtml.length < 200) throw new Error('corp prea scurt');
  const grab = (k: string) => head.match(new RegExp(`${k}\\s*:\\s*(.+)`, 'i'))?.[1].trim() || '';
  const words = bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return {
    title: (grab('TITLU') || topic.title).slice(0, 295).replace(/—/g, ','),
    description: grab('DESCRIERE').slice(0, 395).replace(/—/g, ','),
    keywords: (grab('KEYWORDS') || topic.keywords).slice(0, 500),
    bodyHtml,
    readMinutes: Math.max(2, Math.round(words / 200)),
  };
}

// When the curated queue is exhausted, ask Claude for a fresh, non-duplicate topic.
export async function proposeFreshTopic(existingSlugs: string[]): Promise<BlogTopic> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY lipsește');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: FALLBACK_MODEL,
    max_tokens: 500,
    system: 'Propui subiecte de blog SEO pentru un program de facturare din România (facturare, e-Factura, TVA, ANAF, gestiune, contabilitate, antreprenoriat). Răspunde DOAR cu JSON.',
    messages: [{ role: 'user', content: `Propune UN subiect nou, util și căutat în Google, care NU se suprapune cu sloturile deja folosite: ${existingSlugs.join(', ') || '(niciunul)'}.
Returnează DOAR: {"slug":"kebab-case-fara-diacritice","title":"...","keywords":"kw1, kw2","category":"...","brief":"ce trebuie să acopere articolul"}` }],
  });
  const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const t = JSON.parse(stripFence(text));
  return {
    slug: String(t.slug || `subiect-${existingSlugs.length + 1}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 190),
    title: String(t.title || 'Ghid facturare'), keywords: String(t.keywords || ''),
    category: String(t.category || 'Facturare'), brief: String(t.brief || t.title || ''),
  };
}

// ───────────────────────── Claude Code (terminal) path ─────────────────────────
// The daily blog is generated with the `claude` CLI (Claude Code) running on the
// user's claude.ai subscription, NOT the pay-per-token Anthropic API. These helpers
// build a single self-contained prompt and parse the raw CLI output, so the prod
// endpoint never calls Claude itself — it only hands out the prompt and stores the
// result. The SLUG + CATEGORIE are emitted on the first lines so publishing is
// stateless (no need to remember which topic was handed out).
export const BLOG_SYSTEM_PROMPT = SYSTEM;

export function buildArticlePrompt(topic: BlogTopic | null, usedSlugs: string[]): string {
  const head = topic
    ? `Scrie articolul pentru subiectul:
Titlu de lucru: ${topic.title}
Categorie: ${topic.category}
Cuvinte cheie țintă: ${topic.keywords}
Ce trebuie să acopere: ${topic.brief}

Pe PRIMELE două linii scrie EXACT:
SLUG: ${topic.slug}
CATEGORIE: ${topic.category}`
    : `Alege UN subiect nou, util și căutat în Google pentru un program de facturare din România (facturare, e-Factura, TVA, ANAF, gestiune, contabilitate, antreprenoriat), care NU se suprapune cu sloturile deja folosite: ${usedSlugs.join(', ') || '(niciunul)'}.
Pe PRIMELE două linii scrie:
SLUG: <kebab-case-fara-diacritice, nou si unic>
CATEGORIE: <categoria potrivita>`;
  return `${SYSTEM}

În PLUS față de formatul de mai sus, pune SLUG: și CATEGORIE: ca PRIMELE două linii, înainte de TITLU:.

${head}

Rafinează titlul pentru SEO. Returnează DOAR în formatul cerut (linii antet, apoi ===CORP=== și DOAR corpul HTML), fără niciun text în plus, fără markdown.`;
}

export interface ParsedArticle {
  slug: string; category: string; title: string; description: string;
  keywords: string; bodyHtml: string; readMinutes: number;
}

// Parse the raw `claude -p` output (delimiter format) into a storable article.
export function parseArticle(raw: string): ParsedArticle {
  const parts = String(raw).split(/===\s*CORP\s*===/i);
  const headTxt = parts[0] || '';
  const bodyHtml = (parts[1] || '')
    .replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '')
    .replace(/—/g, ', ').trim();
  const grab = (k: string) => headTxt.match(new RegExp(`${k}\\s*:\\s*(.+)`, 'i'))?.[1].trim() || '';
  const words = bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return {
    slug: grab('SLUG').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 190),
    category: grab('CATEGORIE').slice(0, 60) || 'Facturare',
    title: (grab('TITLU')).slice(0, 295).replace(/—/g, ','),
    description: grab('DESCRIERE').slice(0, 395).replace(/—/g, ','),
    keywords: grab('KEYWORDS').slice(0, 500),
    bodyHtml,
    readMinutes: Math.max(2, Math.round(words / 200)),
  };
}

export async function generateArticle(topic: BlogTopic): Promise<GeneratedArticle> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY lipsește');
  try {
    return await callModel(PRIMARY_MODEL, topic, apiKey);
  } catch (e) {
    console.error('blog: primary model failed, falling back:', (e as Error).message);
    return await callModel(FALLBACK_MODEL, topic, apiKey);
  }
}

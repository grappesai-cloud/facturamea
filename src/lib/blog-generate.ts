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
Răspunde EXCLUSIV cu un obiect JSON valid, fără text în plus, de forma:
{"title":"...","description":"...(max 155 caractere, meta description)","keywords":"kw1, kw2, kw3","bodyHtml":"<h2>...</h2><p>...</p>...","readMinutes":6}`;

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
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  });
  const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const parsed = JSON.parse(stripFence(text));
  const bodyHtml = String(parsed.bodyHtml || '').replace(/—/g, ', ').trim();
  if (!bodyHtml || bodyHtml.length < 200) throw new Error('corp prea scurt');
  const words = bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return {
    title: String(parsed.title || topic.title).slice(0, 295).replace(/—/g, ','),
    description: String(parsed.description || '').slice(0, 395).replace(/—/g, ','),
    keywords: String(parsed.keywords || topic.keywords).slice(0, 500),
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

// F1010 — Situații financiare anuale (official annual financial statements, ANAF).
//
// This generator produces the F1010 XML following the official logical structure:
//   • identificare (declarant: cui, denumire, adresă)
//   • Formular 10 (Bilanț) — indicatori activ / pasiv
//   • Formular 20 (Cont de profit și pierdere) — venituri / cheltuieli / rezultat
//
// IMPORTANT — exactly like D406 SAF-T (lib/d406-saft.ts) and D112 (lib/d112.ts),
// this XML MUST be validated with the ANAF DUK Integrator (validare DUK) against
// the CURRENT official S1010/F1010 XSD before being filed. The element names, the
// namespace/version (mfp:anaf:dgti:bilant:declaratie:v1 below is a best-effort
// placeholder) and especially the row codes (nr_cr / "rând" numbers) follow the
// published F1010 form layout but the XSD revision changes year-to-year; adjust
// the flagged spots after the first DUK run. XSD-valid != DUK-accepted: DUK also
// enforces business rules and the official indicator nomenclature.
//
// F1010 amounts are reported in WHOLE LEI (rounded), not bani — same as D112.

import type { BilantResult } from './bilant';

export interface F1010Company {
  cui: string | null;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
}
export interface F1010Args {
  year: number;
  company: F1010Company;
  bilant: BilantResult;
}

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
// F1010 reports whole lei (rounded half-up), like D112.
const lei = (cents: number) => Math.round((cents || 0) / 100);
const cuiDigits = (cui: string | null | undefined) => (cui ?? '').replace(/^RO/i, '').replace(/\D/g, '');

export function generateF1010Xml(args: F1010Args): string {
  const { year, company, bilant } = args;
  const cui = cuiDigits(company.cui);
  const adresa = esc([company.address, company.city].filter(Boolean).join(', '));

  // --- Bilanț values (whole lei) ---
  const activeImobilizate = lei(bilant.activ.imobilizate);
  const activeCirculante = lei(bilant.activ.stocuri + bilant.activ.creante + bilant.activ.casaBanci);
  const stocuri = lei(bilant.activ.stocuri);
  const creante = lei(bilant.activ.creante);
  const casaBanci = lei(bilant.activ.casaBanci);
  const totalActive = lei(bilant.activ.total);
  const capitaluri = lei(bilant.pasiv.capitaluri);
  const datorii = lei(bilant.pasiv.datorii);
  const totalPasive = lei(bilant.pasiv.total);

  // --- Cont de profit și pierdere values (whole lei) ---
  const venituri = lei(bilant.pnl.venituri);
  const cheltuieli = lei(bilant.pnl.cheltuieli);
  const rezultat = lei(bilant.pnl.rezultat);
  const profit = rezultat >= 0 ? rezultat : 0;
  const pierdere = rezultat < 0 ? -rezultat : 0;

  // Formular 10 (Bilanț) — indicator rows.
  // nr_cr = numărul rândului din formularul F1010 (cf. OMFP). These row numbers
  // are the conventional F1010 layout positions but MUST be confirmed with DUK
  // against the current XSD — they shift between reporting-year revisions.
  const f10Rows: Array<{ nr: string; den: string; val: number }> = [
    { nr: '01', den: 'Active imobilizate - total', val: activeImobilizate },
    { nr: '02', den: 'Active circulante - total', val: activeCirculante },
    { nr: '03', den: 'Stocuri', val: stocuri },
    { nr: '04', den: 'Creanțe', val: creante },
    { nr: '05', den: 'Casa și conturi la bănci', val: casaBanci },
    { nr: '06', den: 'TOTAL ACTIVE', val: totalActive },
    { nr: '07', den: 'Capitaluri proprii - total', val: capitaluri },
    { nr: '08', den: 'Datorii - total', val: datorii },
    { nr: '09', den: 'TOTAL CAPITALURI ȘI DATORII (PASIVE)', val: totalPasive },
  ];

  // Formular 20 (Cont de profit și pierdere) — indicator rows.
  // Same caveat: nr_cr values confirmed with DUK.
  const f20Rows: Array<{ nr: string; den: string; val: number }> = [
    { nr: '01', den: 'Venituri totale', val: venituri },
    { nr: '02', den: 'Cheltuieli totale', val: cheltuieli },
    { nr: '03', den: 'Profitul sau pierderea exercițiului - Profit', val: profit },
    { nr: '04', den: 'Profitul sau pierderea exercițiului - Pierdere', val: pierdere },
  ];

  const rowsXml = (rows: Array<{ nr: string; den: string; val: number }>) =>
    rows.map((r) => `      <rd nr_cr="${r.nr}" den="${esc(r.den)}" val="${r.val}"/>`).join('\n');

  // Root <bilant>: an = anul de raportare. The xmlns/version is a placeholder to
  // be confirmed via DUK (see header note).
  return `<?xml version="1.0" encoding="UTF-8"?>
<bilant an="${year}" tip_situatie="BL" xmlns="mfp:anaf:dgti:bilant:declaratie:v1">
  <identificare>
    <cui>${esc(cui)}</cui>
    <den>${esc(company.name)}</den>
    <adresa>${adresa}</adresa>
    <telefon>${esc(company.phone || '')}</telefon>
    <email>${esc(company.email || '')}</email>
  </identificare>
  <formular cod="10" den="Bilanț">
${rowsXml(f10Rows)}
  </formular>
  <formular cod="20" den="Cont de profit și pierdere">
${rowsXml(f20Rows)}
  </formular>
</bilant>
`;
}

// Situații financiare anuale — micro-entities (S1005, root <Bilant1005>, namespace
// mfp:anaf:dgti:s1005:declaratie:v14). There is NO "F1010" for ordinary companies;
// the annual statements are the S1002 (large/medium) / S1003 (small) / S1005
// (micro) family — facturamea targets micro → S1005. Attribute-driven like D112
// (NOT <rd> rows). XSD `s1005.xsd`, structura_SC.pdf (OMF 2036/2025).
//
// ⚠ DRAFT — does NOT pass DUK yet. Known gaps (need product/schema work):
//   • regCom, caen, county code, declarant — not stored on `companies` (placeholders).
//   • Block F30 (Date informative) is DUK-mandatory but needs headcount + tax data
//     the bilanț engine doesn't have — OMITTED here.
//   • F20 micro split (cifra afaceri / costuri / personal …) is approximated from
//     the coarse venituri/cheltuieli buildBilant returns.
// Column convention: `…2` = current year (sold la sfârșit), `…1` = prior (opening).
// Amounts in WHOLE LEI. Validate with soft J / DUK before any filing.

import type { BilantResult } from './bilant';

export interface F1010Company {
  cui: string | null;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  regCom?: string | null;
  caen?: string | null;
  countyCode?: string | null; // ANAF județ code 1..52 (excl. 41 for sediu)
}
export interface F1010Declarant { admin: string; intocmit: string; calitate?: string }
export interface F1010Args {
  year: number;
  company: F1010Company;
  bilant: BilantResult;
  declarant?: F1010Declarant;
}

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const lei = (cents: number) => Math.round((cents || 0) / 100);
const cuiDigits = (cui: string | null | undefined) => (cui ?? '').replace(/^RO/i, '').replace(/\D/g, '');

export function generateF1010Xml(args: F1010Args): string {
  const { year, company, bilant } = args;
  const cui = cuiDigits(company.cui);

  // Bilanț values (whole lei, current year).
  const imob = lei(bilant.activ.imobilizate);
  const stocuri = lei(bilant.activ.stocuri);
  const creante = lei(bilant.activ.creante);
  const casa = lei(bilant.activ.casaBanci);
  const activeCirc = stocuri + creante + casa;
  const datorii = lei(bilant.pasiv.datorii);
  const capitaluri = lei(bilant.pasiv.capitaluri);
  const venituri = lei(bilant.pnl.venituri);
  const cheltuieli = lei(bilant.pnl.cheltuieli);
  const rezultat = lei(bilant.pnl.rezultat);
  const profit = rezultat >= 0 ? rezultat : 0;
  const pierdere = rezultat < 0 ? -rezultat : 0;

  // F10 — balance sheet (variant F10_BS). `…2` = current. Sub-totals kept
  // consistent for the corel.dubla identity (0492 = 0042 + 0092 − 0132).
  const f10: Record<string, number> = {
    F10_0022: imob, F10_0042: imob,            // imobilizate (all into corporale)
    F10_0052: stocuri,                          // stocuri
    F10_3012: creante, F10_0062: creante,       // creanțe
    F10_0082: casa,                             // casa și bănci
    F10_0092: activeCirc,                       // active circulante total
    F10_0132: datorii,                          // datorii ≤ 1 an
    F10_0142: activeCirc - datorii,             // active circ. nete
    F10_0152: imob + activeCirc - datorii,      // total active − datorii curente
    F10_0292: capitaluri, F10_0302: capitaluri, // capital
    F10_0432: profit, F10_0442: pierdere,       // rezultat
    F10_0462: capitaluri, F10_0492: capitaluri, // capitaluri proprii / total
  };
  // F20 — micro P&L (approximated from coarse totals: all venituri → cifra de
  // afaceri, all cheltuieli → alte cheltuieli). Refine when the engine splits.
  const f20: Record<string, number> = {
    F20_0012: venituri, F20_0062: cheltuieli,
    F20_0082: profit, F20_0092: pierdere,
  };

  // Both columns: prior (`…1`) defaults to 0 (acceptable for a first year).
  const attrs = (obj: Record<string, number>) =>
    Object.entries(obj).map(([k, v]) => `${k.replace(/2$/, '1')}="0" ${k}="${v}"`).join(' ');

  const adresa = esc(`Localitate:${company.city || '-'},Strada:${company.address || '-'},`);
  const decl = args.declarant || { admin: company.name, intocmit: company.name, calitate: '13' };
  const totalPlata = capitaluri;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Bilant1005 xmlns="mfp:anaf:dgti:s1005:declaratie:v14" luna="12" an="${year}" cui="${esc(cui)}" den="${esc(company.name.slice(0, 50))}" adresa="${adresa}" telefon="${esc(company.phone || '')}" regCom="${esc(company.regCom || '')}" caen="${esc(company.caen || '')}" caenE="${esc(company.caen || '')}" bifa_aprob="1" AN_CAEN="2025" bifaMC="0" bifaDD="0" bifaGG="0" bifaAA="0" bifa_art27="0" tipBIL="UU" interes_public="0" codTT="${esc(company.countyCode || '40')}" codJJ="${esc(company.countyCode || '40')}" codPP="35" nume_admin="${esc(decl.admin)}" nume_intocmit="${esc(decl.intocmit)}" calit_intocmit="${esc(decl.calitate || '13')}" totalPlata_A="${totalPlata}">
  <F10 ${attrs(f10)}/>
  <F20 ${attrs(f20)}/>
</Bilant1005>
`;
}

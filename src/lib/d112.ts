// Declarația 112 — obligații de plată a contribuțiilor sociale, impozitului pe
// venit și evidența nominală (ANAF). REAL schema: root <declaratieUnica>,
// namespace mfp:anaf:dgti:declaratie_unica:declaratie:v6 (XSD d112_10102024.xsd).
// The format is ATTRIBUTE-DRIVEN (almost no text-content elements).
//
// Structure:
//   declaratieUnica[luna_r,an_r,nume_declar,prenume_declar,functie_declar]
//     angajator[cif,caen,den,casaAng,datCAM,bifa_CAM,totalPlata_A]
//       angajatorA × 4  — global fiscal obligations (impozit/CAS/CASS/CAM)
//       angajatorB      — headcount + total gross fund
//       angajatorC4     — CAM base + amount
//     asigurat[idAsig,cnpAsig,numeAsig,prenAsig,dataAng,asigCI,asigSO,Timp_E3] × N
//       asiguratA       — per-employee CAS/CASS detail
//       asiguratE3      — per-employee income-tax detail (mandatory)
//
// Obligation codes (Nomenclator 3): impozit=602, CAS=412, CASS=432, CAM=480.
// ⚠ A_codBugetar: the bundled XSD enum is STALE and disagrees with the official
// nomenclator. We emit the real-family code and the file MUST be validated with
// ANAF DUK Integrator before filing (xmllint will flag A_codBugetar — expected).
// Amounts are WHOLE LEI (rounded). CIF/CNP are digits-only.

export interface D112Company {
  cui: string | null;
  name: string;
  address: string | null;
  city: string | null;
  caen?: string | null;
  casaAng?: string | null; // county code (_B, AB, AR, …); default _B
  email?: string | null;
  phone?: string | null;
}
export interface D112Declarant { nume: string; prenume: string; functie: string; }
export interface D112Asigurat {
  cnp: string | null;
  fullName: string;
  baseSalaryCents: number;
  workedGrossCents: number;
  casCents: number;
  cassCents: number;
  taxCents: number;
  taxableCents: number;
  netCents: number;
  camCents: number;
  deductionCents: number;
  nrDependents: number;
  hiredAt: string | null;        // ISO date or null
  employmentType: string | null; // 'full_time' | 'part_time'
}
export interface D112Args {
  year: number;
  month: number; // 1-12
  rectificativa?: boolean;
  company: D112Company;
  declarant: D112Declarant;
  asigurati: D112Asigurat[];
}
export interface D112Result { xml: string; included: number; skippedNoCnp: number; }

// Escape an XML ATTRIBUTE value.
const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const lei = (cents: number) => Math.round((cents || 0) / 100);
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const cuiDigits = (cui: string | null | undefined) => (cui ?? '').replace(/^RO/i, '').replace(/\D/g, '');
const validCnp = (cnp: string | null | undefined) => /^[1-9]\d{12}$/.test(digits(cnp));
// hiredAt ISO → ANAF date d.m.yyyy
const anafDate = (iso: string | null | undefined, year: number, month: number): string => {
  if (iso) { const d = new Date(iso); if (!isNaN(d.getTime())) return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`; }
  return `1.${month}.${year}`;
};
// Real budget code (cod bugetar) — placeholder of the 5503 family; the exact
// per-obligation digits are confirmed by DUK Integrator (the XSD enum is stale).
const COD_BUGETAR = '5503000000';

export function generateD112Xml(args: D112Args): D112Result {
  const { year, month, company, declarant } = args;
  const cif = cuiDigits(company.cui);
  const casaAng = company.casaAng && /^(_B|_A|_T|[A-Z]{2})$/.test(company.casaAng) ? company.casaAng : '_B';

  // Only employees with a valid 13-digit CNP can be filed; recompute the totals
  // from the included rows so the declaration cross-checks stay consistent.
  const all = args.asigurati || [];
  const included = all.filter((a) => validCnp(a.cnp));
  const skippedNoCnp = all.length - included.length;

  let tImp = 0, tCas = 0, tCass = 0, tCam = 0, tGross = 0;
  for (const a of included) {
    tImp += lei(a.taxCents); tCas += lei(a.casCents); tCass += lei(a.cassCents);
    tCam += lei(a.camCents); tGross += lei(a.workedGrossCents);
  }
  const totalPlata = tImp + tCas + tCass + tCam;

  const oblig = (cod: string, val: number) =>
    `    <angajatorA A_codOblig="${cod}" A_codBugetar="${COD_BUGETAR}" A_datorat="${val}" A_deductibil="0" A_scutit="0" A_plata="${val}"/>`;

  const angajatorA = [oblig('602', tImp), oblig('412', tCas), oblig('432', tCass), oblig('480', tCam)].join('\n');

  const n = included.length;
  const angajatorB =
    `    <angajatorB B_cnp="${n}" B_sanatate="${n}" B_pensie="${n}" B_brutSalarii="${tGross}" B_sal="${n}"/>`;
  const angajatorC4 = `    <angajatorC4 C4_baza="${tGross}" C4_ct="${tCam}"/>`;

  const asiguratiXml = included.map((a, i) => {
    const parts = a.fullName.trim().split(/\s+/);
    const nume = esc(parts[0] || '-');
    const pren = esc(parts.slice(1).join(' ') || '-');
    const gross = lei(a.workedGrossCents);
    const cas = lei(a.casCents);
    const cass = lei(a.cassCents);
    const tax = lei(a.taxCents);
    const net = lei(a.netCents);
    const taxable = lei(a.taxableCents);
    const a3 = a.employmentType === 'part_time' ? 'P1' : 'N';
    return `  <asigurat idAsig="${i + 1}" cnpAsig="${digits(a.cnp)}" numeAsig="${nume}" prenAsig="${pren}" dataAng="${anafDate(a.hiredAt, year, month)}" asigCI="1" asigSO="1" Timp_E3="${tax}">
    <asiguratA A_1="1" A_2="0" A_3="${a3}" A_4="8" A_5="${gross}" A_11="${gross}" A_12="${cass}" A_13="${gross}" A_14="${cas}" A_sal1="${lei(a.baseSalaryCents)}" A_sal2="${gross}"/>
    <asiguratE3 E3_1="A" E3_2="1" E3_3="1" E3_4="P" E3_8="${gross}" E3_9="${cas + cass}" E3_14="${taxable}" E3_15="${tax}" E3_16="${net}" E3_19="0" E3_21="0"/>
  </asigurat>`;
  }).join('\n');

  const recAttrs = args.rectificativa ? ' d_rec="1" tip_rec="1"' : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<declaratieUnica xmlns="mfp:anaf:dgti:declaratie_unica:declaratie:v6" luna_r="${month}" an_r="${year}"${recAttrs} nume_declar="${esc(declarant.nume) || '-'}" prenume_declar="${esc(declarant.prenume) || '-'}" functie_declar="${esc(declarant.functie) || 'Administrator'}">
  <angajator cif="${esc(cif)}" caen="${esc(company.caen || '')}" den="${esc(company.name)}" adrSoc="${esc([company.address, company.city].filter(Boolean).join(', '))}" mailSoc="${esc(company.email || '')}" telSoc="${esc(digits(company.phone))}" casaAng="${casaAng}" datCAM="1" bifa_CAM="1" totalPlata_A="${totalPlata}">
${angajatorA}
${angajatorB}
${angajatorC4}
  </angajator>
${asiguratiXml}
</declaratieUnica>
`;
  return { xml, included: included.length, skippedNoCnp };
}

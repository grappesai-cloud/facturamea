// Declarația 112 — obligații de plată a contribuțiilor sociale, impozitului pe
// venit și evidența nominală a persoanelor asigurate (ANAF).
//
// This generator produces the D112 XML following the official logical structure:
//   • angajator (declarant)
//   • Anexa 1 — creanțe fiscale: impozit pe salarii (444), CAS, CASS, CAM
//   • Anexa 1.2 — asigurat: nominal record per employee (CNP, baze, contribuții)
//
// IMPORTANT — like D406 SAF-T, this must be validated with ANAF DUK Integrator
// against the current official D112 XSD before being filed. Element/attribute
// names and budget codes (cod_bug) below follow the published D112 model but the
// XSD version changes; adjust the few flagged spots after a DUK run.
//
// D112 amounts are reported in WHOLE LEI (rounded), not bani.

export interface D112Company {
  cui: string | null;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  caen?: string | null;
}
export interface D112Asigurat {
  cnp: string | null;
  fullName: string;
  grossCents: number;
  casCents: number;
  cassCents: number;
  taxCents: number;
}
export interface D112Args {
  year: number;
  month: number; // 1-12
  rectificativa?: boolean;
  company: D112Company;
  asigurati: D112Asigurat[];
  // run totals (cents)
  totalCasCents: number;
  totalCassCents: number;
  totalTaxCents: number;
  totalCamCents: number;
}

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
// D112 reports whole lei (rounded half-up).
const lei = (cents: number) => Math.round((cents || 0) / 100);
const cuiDigits = (cui: string | null | undefined) => (cui ?? '').replace(/^RO/i, '').replace(/\D/g, '');

export function generateD112Xml(args: D112Args): string {
  const { year, month, company, asigurati } = args;
  const cui = cuiDigits(company.cui);
  const rect = args.rectificativa ? 'D' : 'N';

  const impozit = lei(args.totalTaxCents);
  const cas = lei(args.totalCasCents);
  const cass = lei(args.totalCassCents);
  const cam = lei(args.totalCamCents);
  const totalPlata = impozit + cas + cass + cam;
  const nrAsig = asigurati.length;

  // Anexa 1 — creanțe fiscale. cod_bug values follow the D112 budget classification
  // (confirm against the current XSD with DUK).
  const creante = [
    { cod: '602', den: 'Impozit pe venituri din salarii', suma: impozit },
    { cod: '480', den: 'Contribuția de asigurări sociale (CAS)', suma: cas },
    { cod: '484', den: 'Contribuția de asigurări sociale de sănătate (CASS)', suma: cass },
    { cod: '510', den: 'Contribuția asiguratorie pentru muncă (CAM)', suma: cam },
  ];

  const creanteXml = creante
    .map((c) => `    <creanta cod_bug="${c.cod}" denumire="${esc(c.den)}" suma_datorata="${c.suma}" suma_de_plata="${c.suma}"/>`)
    .join('\n');

  const asiguratiXml = asigurati
    .map((a) => {
      const nameParts = a.fullName.trim().split(/\s+/);
      const nume = esc(nameParts[0] || '');
      const prenume = esc(nameParts.slice(1).join(' ') || '');
      const brut = lei(a.grossCents);
      return `    <asigurat cnp="${esc(a.cnp || '')}" nume="${nume}" prenume="${prenume}">
      <salariu_brut>${brut}</salariu_brut>
      <baza_cas>${brut}</baza_cas>
      <cas>${lei(a.casCents)}</cas>
      <baza_cass>${brut}</baza_cass>
      <cass>${lei(a.cassCents)}</cass>
      <impozit>${lei(a.taxCents)}</impozit>
    </asigurat>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<declaratie112 luna="${month}" an="${year}" tip_intocmire="1" d_rectificativa="${rect}" nrasig="${nrAsig}" totalplata_a="${totalPlata}" xmlns="mfp:anaf:dgti:declaratie112:declarator:v1">
  <angajator>
    <cui>${esc(cui)}</cui>
    <den>${esc(company.name)}</den>
    <adresa>${esc([company.address, company.city].filter(Boolean).join(', '))}</adresa>
    <caen>${esc(company.caen || '')}</caen>
    <telefon>${esc(company.phone || '')}</telefon>
    <email>${esc(company.email || '')}</email>
  </angajator>
  <creante_fiscale>
${creanteXml}
  </creante_fiscale>
${asiguratiXml}
</declaratie112>
`;
}

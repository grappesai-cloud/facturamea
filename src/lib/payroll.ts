// Romanian payroll engine (2026). Deterministic — no AI, no external calls.
//
// Standard full-time contributions on gross salary (salariu brut):
//   CAS  (pensie)            25%   — employee, withheld
//   CASS (sănătate)          10%   — employee, withheld
//   Impozit pe venit         10%   — employee, on (gross − CAS − CASS − deducere)
//   CAM  (asig. muncă)        2.25% — EMPLOYER, on top of gross
//
// Plus: automatic deducere personală (RO 2026 brackets) and concediu medical
// (sick leave) — a SIMPLIFIED v1 (see computeCM). Special regimes (IT/construction
// exemptions, multi-contract, accurate FNUASS base over 6 months) are out of scope;
// have the accountant review CM and the base before filing.

export const RO_PAYROLL_2026 = {
  casRate: 0.25,
  cassRate: 0.10,
  taxRate: 0.10,
  camRate: 0.0225,
  minWageCents: 405000, // salariul minim brut 2026 (4050 lei) — used for deducere
  workDays: 21,         // medie zile lucrătoare/lună (pentru concediu medical)
} as const;

// Cod indemnizație concediu medical → procent din baza de calcul.
export const CM_CODES: Record<string, { pct: number; label: string }> = {
  '01': { pct: 0.75, label: 'Boală obișnuită' },
  '02': { pct: 1.00, label: 'Accident de muncă' },
  '03': { pct: 1.00, label: 'Boli profesionale' },
  '05': { pct: 1.00, label: 'Boli grave / infectocontagioase' },
  '06': { pct: 0.85, label: 'Sarcină și lăuzie' },
  '09': { pct: 0.85, label: 'Îngrijire copil bolnav' },
  '15': { pct: 0.75, label: 'Risc maternal' },
};

// Deducere personală de bază (RO 2026). Applies for gross up to (minWage + 2000),
// decreasing linearly; percentage of the minimum wage by number of dependents.
export function computeDeducere(grossCents: number, nrDependents = 0, minWageCents: number = RO_PAYROLL_2026.minWageCents): number {
  const gross = Math.max(0, Math.round(grossCents || 0));
  const ceiling = minWageCents + 200000; // +2000 lei
  if (gross > ceiling) return 0;
  const pcts = [0.20, 0.25, 0.30, 0.35, 0.45]; // 0,1,2,3,4+ persoane în întreținere
  const pct = pcts[Math.min(Math.max(0, nrDependents), 4)];
  const base = pct * minWageCents;
  if (gross <= minWageCents) return Math.round(base);
  const factor = Math.max(0, 1 - (gross - minWageCents) / 200000);
  return Math.round(base * factor);
}

export interface CMBreakdown {
  days: number;
  code: string | null;
  pct: number;
  indemnizationCents: number; // total indemnizație CM
  employerCents: number;      // primele 5 zile, suportate de angajator
  fnuassCents: number;        // restul, recuperabil de la FNUASS
}

// Concediu medical (sick leave) — SIMPLIFIED v1: daily base = salariu brut / 21,
// indemnizație = bază zilnică × zile × procent(cod). Primele 5 zile = angajator,
// restul = FNUASS (recuperabil). Baza reală e media ultimelor 6 luni, plafonată —
// de confirmat cu contabilul.
export function computeCM(baseSalaryCents: number, cmDays: number, cmCode: string | null, workDays: number = RO_PAYROLL_2026.workDays): CMBreakdown {
  if (!cmDays || cmDays <= 0) return { days: 0, code: cmCode || null, pct: 0, indemnizationCents: 0, employerCents: 0, fnuassCents: 0 };
  const pct = (cmCode && CM_CODES[cmCode]?.pct) || 0.75;
  const days = Math.min(Math.round(cmDays), workDays);
  const daily = (baseSalaryCents || 0) / workDays;
  const indem = Math.round(daily * days * pct);
  const employerDays = Math.min(days, 5);
  const employerCents = Math.round(daily * employerDays * pct);
  const fnuassCents = Math.max(0, indem - employerCents);
  return { days, code: cmCode || null, pct, indemnizationCents: indem, employerCents, fnuassCents };
}

export interface PayrollInput {
  deductionCents?: number;  // manual override; if >0 used instead of auto
  nrDependents?: number;    // for auto deducere
  cmDays?: number;
  cmCode?: string | null;
  minWageCents?: number;
  workDays?: number;
}

export interface PayrollBreakdown {
  grossCents: number;       // salariu brut de bază (lunar, integral)
  workedGrossCents: number; // partea lucrată (proratată dacă există CM)
  casCents: number;         // 25% angajat (pe partea lucrată)
  cassCents: number;        // 10% angajat
  deductionCents: number;   // deducere personală aplicată
  taxableCents: number;
  taxCents: number;         // impozit 10% (salariu + indemnizație CM)
  netCents: number;         // take-home (salariu + indemnizație CM, net)
  camCents: number;         // 2.25% angajator
  employerCostCents: number;
  cm: CMBreakdown;
}

/** Compute the full RO payroll breakdown for one employee for one month. */
export function computePayroll(grossCents: number, opts: PayrollInput | number = {}): PayrollBreakdown {
  // Back-compat: computePayroll(gross, deductionCents)
  const o: PayrollInput = typeof opts === 'number' ? { deductionCents: opts } : opts;
  const gross = Math.max(0, Math.round(grossCents || 0));
  const workDays = o.workDays ?? RO_PAYROLL_2026.workDays;
  const minWage = o.minWageCents ?? RO_PAYROLL_2026.minWageCents;

  const cm = computeCM(gross, o.cmDays || 0, o.cmCode || null, workDays);
  // Worked salary is prorated for the non-CM days.
  const workedGross = cm.days > 0 ? Math.round(gross * (workDays - cm.days) / workDays) : gross;

  const cas = Math.round(workedGross * RO_PAYROLL_2026.casRate);
  const cass = Math.round(workedGross * RO_PAYROLL_2026.cassRate);
  const deduction = (o.deductionCents && o.deductionCents > 0)
    ? Math.min(o.deductionCents, Math.max(0, workedGross - cas - cass))
    : Math.min(computeDeducere(gross, o.nrDependents || 0, minWage), Math.max(0, workedGross - cas - cass));
  const taxableSalary = Math.max(0, workedGross - cas - cass - deduction);
  const taxSalary = Math.round(taxableSalary * RO_PAYROLL_2026.taxRate);
  // CM indemnization: impozit 10% applies; CAS/CASS exempt (simplified v1).
  const taxCM = Math.round(cm.indemnizationCents * RO_PAYROLL_2026.taxRate);

  const tax = taxSalary + taxCM;
  const netSalary = Math.max(0, workedGross - cas - cass - taxSalary);
  const netCM = Math.max(0, cm.indemnizationCents - taxCM);
  const net = netSalary + netCM;
  const cam = Math.round(workedGross * RO_PAYROLL_2026.camRate); // CAM pe partea lucrată

  return {
    grossCents: gross,
    workedGrossCents: workedGross,
    casCents: cas,
    cassCents: cass,
    deductionCents: deduction,
    taxableCents: taxableSalary,
    taxCents: tax,
    netCents: net,
    camCents: cam,
    employerCostCents: workedGross + cam + cm.employerCents,
    cm,
  };
}

export const MONTHS_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

// Romanian payroll engine (2026). Deterministic — no AI, no external calls.
//
// Standard full-time contributions on gross salary (salariu brut):
//   CAS  (pensie)            25%   — employee, withheld
//   CASS (sănătate)          10%   — employee, withheld
//   Impozit pe venit         10%   — employee, on (gross − CAS − CASS − deducere)
//   CAM  (asig. muncă)        2.25% — EMPLOYER, on top of gross
//
//   net           = gross − CAS − CASS − impozit
//   cost angajator = gross + CAM
//
// Special regimes (IT exemption, construction, minimum-wage non-taxable facility,
// part-time minimum-contribution top-ups) are NOT modelled here — the accountant
// can adjust the personal deduction per employee to reflect them. v1.

export const RO_PAYROLL_2026 = {
  casRate: 0.25,
  cassRate: 0.10,
  taxRate: 0.10,
  camRate: 0.0225,
} as const;

export interface PayrollBreakdown {
  grossCents: number;
  casCents: number;       // 25% employee
  cassCents: number;      // 10% employee
  deductionCents: number; // deducere personală applied to the taxable base
  taxableCents: number;   // gross − CAS − CASS − deducere (floored at 0)
  taxCents: number;       // 10% impozit
  netCents: number;       // take-home
  camCents: number;       // 2.25% employer
  employerCostCents: number; // gross + CAM
}

/** Compute the full RO payroll breakdown for one employee for one month. */
export function computePayroll(grossCents: number, deductionCents = 0): PayrollBreakdown {
  const gross = Math.max(0, Math.round(grossCents || 0));
  const cas = Math.round(gross * RO_PAYROLL_2026.casRate);
  const cass = Math.round(gross * RO_PAYROLL_2026.cassRate);
  const deduction = Math.min(Math.max(0, Math.round(deductionCents || 0)), Math.max(0, gross - cas - cass));
  const taxable = Math.max(0, gross - cas - cass - deduction);
  const tax = Math.round(taxable * RO_PAYROLL_2026.taxRate);
  const net = Math.max(0, gross - cas - cass - tax);
  const cam = Math.round(gross * RO_PAYROLL_2026.camRate);
  return {
    grossCents: gross,
    casCents: cas,
    cassCents: cass,
    deductionCents: deduction,
    taxableCents: taxable,
    taxCents: tax,
    netCents: net,
    camCents: cam,
    employerCostCents: gross + cam,
  };
}

export const MONTHS_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

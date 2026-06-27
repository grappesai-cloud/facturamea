// Deterministic expense classification — NO AI, zero cost. Two layers:
//   1. Per-supplier memory: the (category, deductible, vatScheme) last booked for
//      a supplier is remembered on the supplier row and reused next time.
//   2. Keyword rules: map supplier name / invoice text to a category when there's
//      no memory yet. Editable, predictable, auditable — what accountants want.

export type ExpenseCategory = 'utilitati' | 'chirie' | 'combustibil' | 'servicii' | 'marfa' | 'salarii' | 'taxe' | 'altele';

// First matching rule wins. Terms are matched against a normalized (lowercased,
// diacritics-folded) blob of supplier name + document description.
const KEYWORD_RULES: { category: ExpenseCategory; terms: string[] }[] = [
  { category: 'combustibil', terms: ['carburant', 'benzin', 'motorina', 'omv', 'petrom', 'rompetrol', 'mol ', 'lukoil', 'socar', 'gpl', 'peco'] },
  { category: 'utilitati', terms: ['energie', 'curent', 'electric', 'enel', 'e-on', 'eon', 'engie', 'gaz', 'gaze', 'apa', 'apanova', 'apa nova', 'salubri', 'deseuri', 'digi', 'rcs', 'rds', 'orange', 'vodafone', 'telekom', 'upc', 'internet', 'telefon', 'utilitat'] },
  { category: 'chirie', terms: ['chirie', 'inchiriere', 'locatie', 'spatiu', 'rent'] },
  { category: 'taxe', terms: ['taxa', 'impozit', 'anaf', 'primaria', 'autorizatie', 'amenda', 'timbru'] },
  { category: 'salarii', terms: ['salar', 'salariu', 'remuneratie', 'venit asimilat'] },
  { category: 'servicii', terms: ['consultanta', 'mentenanta', 'abonament', 'software', 'hosting', 'cloud', 'contabilitate', 'audit', 'avocat', 'juridic', 'marketing', 'publicitate', 'transport', 'curier'] },
  { category: 'marfa', terms: ['marfa', 'aprovizionare', 'materii prime', 'materiale'] },
];

function fold(s: string | null | undefined): string {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/\s+/g, ' ');
}

/** Keyword-based category, or null when nothing matches. */
export function classifyByKeywords(...parts: (string | null | undefined)[]): ExpenseCategory | null {
  const text = ' ' + fold(parts.filter(Boolean).join(' ')) + ' ';
  for (const rule of KEYWORD_RULES) {
    if (rule.terms.some((t) => text.includes(t))) return rule.category;
  }
  return null;
}

const RO = new Set(['', 'romania', 'românia', 'ro']);

export interface SupplierMemory {
  defaultCategory?: string | null;
  defaultDeductible?: boolean | null;
  defaultVatScheme?: string | null;
  country?: string | null;
}

export interface Suggestion {
  category: ExpenseCategory | null;
  deductible: boolean;
  vatScheme: 'normal' | 'reverse_charge';
  source: 'memory' | 'rules' | 'default';
}

/**
 * Suggest classification for an expense. Supplier memory wins; otherwise keyword
 * rules on the supplier name + document text; VAT scheme defaults to reverse
 * charge for non-RO suppliers (intra-EU / non-EU acquisitions).
 */
export function suggestClassification(opts: {
  supplier?: SupplierMemory | null;
  supplierName?: string | null;
  documentText?: string | null;
}): Suggestion {
  const { supplier, supplierName, documentText } = opts;
  const foreign = !!supplier?.country && !RO.has(fold(supplier.country).trim());

  // 1. Per-supplier memory.
  if (supplier?.defaultCategory) {
    return {
      category: supplier.defaultCategory as ExpenseCategory,
      deductible: supplier.defaultDeductible !== false,
      vatScheme: (supplier.defaultVatScheme as any) === 'reverse_charge' ? 'reverse_charge' : (foreign ? 'reverse_charge' : 'normal'),
      source: 'memory',
    };
  }

  // 2. Keyword rules.
  const byKw = classifyByKeywords(supplierName, documentText);
  if (byKw) {
    return { category: byKw, deductible: true, vatScheme: foreign ? 'reverse_charge' : 'normal', source: 'rules' };
  }

  // 3. Nothing learned yet.
  return { category: null, deductible: true, vatScheme: foreign ? 'reverse_charge' : 'normal', source: 'default' };
}

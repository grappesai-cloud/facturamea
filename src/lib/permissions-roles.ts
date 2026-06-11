// Company-level roles for facturamea team members.
//
// Roles (stored in user_company_memberships.role):
//   owner      — Administrator: acces complet, inclusiv echipa
//   accountant — Contabil: tot, mai puțin gestiunea echipei
//   operator   — Operator: emite facturi, cheltuieli, gestiune, POS
//   viewer     — Vizualizare: doar citire
export type CompanyRole = 'owner' | 'accountant' | 'operator' | 'viewer';

export const COMPANY_ROLES: CompanyRole[] = ['owner', 'accountant', 'operator', 'viewer'];

export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: 'Administrator',
  accountant: 'Contabil',
  operator: 'Operator',
  viewer: 'Vizualizare',
};

export const ROLE_DESCRIPTIONS: Record<CompanyRole, string> = {
  owner: 'Acces complet, inclusiv gestiunea echipei și a setărilor.',
  accountant: 'Acces complet, fără gestiunea echipei.',
  operator: 'Emite facturi, gestionează cheltuieli, stoc și POS.',
  viewer: 'Acces doar pentru vizualizare (citire).',
};

// All actions the permission system knows about.
export type Action =
  | 'invoice.create'
  | 'invoice.delete'
  | 'settings.manage'
  | 'team.manage'
  | 'expense.manage'
  | 'stock.manage'
  | 'pos.use';

const PERMISSIONS: Record<CompanyRole, Action[]> = {
  // owner: all actions
  owner: ['invoice.create', 'invoice.delete', 'settings.manage', 'team.manage', 'expense.manage', 'stock.manage', 'pos.use'],
  // accountant: all except team.manage
  accountant: ['invoice.create', 'invoice.delete', 'settings.manage', 'expense.manage', 'stock.manage', 'pos.use'],
  // operator: day-to-day operations, no settings/team, no invoice delete
  operator: ['invoice.create', 'expense.manage', 'stock.manage', 'pos.use'],
  // viewer: read-only, no actions
  viewer: [],
};

// Normalize a stored/legacy role string to a known CompanyRole.
// Legacy memberships used 'admin' | 'member'; map them to the closest role.
export function normalizeRole(role: string | null | undefined): CompanyRole {
  switch ((role || '').toLowerCase()) {
    case 'owner':
      return 'owner';
    case 'accountant':
      return 'accountant';
    case 'operator':
      return 'operator';
    case 'viewer':
      return 'viewer';
    // Legacy compatibility
    case 'admin':
      return 'owner';
    case 'member':
      return 'operator';
    default:
      return 'viewer';
  }
}

export function can(role: string | null | undefined, action: Action): boolean {
  const r = normalizeRole(role);
  return PERMISSIONS[r].includes(action);
}

export function isValidRole(role: string | null | undefined): role is CompanyRole {
  return COMPANY_ROLES.includes((role || '') as CompanyRole);
}

// facturamea has exactly TWO operational roles:
//   - `transportator` (carrier): carries freight — fleet, GPS, available
//     trucks, bids, carrier-side orders.
//   - `intermediar` (labeled "Business" in the UI): the FULL-ACCESS role. It can
//     do everything a carrier can (carry freight, manage a fleet, GPS, bid)
//     PLUS post freight/auctions, manage dossiers, sub-users and clauses.
//     Business has access to everything.
// `admin` is a separate system flag, not an operational role.
// Legacy `client_direct`/`partener` values were folded into these (migration 0036).
type UserType = 'transportator' | 'intermediar';

const isBusiness = (u: UserType) => u === 'intermediar';
const isCarrierOrBusiness = (u: UserType) => u === 'transportator' || u === 'intermediar';

// ── Business-only (posting/brokering loads) ──────────────────────────────
export function canPostFreight(userType: UserType): boolean { return isBusiness(userType); }
export function canAssignCarrier(userType: UserType): boolean { return isBusiness(userType); }
export function canManageSubUsers(userType: UserType): boolean { return isBusiness(userType); }
export function canManageClauses(userType: UserType): boolean { return isBusiness(userType); }
export function canPostAuction(userType: UserType): boolean { return isBusiness(userType); }

// ── Open to both roles ───────────────────────────────────────────────────
export function canSearchFreight(_userType: UserType): boolean { return true; }
export function canAccessClassifieds(_userType: UserType): boolean { return true; }
export function canAccessForum(_userType: UserType): boolean { return true; }

// ── Carrier capabilities — Business has these too (access to everything) ──
export function canCarryFreight(userType: UserType): boolean { return isCarrierOrBusiness(userType); }
export function canManageFleet(userType: UserType): boolean { return canCarryFreight(userType); }
export function canPostAvailableTruck(userType: UserType): boolean { return canCarryFreight(userType); }
export function canBidOnAuction(userType: UserType): boolean { return canCarryFreight(userType); }

// Primary account holder of a company. Sub-users (parentUserId set) are not
// considered owners. Used to gate sensitive actions like license-plate edits.
export function isPrimaryAccount(user: { parentUserId?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return !user.parentUserId;
}

// License plates are private. Visible only to the primary account holder of
// the same company that owns the truck — never to sub-users, never to other
// companies.
export function canSeeLicensePlate(
  viewer: { companyId?: string | null; parentUserId?: string | null } | null | undefined,
  truckCompanyId: string | null | undefined,
): boolean {
  if (!viewer || !truckCompanyId) return false;
  if (viewer.companyId !== truckCompanyId) return false;
  return isPrimaryAccount(viewer);
}

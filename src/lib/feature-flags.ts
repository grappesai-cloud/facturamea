// Features that emit ANAF declarations NOT yet validated against the official
// XSD / DUK Integrator. Gated OFF for launch so users cannot submit invalid
// documents to ANAF. Flip the env var to 'true' once the output is validated.
//   - e-Transport: buildEtransportXml needs rebuilding against the eTransport v2 XSD.
//   - SAF-T D406: needs official numeric TaxCode nomenclature + full MasterFiles +
//     current AuditFileVersion + RON-converted amounts (RON now done; rest pending).
export const ETRANSPORT_ENABLED = process.env.ETRANSPORT_ENABLED === 'true';
export const SAFT_D406_ENABLED = process.env.SAFT_D406_ENABLED === 'true';

export const FEATURE_PENDING_MESSAGE =
  'Această funcție este în validare cu ANAF (XSD oficial / DUK Integrator) și va fi disponibilă în curând. Nu o folosi pentru depuneri reale momentan.';

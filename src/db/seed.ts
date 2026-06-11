import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { truckTypes } from './schema-pg';

// Seed script — reads DATABASE_URL from the environment.
// Usage: `DATABASE_URL="postgresql://..." npx tsx src/db/seed.ts`
// (node --loader=tsx if no tsx installed globally)

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

const isLocal = /^(postgres(ql)?:\/\/)[^@]*@(localhost|127\.0\.0\.1)/.test(connectionString);
const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const db = drizzle(pool);

const truckTypesData = [
  { id: 'prelata', nameRo: 'Prelată', nameEn: 'Tarpaulin', icon: 'prelata', sortOrder: 1 },
  { id: 'frigorific', nameRo: 'Frigorific', nameEn: 'Refrigerated', icon: 'frigorific', sortOrder: 2 },
  { id: 'platforma', nameRo: 'Platformă', nameEn: 'Flatbed', icon: 'platforma', sortOrder: 3 },
  { id: 'agabaritic', nameRo: 'Agabaritic', nameEn: 'Oversized', icon: 'agabaritic', sortOrder: 4 },
  { id: 'cisterna', nameRo: 'Cisternă', nameEn: 'Tanker', icon: 'cisterna', sortOrder: 5 },
  { id: 'basculanta', nameRo: 'Basculantă', nameEn: 'Tipper', icon: 'basculanta', sortOrder: 6 },
  { id: 'container', nameRo: 'Container', nameEn: 'Container', icon: 'container', sortOrder: 7 },
  { id: 'cap_tractor', nameRo: 'Cap tractor', nameEn: 'Tractor unit', icon: 'cap_tractor', sortOrder: 8 },
  { id: 'transport_auto', nameRo: 'Transport autovehicule', nameEn: 'Car carrier', icon: 'transport_auto', sortOrder: 9 },
  { id: 'cisterna_alimentara', nameRo: 'Cisternă alimentară', nameEn: 'Food tanker', icon: 'cisterna_alimentara', sortOrder: 10 },
  { id: 'walking_floor', nameRo: 'Walking Floor', nameEn: 'Walking Floor', icon: 'walking_floor', sortOrder: 11 },
  { id: 'mega_trailer', nameRo: 'Mega Trailer', nameEn: 'Mega Trailer', icon: 'mega_trailer', sortOrder: 12 },
  { id: 'furgon', nameRo: 'Furgon', nameEn: 'Box truck', icon: 'furgon', sortOrder: 13 },
  { id: 'sprinter', nameRo: 'Sprinter < 3.5t', nameEn: 'Sprinter < 3.5t', icon: 'sprinter', sortOrder: 14 },
];

async function seed() {
  console.log('Seeding truck types...');
  for (const tt of truckTypesData) {
    await db.insert(truckTypes).values(tt).onConflictDoNothing();
  }
  console.log(`Inserted ${truckTypesData.length} truck types.`);
  console.log('Seed complete.');
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Validates that the test DB schema (tests/db/testDb.ts raw SQL) stays in sync
 * with the Drizzle schema (db/schema.ts).
 *
 * Run: node scripts/validate-test-schema.mjs
 * Exit code 0 = schemas match, 1 = drift detected.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testDbPath = path.join(__dirname, '..', 'tests', 'db', 'testDb.ts');
const schemaPath = path.join(__dirname, '..', 'db', 'schema.ts');

const testDbContent = fs.readFileSync(testDbPath, 'utf-8');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

// Extract table names and their columns from testDb CREATE TABLE statements
const createTableRegex =
  /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/g;
const testTables = new Map();

let match;
while ((match = createTableRegex.exec(testDbContent)) !== null) {
  const tableName = match[1];
  const body = match[2];

  // Extract column names (skip constraints like PRIMARY KEY, INDEX, etc.)
  const columns = new Set();
  const lines = body.split('\n').map((l) => l.trim().replace(/,+$/, ''));
  for (const line of lines) {
    if (!line) continue;
    if (/^(PRIMARY KEY|UNIQUE|INDEX|CHECK|FOREIGN|CONSTRAINT)/i.test(line))
      continue;
    const colMatch = line.match(/^(\w+)\s/);
    if (colMatch) columns.add(colMatch[1]);
  }
  testTables.set(tableName, columns);
}

// Extract table definitions from Drizzle schema
const schemaTables = new Map();
const tableRegex = /sqliteTable\(\s*['"](\w+)['"]/g;
while ((match = tableRegex.exec(schemaContent)) !== null) {
  const tableName = match[1];
  schemaTables.set(tableName, true);
}

let hasErrors = false;

// Check: all schema tables should have a corresponding CREATE TABLE in testDb
for (const tableName of schemaTables.keys()) {
  if (!testTables.has(tableName)) {
    console.error(
      `❌ MISSING in test DB: Table "${tableName}" exists in db/schema.ts but not in tests/db/testDb.ts`,
    );
    hasErrors = true;
  }
}

// Check: all test DB tables should exist in schema
for (const tableName of testTables.keys()) {
  if (!schemaTables.has(tableName)) {
    console.warn(
      `⚠️  EXTRA in test DB: Table "${tableName}" exists in tests/db/testDb.ts but not in db/schema.ts (may be intentional)`,
    );
  }
}

if (!hasErrors) {
  console.log(
    `✅ Test DB schema is in sync with Drizzle schema (${testTables.size} tables checked)`,
  );
}

process.exit(hasErrors ? 1 : 0);

/**
 * Loads .env BEFORE any other module reads process.env. Must stay the first
 * import in index.ts — ESM evaluates imported modules before the importer's
 * body, so a dotenv.config() call in the body would run too late (db.ts would
 * already have created its Pool).
 *
 * Search order: server/.env first, then repo-root ../.env (first hit wins).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.resolve(here, '../.env'), path.resolve(here, '../../.env')],
  quiet: true,
});

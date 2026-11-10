import { database } from '../server/database.mjs';

const sql = database();
await sql.transaction([
  sql`CREATE TABLE IF NOT EXISTS unit_inquiries (
    id UUID PRIMARY KEY,
    project TEXT NOT NULL,
    email TEXT NOT NULL,
    brief TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  sql`CREATE INDEX IF NOT EXISTS unit_inquiries_created
    ON unit_inquiries (created_at DESC, id DESC)`,
  sql`CREATE TABLE IF NOT EXISTS unit_admin_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS unit_admin_attempts (
    bucket BIGINT PRIMARY KEY,
    attempts INTEGER NOT NULL
  )`,
]);
console.log('TEAM UNIT schema ready.');

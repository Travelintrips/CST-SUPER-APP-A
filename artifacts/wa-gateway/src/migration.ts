import { pool } from "@workspace/db";

export async function runWaGatewayMigration() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_accounts (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wa_devices (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES wa_accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone_number TEXT,
      status TEXT NOT NULL DEFAULT 'disconnected',
      webhook_url TEXT,
      session_dir TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wa_api_keys (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES wa_accounts(id) ON DELETE CASCADE,
      device_id INTEGER REFERENCES wa_devices(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wa_messages (
      id SERIAL PRIMARY KEY,
      device_id INTEGER NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      to_from TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      content TEXT,
      status TEXT DEFAULT 'pending',
      wa_message_id TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("[wa-gateway] Migration done");
}

import Database from "better-sqlite3";
import { createLogger } from "@easyclaw/logger";

const log = createLogger("binding:store");

export interface BindingStore {
  bind(externalUserId: string, gatewayId: string): void;
  lookup(externalUserId: string): string | undefined;
  unbind(externalUserId: string): void;
  listByGateway(gatewayId: string): string[];
  unbindByGateway(gatewayId: string): number;
  createPendingBinding(token: string, gatewayId: string): void;
  resolvePendingBinding(token: string): string | undefined;
  getSyncCursor(): string;
  setSyncCursor(cursor: string): void;
  close(): void;
}

/**
 * Create a SQLite-backed binding store.
 *
 * Tables:
 * - bindings(external_userid TEXT PK, gateway_id TEXT, created_at TEXT)
 * - pending_bindings(token TEXT PK, gateway_id TEXT, created_at TEXT, expires_at TEXT)
 */
export function createBindingStore(dbPath: string): BindingStore {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS bindings (
      external_userid TEXT PRIMARY KEY,
      gateway_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_bindings (
      token TEXT PRIMARY KEY,
      gateway_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  log.info(`Binding store initialized at ${dbPath}`);

  const stmts = {
    bind: db.prepare(
      "INSERT OR REPLACE INTO bindings (external_userid, gateway_id, created_at) VALUES (?, ?, datetime('now'))",
    ),
    lookup: db.prepare("SELECT gateway_id FROM bindings WHERE external_userid = ?"),
    unbind: db.prepare("DELETE FROM bindings WHERE external_userid = ?"),
    unbindByGateway: db.prepare("DELETE FROM bindings WHERE gateway_id = ?"),
    listByGateway: db.prepare("SELECT external_userid FROM bindings WHERE gateway_id = ?"),
    createPending: db.prepare(
      "INSERT OR REPLACE INTO pending_bindings (token, gateway_id, created_at, expires_at) VALUES (?, ?, datetime('now'), datetime('now', '+10 minutes'))",
    ),
    resolvePending: db.prepare(
      "SELECT gateway_id FROM pending_bindings WHERE token = ? AND expires_at > datetime('now')",
    ),
    deletePending: db.prepare("DELETE FROM pending_bindings WHERE token = ?"),
    getKv: db.prepare("SELECT value FROM kv WHERE key = ?"),
    setKv: db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)"),
  };

  return {
    bind(externalUserId: string, gatewayId: string): void {
      stmts.bind.run(externalUserId, gatewayId);
      log.info(`Bound ${externalUserId} → ${gatewayId}`);
    },

    lookup(externalUserId: string): string | undefined {
      const row = stmts.lookup.get(externalUserId) as { gateway_id: string } | undefined;
      return row?.gateway_id;
    },

    unbind(externalUserId: string): void {
      stmts.unbind.run(externalUserId);
      log.info(`Unbound ${externalUserId}`);
    },

    listByGateway(gatewayId: string): string[] {
      const rows = stmts.listByGateway.all(gatewayId) as { external_userid: string }[];
      return rows.map(r => r.external_userid);
    },

    unbindByGateway(gatewayId: string): number {
      const result = stmts.unbindByGateway.run(gatewayId);
      log.info(`Unbound ${result.changes} user(s) from gateway ${gatewayId}`);
      return result.changes;
    },

    createPendingBinding(token: string, gatewayId: string): void {
      stmts.createPending.run(token, gatewayId);
      log.info(`Created pending binding: token=${token} → ${gatewayId}`);
    },

    resolvePendingBinding(token: string): string | undefined {
      const row = stmts.resolvePending.get(token) as { gateway_id: string } | undefined;
      if (row) {
        stmts.deletePending.run(token);
        log.info(`Resolved pending binding: token=${token} → ${row.gateway_id}`);
        return row.gateway_id;
      }
      return undefined;
    },

    getSyncCursor(): string {
      const row = stmts.getKv.get("sync_cursor") as { value: string } | undefined;
      return row?.value ?? "";
    },

    setSyncCursor(cursor: string): void {
      stmts.setKv.run("sync_cursor", cursor);
    },

    close(): void {
      db.close();
      log.info("Binding store closed");
    },
  };
}

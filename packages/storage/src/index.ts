import type Database from "better-sqlite3";
import { openDatabase, closeDatabase } from "./database.js";
import { RulesRepository } from "./repo-rules.js";
import { ArtifactsRepository } from "./repo-artifacts.js";
import { ChannelsRepository } from "./repo-channels.js";
import { PermissionsRepository } from "./repo-permissions.js";
import { SettingsRepository } from "./repo-settings.js";

export interface Storage {
  db: Database.Database;
  rules: RulesRepository;
  artifacts: ArtifactsRepository;
  channels: ChannelsRepository;
  permissions: PermissionsRepository;
  settings: SettingsRepository;
  close(): void;
}

export function createStorage(dbPath?: string): Storage {
  const db = openDatabase(dbPath);

  return {
    db,
    rules: new RulesRepository(db),
    artifacts: new ArtifactsRepository(db),
    channels: new ChannelsRepository(db),
    permissions: new PermissionsRepository(db),
    settings: new SettingsRepository(db),
    close() {
      closeDatabase(db);
    },
  };
}

export { openDatabase, closeDatabase } from "./database.js";
export { RulesRepository } from "./repo-rules.js";
export { ArtifactsRepository } from "./repo-artifacts.js";
export { ChannelsRepository } from "./repo-channels.js";
export { PermissionsRepository } from "./repo-permissions.js";
export { SettingsRepository } from "./repo-settings.js";
export type { Migration } from "./migrations.js";

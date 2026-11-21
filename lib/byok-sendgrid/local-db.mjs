import { randomBytes } from "node:crypto";
import {
  constants, closeSync, fchmodSync, fstatSync, linkSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

let cached;

function openPrivateFile(path, flags) {
  const fd = openSync(path, flags | (constants.O_NOFOLLOW || 0), 0o600);
  try {
    if (!fstatSync(fd).isFile()) throw new Error("Invalid local vault file");
    fchmodSync(fd, 0o600);
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function loadVaultKey(directory, keyPath, databasePath) {
  if (!lstatSync(keyPath, { throwIfNoEntry: false })) {
    if (lstatSync(databasePath, { throwIfNoEntry: false })?.size &&
        !lstatSync(keyPath, { throwIfNoEntry: false })) {
      throw new Error("Restore the local vault key");
    }
    // Publish a complete key atomically; concurrent app launches must share it.
    const staging = mkdtempSync(join(directory, ".initializing-"));
    try {
      const scratchKey = join(staging, "key");
      writeFileSync(scratchKey, randomBytes(32).toString("base64"), { mode: 0o600 });
      try {
        linkSync(scratchKey, keyPath);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  const fd = openPrivateFile(keyPath, constants.O_RDONLY);
  try {
    const key = readFileSync(fd, "utf8").trim();
    if (!/^[a-zA-Z0-9+/]{43}=$/.test(key)) throw new Error("Invalid local vault key");
    return key;
  } finally {
    closeSync(fd);
  }
}

export function openLocalEmailVault(directory = process.env.ONBOARDING_DATA_DIR || join(homedir(), ".digital-onboarding-automation")) {
  if (cached?.directory === directory) return cached;
  mkdirSync(directory, { mode: 0o700, recursive: true });
  const dir = lstatSync(directory);
  if (!dir.isDirectory() || (process.platform !== "win32" && (dir.mode & 0o077))) {
    throw new Error("The local email vault requires a private directory");
  }
  const databasePath = join(directory, "email.sqlite");
  const vaultKey = loadVaultKey(directory, join(directory, "vault.key"), databasePath);
  closeSync(openPrivateFile(databasePath, constants.O_CREAT | constants.O_RDWR));

  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    sqlite.exec(readFileSync(join(process.cwd(), "lib/byok-sendgrid/schema.sql"), "utf8"));
  } catch (error) {
    sqlite.close();
    throw error;
  }

  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            first: () => statement.get(...values) ?? null,
            all: () => ({ results: statement.all(...values) }),
            run: () => ({ meta: { changes: Number(statement.run(...values).changes) } }),
          };
        },
      };
    },
  };
  cached = { db, vaultKey, directory };
  return cached;
}

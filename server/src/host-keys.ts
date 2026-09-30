import { createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type HostKeyRecord = {
  readonly name: string;
  readonly sha256: string;
  readonly createdAt: string;
};

const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const KEY = /^qjk_[A-Za-z0-9_-]{43}$/;
const HASH = /^[0-9a-f]{64}$/;

export class HostKeyError extends Error {}

function sha256(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function readHostKeys(path: string): HostKeyRecord[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (failed) {
    if ((failed as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw failed;
  }
  const data = JSON.parse(text) as { keys?: unknown };
  if (!Array.isArray(data.keys)) {
    throw new HostKeyError(`${path}: expected {"keys": [...]}`);
  }
  return data.keys.map((entry: unknown, index) => {
    const record = entry as Partial<HostKeyRecord> | null;
    if (
      typeof record?.name !== "string" ||
      !NAME.test(record.name) ||
      typeof record.sha256 !== "string" ||
      !HASH.test(record.sha256) ||
      typeof record.createdAt !== "string"
    ) {
      throw new HostKeyError(`${path}: keys[${index}] is not {name, sha256, createdAt}`);
    }
    return { name: record.name, sha256: record.sha256, createdAt: record.createdAt };
  });
}

function writeHostKeys(path: string, records: readonly HostKeyRecord[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify({ keys: records }, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, path);
}

export function addHostKey(path: string, name: string, key: string, now: Date): void {
  if (!NAME.test(name)) {
    throw new HostKeyError(`key name ${JSON.stringify(name)} must be 1-32 of a-z, 0-9 and -`);
  }
  const records = readHostKeys(path);
  if (records.some((record) => record.name === name)) {
    throw new HostKeyError(`a key named ${name} already exists`);
  }
  writeHostKeys(path, [...records, { name, sha256: sha256(key), createdAt: now.toISOString() }]);
}

export function revokeHostKey(path: string, name: string): boolean {
  const records = readHostKeys(path);
  const rest = records.filter((record) => record.name !== name);
  if (rest.length === records.length) {
    return false;
  }
  writeHostKeys(path, rest);
  return true;
}

export class HostKeys {
  private hashes: Buffer[] = [];
  private loadedMtimeMs = -1;

  constructor(private readonly path: string) {
    this.reload();
  }

  reload(): void {
    this.hashes = readHostKeys(this.path).map((record) => Buffer.from(record.sha256, "hex"));
    this.loadedMtimeMs = this.mtimeMs();
  }

  private mtimeMs(): number {
    try {
      return statSync(this.path).mtimeMs;
    } catch {
      return 0; // no file yet: no keys
    }
  }

  isValid(key: string): boolean {
    if (this.mtimeMs() !== this.loadedMtimeMs) {
      this.reload();
    }
    if (!KEY.test(key)) {
      return false;
    }
    const hash = Buffer.from(sha256(key), "hex");
    return this.hashes.some((known) => timingSafeEqual(known, hash));
  }
}

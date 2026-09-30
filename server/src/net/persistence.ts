import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { SnapshotData } from "../protocol/generated/types.js";

export type RoomsFile = {
  readonly format: 1;
  readonly savedAt: number;
  readonly rooms: readonly unknown[];
};

export type TakenRooms = { readonly rooms: readonly unknown[]; readonly problem: string | null };

export function saveRooms(path: string, rooms: readonly SnapshotData[], now: number): void {
  const temporary = `${path}.tmp`;
  const file: RoomsFile = { format: 1, savedAt: now, rooms };
  writeFileSync(temporary, JSON.stringify(file), { mode: 0o600 });
  renameSync(temporary, path);
}

export function takeRooms(path: string): TakenRooms {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (failed) {
    if ((failed as NodeJS.ErrnoException).code === "ENOENT") {
      return { rooms: [], problem: null };
    }
    throw failed;
  }
  try {
    const file = JSON.parse(text) as Partial<RoomsFile> | null;
    if (file?.format !== 1 || !Array.isArray(file.rooms)) {
      throw new Error('expected {"format": 1, "rooms": [...]}');
    }
    rmSync(path);
    return { rooms: file.rooms, problem: null };
  } catch (failed) {
    renameSync(path, `${path}.broken`);
    return { rooms: [], problem: failed instanceof Error ? failed.message : String(failed) };
  }
}

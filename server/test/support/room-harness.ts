import type { ClientMessage, ServerMessage, Track } from "../../src/protocol/generated/types.js";
import { createRoom, reduce } from "../../src/room/room.js";
import type { Effect, RoomEvent, RoomState } from "../../src/room/types.js";
import type { SettingsPatch } from "../../src/protocol/generated/types.js";

export const PUBLIC_URL = "https://jam.example.org";
export const ROOM_ID = "7k3m9q2x";
export const HOST = "h7k2m9";
export const HOST_CONNECTION = "c-host";
export const HOST_SECRET = "HostSecretHostSecretHostSecretHostSecret123";
export const JOIN_SECRET = "JoinSecretJoinSecret12";

export function track(id: string, title = `Track ${id}`): Track {
  return {
    id,
    albumId: "1",
    title,
    artists: ["Artist"],
    durationMs: 200_000,
    coverUri: `avatars.yandex.net/get-music-content/1/${id}/%%`,
  };
}

export function participantId(number: number): string {
  return `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
}

export class RoomHarness {
  room: RoomState;
  effects: readonly Effect[];
  ended = false;
  now = 1_000_000;
  private counter = 0;
  private guests = 0;

  constructor(settings?: SettingsPatch) {
    const outcome = createRoom(
      {
        connection: HOST_CONNECTION,
        id: "h1",
        roomId: ROOM_ID,
        hostPublicId: HOST,
        hostName: "Маша",
        hostSecret: HOST_SECRET,
        joinSecret: JOIN_SECRET,
        ...(settings ? { settings } : {}),
      },
      { now: this.now, publicUrl: PUBLIC_URL },
    );
    if (!outcome.room) {
      throw new Error("createRoom returned no room");
    }
    this.room = outcome.room;
    this.effects = outcome.effects;
  }

  apply(event: RoomEvent): readonly Effect[] {
    const outcome = reduce(this.room, event, { now: this.now, publicUrl: PUBLIC_URL });
    if (outcome.room) {
      this.room = outcome.room;
    } else {
      this.ended = true;
    }
    this.effects = outcome.effects;
    return outcome.effects;
  }

  join(
    name: string,
    kind: "web" | "qiyaa" = "web",
    options: { participant?: number; secret?: string; connection?: string } = {},
  ): readonly Effect[] {
    const number = options.participant ?? ++this.guests;
    return this.apply({
      kind: "join",
      connection: options.connection ?? `c-${name}`,
      id: "g1",
      participantId: participantId(number),
      joinSecret: options.secret ?? JOIN_SECRET,
      name,
      participantKind: kind,
      newPublicId: `g${String(number).padStart(5, "0")}`,
    });
  }

  guest(name: string, kind: "web" | "qiyaa" = "web"): string {
    const effects = this.join(name, kind);
    const admit = effects.find((effect) => effect.kind === "admit");
    if (!admit) {
      throw new Error(`${name} was not admitted: ${JSON.stringify(effects)}`);
    }
    return admit.publicId;
  }

  send(from: string, message: ClientMessage, connection?: string): readonly Effect[] {
    this.counter++;
    return this.apply({
      kind: "message",
      connection: connection ?? (from === HOST ? HOST_CONNECTION : `c-${from}`),
      from,
      message,
      fresh: {
        requestId: `r${this.counter}`,
        joinSecret: `NewJoinSecret${String(this.counter).padStart(9, "0")}`,
      },
    });
  }

  cacheResults(guest: string, tracks: readonly Track[]): void {
    const effects = this.send(guest, { type: "search", id: "g-search", text: "anything" });
    const request = toHost(effects)[0];
    if (request?.type !== "searchRequest") {
      throw new Error(`no searchRequest: ${JSON.stringify(effects)}`);
    }
    this.send(HOST, { type: "searchResult", requestId: request.requestId, tracks: [...tracks] });
  }

  add(from: string, trackId: string): readonly Effect[] {
    const participant = this.room.participants.find((candidate) => candidate.publicId === from);
    if (participant?.kind === "web") {
      this.cacheResults(from, [track(trackId)]);
      return this.send(from, { type: "add", id: "g-add", trackId });
    }
    return this.send(from, { type: "add", id: "h-add", track: track(trackId) });
  }

  itemIds(): string[] {
    return this.room.queue.map((item) => item.itemId);
  }
}

export function sent(effects: readonly Effect[], connection?: string): ServerMessage[] {
  return effects.flatMap((effect) =>
    effect.kind === "send" && (connection === undefined || effect.connection === connection)
      ? [effect.message]
      : [],
  );
}

export function toHost(effects: readonly Effect[]): ServerMessage[] {
  return effects.flatMap((effect) => (effect.kind === "to-host" ? [effect.message] : []));
}

export function hasState(effects: readonly Effect[]): boolean {
  return effects.some((effect) => effect.kind === "state");
}

export function reasonOf(effects: readonly Effect[]): string | undefined {
  const message = sent(effects).find((candidate) => candidate.type === "rejected");
  return message?.type === "rejected" ? message.reason : undefined;
}

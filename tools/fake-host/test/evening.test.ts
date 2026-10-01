import { afterEach, describe, expect, it } from "vitest";
import { parseTrustedProxies } from "../../../server/src/net/real-ip.js";
import { JamServer } from "../../../server/src/net/server.js";
import type { Track } from "../../../server/src/protocol/generated/types.js";
import { JamClient } from "../../../server/test/support/jam-client.js";
import { loadCatalog, searchCatalog } from "../src/catalog.js";
import { FakeHost, type Session } from "../src/fake-host.js";

const catalog = loadCatalog();
const servers: JamServer[] = [];
const hosts: FakeHost[] = [];

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    host.stop();
  }
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function startServer(): Promise<string> {
  const server = new JamServer({
    publicUrl: "https://jam.example.org",
    trustedProxies: parseTrustedProxies("127.0.0.1"),
    roomsFile: null,
    assetlinksJson: null,
    webRoot: null,
    timing: { snapshotIntervalMs: 100 },
  });
  servers.push(server);
  const address = await server.listen(0, "127.0.0.1");
  return `ws://127.0.0.1:${address.port}/ws`;
}

function fakeHost(url: string, speed: number): FakeHost {
  const host = new FakeHost({ url, name: "Маша", catalog, speed });
  hosts.push(host);
  return host;
}

function linkParts(session: Session): { roomId: string; joinSecret: string } {
  const match = /\/j\/([0-9a-z]{8})#(.+)$/.exec(session.joinUrl);
  if (!match?.[1] || !match[2]) {
    throw new Error(`unexpected joinUrl ${session.joinUrl}`);
  }
  return { roomId: match[1], joinSecret: match[2] };
}

type Guest = { client: JamClient; tracks: Track[] };

async function joinGuest(
  url: string,
  session: Session,
  number: number,
  name: string,
): Promise<JamClient> {
  const client = await JamClient.hello(url, "web", { "x-real-ip": `203.0.113.${number}` });
  const { roomId, joinSecret } = linkParts(session);
  client.send({
    type: "join",
    id: "join",
    roomId,
    joinSecret,
    participantId: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    name,
  });
  await client.nextOf("joined");
  return client;
}

async function until(condition: () => boolean, what: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function add(guest: Guest, count: number): Promise<void> {
  for (const track of guest.tracks.splice(0, count)) {
    guest.client.send({ type: "add", id: `add-${track.id}`, trackId: track.id });
    const answer = await guest.client.nextOf("ack").catch(() => null);
    expect(answer, `add ${track.id}`).toEqual({ type: "ack", id: `add-${track.id}` });
  }
}

const ARTISTS = [
  ["КИНО", "ДДТ"],
  ["Queen", "The Beatles"],
  ["Daft Punk", "Massive Attack"],
  ["Miles Davis", "Nina Simone"],
  ["Земфира", "Сплин"],
];

async function guestsWithTracks(url: string, session: Session): Promise<Guest[]> {
  const taken = new Set<string>();
  const guests: Guest[] = [];
  for (const [index, artists] of ARTISTS.entries()) {
    const client = await joinGuest(url, session, index + 1, `Гость ${index + 1}`);
    const tracks: Track[] = [];
    for (const [searchIndex, artist] of artists.entries()) {
      client.send({ type: "search", id: `search-${searchIndex}`, text: artist });
      const results = await client.nextOf("searchResults");
      for (const track of results.tracks) {
        if (tracks.length < 8 && !taken.has(track.id)) {
          taken.add(track.id);
          tracks.push(track);
        }
      }
    }
    expect(tracks, `${artists.join(" + ")} gives 8 tracks`).toHaveLength(8);
    guests.push({ client, tracks });
  }
  return guests;
}

describe("a whole evening with the fake host", () => {
  it("5 guests add 40 tracks through a mode switch and a lost host; every track plays once, then the jam wave", async () => {
    const url = await startServer();
    let host = fakeHost(url, 3_000);
    const session = await host.create();
    const guests = await guestsWithTracks(url, session);

    await Promise.all(guests.map((guest) => add(guest, 4)));
    host.settings({ order: "fifo" });

    host.drop(false);
    await guests[0]?.client.stateWhere((state) => !state.room.hostOnline);
    await Promise.all(guests.map((guest) => add(guest, 2)));

    const restarted = fakeHost(url, 3_000);
    restarted.session = host.session;
    restarted.snapshot = host.snapshot;
    restarted.outbox = [...host.outbox];
    host.stop();
    host = restarted;
    expect(await host.resume()).toBe(true);
    host.settings({ order: "round-robin" });
    await Promise.all(guests.map((guest) => add(guest, 2)));

    const everyItem = Array.from({ length: 40 }, (_, index) => `i${index + 1}`);
    const played = (): string[] => [...hosts.flatMap((fake) => fake.started)];
    await until(
      () => everyItem.every((itemId) => played().includes(itemId)),
      "all 40 items to play",
    );
    await until(() => host.nowPlaying?.kind === "wave", "the jam wave after the queue");

    const counts = new Map<string, number>();
    for (const itemId of played()) {
      counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
    }
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
    expect([...counts.keys()].sort()).toEqual([...everyItem].sort());
    const last = await guests[0]?.client.stateWhere(
      (state) => state.room.nowPlaying.source === "wave",
    );
    expect(last?.room.queue).toEqual([]);
    expect(last?.room.hostOnline).toBe(true);
    for (const guest of guests) {
      guest.client.close();
    }
  });

  it("the server crashes mid-evening; the host raises the room from its snapshot and the guests come back", async () => {
    const firstUrl = await startServer();
    const host = fakeHost(firstUrl, 1);
    const session = await host.create();
    const anya = await joinGuest(firstUrl, session, 1, "Аня");
    const tracks = searchCatalog(catalog, "Queen", 3);
    anya.send({ type: "search", id: "s", text: "Queen" });
    await anya.nextOf("searchResults");
    for (const track of tracks) {
      anya.send({ type: "add", id: `add-${track.id}`, trackId: track.id });
      await anya.nextOf("ack");
    }
    await until(
      () => (host.snapshot?.room.queue.length ?? 0) + (host.nowPlaying ? 1 : 0) === 3,
      "a snapshot with the items",
    );

    await servers.splice(0, 1)[0]?.close();
    const secondUrl = await startServer();
    const raised = fakeHost(secondUrl, 1);
    raised.session = host.session;
    raised.snapshot = host.snapshot;
    raised.outbox = [...host.outbox];
    host.stop();
    expect(await raised.resume()).toBe(true);

    const back = await joinGuest(secondUrl, session, 1, "Аня");
    const state = await back.stateWhere((candidate) => candidate.room.hostOnline);
    expect(state.room.participants.map((participant) => participant.name)).toEqual(["Маша", "Аня"]);
    const items = [
      ...(state.room.nowPlaying.itemId === undefined ? [] : [state.room.nowPlaying.itemId]),
      ...state.room.queue.map((item) => item.itemId),
      ...state.room.recent.map((item) => item.itemId),
    ];
    expect(items.sort()).toEqual(["i1", "i2", "i3"]);
    back.close();
  });
});

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SnapshotData } from "../../src/protocol/generated/types.js";
import { ids } from "../../src/net/ids.js";
import { parseTrustedProxies } from "../../src/net/real-ip.js";
import { JamServer } from "../../src/net/server.js";
import { JamClient } from "../support/jam-client.js";
import { track } from "../support/room-harness.js";

const PUBLIC_URL = "https://jam.example.org";
const running: JamServer[] = [];

type Started = { server: JamServer; url: string };

async function start(
  dataDir: string,
  roomsFile: boolean,
  snapshotIntervalMs = 200,
): Promise<Started> {
  const server = new JamServer({
    publicUrl: PUBLIC_URL,
    trustedProxies: parseTrustedProxies("127.0.0.1"),
    roomsFile: roomsFile ? join(dataDir, "rooms.json") : null,
    assetlinksJson: null,
    webRoot: null,
    timing: { handshakeMs: 1_000, pingIntervalMs: 1_000, deadAfterMs: 5_000, snapshotIntervalMs },
  });
  running.push(server);
  const address = await server.listen(0, "127.0.0.1");
  return { server, url: `ws://127.0.0.1:${address.port}/ws` };
}

async function stop(server: JamServer): Promise<void> {
  running.splice(running.indexOf(server), 1);
  await server.close();
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

type Jam = { host: JamClient; roomId: string; hostSecret: string; joinSecret: string };

async function createJam(url: string): Promise<Jam> {
  const host = await JamClient.hello(url, "desktop");
  host.send({ type: "create", id: "h1", hostName: "Маша" });
  const created = await host.nextOf("created");
  return {
    host,
    roomId: created.roomId,
    hostSecret: created.hostSecret,
    joinSecret: created.joinSecret,
  };
}

async function joinAs(
  url: string,
  jam: Jam,
  participant: number,
  name: string,
): Promise<{ guest: JamClient; publicId: string }> {
  const guest = await JamClient.hello(url, "web");
  guest.send({
    type: "join",
    id: "g1",
    roomId: jam.roomId,
    joinSecret: jam.joinSecret,
    participantId: `00000000-0000-4000-8000-${String(participant).padStart(12, "0")}`,
    name,
  });
  const joined = await guest.nextOf("joined");
  return { guest, publicId: joined.publicId };
}

async function addThroughHost(jam: Jam, guest: JamClient, trackId: string): Promise<void> {
  guest.send({ type: "search", id: "g-search", text: "anything" });
  const request = await jam.host.nextOf("searchRequest");
  jam.host.send({ type: "searchResult", requestId: request.requestId, tracks: [track(trackId)] });
  await guest.nextOf("searchResults");
  guest.send({ type: "add", id: "g-add", trackId });
  await guest.nextOf("ack");
}

async function latestSnapshot(host: JamClient, version: number): Promise<SnapshotData> {
  for (;;) {
    const snapshot = await host.nextOf("snapshot");
    if (snapshot.data.room.version >= version) {
      return snapshot.data;
    }
  }
}

function resumeMessage(
  jam: Jam,
  snapshot: SnapshotData | null,
  outbox: string[] = [],
): Record<string, unknown> {
  return {
    type: "resume",
    id: "h2",
    roomId: jam.roomId,
    hostSecret: jam.hostSecret,
    snapshot,
    outbox: outbox.map((itemId) => ({ type: "started", itemId })),
  };
}

describe("recovery over the socket", () => {
  it("REC-12 the host gets a snapshot at once, then at most one per interval, always the latest", async () => {
    const { url } = await start(mkdtempSync(join(tmpdir(), "jam-rec-")), false, 300);
    const jam = await createJam(url);
    const first = await jam.host.nextOf("snapshot");
    const firstAt = Date.now();
    expect(first.data.room.version).toBe(1);
    const { guest } = await joinAs(url, jam, 1, "Аня");
    guest.send({ type: "search", id: "noop", text: "x" });
    jam.host.send({ type: "settings", id: "h3", settings: { order: "fifo" } });
    const trailing = await jam.host.nextOf("snapshot");
    expect(Date.now() - firstAt).toBeGreaterThanOrEqual(250);
    expect(trailing.data.room.version).toBe(3);
    expect(trailing.data.room.settings.order).toBe("fifo");
    jam.host.close();
    guest.close();
  });

  it("REC-04 a second host connection that resumes takes over, and the first is closed with 1000", async () => {
    const { url } = await start(mkdtempSync(join(tmpdir(), "jam-rec-")), false);
    const jam = await createJam(url);
    const second = await JamClient.hello(url, "android");
    second.send(resumeMessage(jam, null));
    expect(await second.nextOf("resumed")).toEqual({ type: "resumed", id: "h2", restored: false });
    expect(await jam.host.closed).toEqual({ code: 1000 });
    const { guest } = await joinAs(url, jam, 1, "Аня");
    expect(
      (await second.stateWhere((state) => state.room.participants.length === 2)).room.hostOnline,
    ).toBe(true);
    guest.close();
    second.close();
  });

  it("REC-06 REC-11 after a crash the host raises its room from the snapshot, and guests come back as themselves", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "jam-rec-"));
    const first = await start(dataDir, false);
    const jam = await createJam(first.url);
    const { guest, publicId } = await joinAs(first.url, jam, 1, "Аня");
    await addThroughHost(jam, guest, "100");
    const snapshot = await latestSnapshot(jam.host, 3);
    await stop(first.server);

    const second = await start(dataDir, false);
    const host = await JamClient.hello(second.url, "desktop");
    host.send(resumeMessage(jam, snapshot, ["i1"]));
    expect(await host.nextOf("resumed")).toEqual({ type: "resumed", id: "h2", restored: true });
    const state = await host.nextOf("state");
    expect(state.room.id).toBe(jam.roomId);
    expect(state.room.nowPlaying.itemId).toBe("i1");
    expect(
      state.room.participants.map((participant) => [participant.publicId, participant.online]),
    ).toEqual([
      [state.room.you.publicId, true],
      [publicId, false],
    ]);
    const back = await joinAs(second.url, { ...jam, host }, 1, "Аня");
    expect(back.publicId).toBe(publicId);
    back.guest.close();
    host.close();
  });

  it("REC-10 a planned restart saves the rooms to a file and loads them back; the host resumes a live room", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "jam-rec-"));
    const first = await start(dataDir, true);
    const jam = await createJam(first.url);
    const { guest, publicId } = await joinAs(first.url, jam, 1, "Аня");
    await addThroughHost(jam, guest, "100");
    await stop(first.server);
    expect(await jam.host.closed).toEqual({ code: 1001 });
    expect(existsSync(join(dataDir, "rooms.json"))).toBe(true);

    const second = await start(dataDir, true);
    expect(existsSync(join(dataDir, "rooms.json"))).toBe(false);
    expect(second.server.roomCount).toBe(1);
    const host = await JamClient.hello(second.url, "desktop");
    host.send(resumeMessage(jam, null));
    expect(await host.nextOf("resumed")).toEqual({ type: "resumed", id: "h2", restored: false });
    const back = await joinAs(second.url, { ...jam, host }, 1, "Аня");
    expect(back.publicId).toBe(publicId);
    const state = await back.guest.nextOf("state");
    expect(state.room.queue.map((item) => item.track.id)).toEqual(["100"]);
    back.guest.close();
    host.close();
  });

  it("REC-08 REC-09 no snapshot means room-not-found, and a wrong secret is bad-secret", async () => {
    const { url } = await start(mkdtempSync(join(tmpdir(), "jam-rec-")), false);
    const jam = await createJam(url);
    const snapshot = await latestSnapshot(jam.host, 1);
    const stranger = await JamClient.hello(url, "desktop");
    stranger.send({ ...resumeMessage(jam, null), roomId: "zzzzzzzz" });
    expect(await stranger.next()).toEqual({ type: "rejected", id: "h2", reason: "room-not-found" });
    stranger.send({ ...resumeMessage(jam, snapshot), roomId: "zzzzzzzz" });
    expect(await stranger.next()).toEqual({ type: "rejected", id: "h2", reason: "room-not-found" });
    stranger.send({ ...resumeMessage(jam, null), hostSecret: ids.hostSecret() });
    expect(await stranger.next()).toEqual({ type: "rejected", id: "h2", reason: "bad-secret" });
    const browser = await JamClient.hello(url, "web");
    browser.send(resumeMessage(jam, null));
    expect(await browser.next()).toEqual({ type: "rejected", id: "h2", reason: "not-allowed" });
    stranger.close();
    browser.close();
    jam.host.close();
  });

  it("REC-06 ROOM-02 raising a room counts as a new room of the host's IP", async () => {
    const first = await start(mkdtempSync(join(tmpdir(), "jam-rec-")), false);
    const jam = await createJam(first.url);
    const snapshot = await latestSnapshot(jam.host, 1);
    jam.host.close();
    await stop(first.server);
    const second = await start(mkdtempSync(join(tmpdir(), "jam-rec-")), false);
    const one = await createJam(second.url);
    const two = await createJam(second.url);
    const host = await JamClient.hello(second.url, "desktop");
    host.send(resumeMessage(jam, snapshot));
    expect(await host.next()).toEqual({ type: "rejected", id: "h2", reason: "rate-limited" });
    one.host.send({ type: "end", id: "bye" });
    await one.host.closed;
    host.send(resumeMessage(jam, snapshot));
    expect(await host.nextOf("resumed")).toEqual({ type: "resumed", id: "h2", restored: true });
    host.close();
    two.host.close();
  });
});

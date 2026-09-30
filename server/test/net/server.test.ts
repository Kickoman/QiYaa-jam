import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addHostKey, HostKeys } from "../../src/host-keys.js";
import { ids } from "../../src/net/ids.js";
import { parseTrustedProxies } from "../../src/net/real-ip.js";
import { JamServer } from "../../src/net/server.js";
import {
  GUEST_ADDS_PER_MINUTE,
  IP_FAILED_JOINS_PER_MINUTE,
  IP_OPEN_CONNECTIONS,
  ROOMS_PER_SERVER,
} from "../../src/room/limits.js";
import { JamClient } from "../support/jam-client.js";
import { track } from "../support/room-harness.js";

const PUBLIC_URL = "https://jam.example.org";
const keyFile = join(mkdtempSync(join(tmpdir(), "jam-keys-")), "host-keys.json");
const HOST_KEY = ids.hostKey();
addHostKey(keyFile, "test", HOST_KEY, new Date());

const server = new JamServer({
  publicUrl: PUBLIC_URL,
  trustedProxies: parseTrustedProxies("127.0.0.1"),
  hostKeys: new HostKeys(keyFile),
  assetlinksJson: null,
  webRoot: null,
  timing: { handshakeMs: 300, pingIntervalMs: 100, deadAfterMs: 400 },
});
let url = "";
let ipCounter = 0;

function freshIp(): Record<string, string> {
  ipCounter++;
  return { "x-real-ip": `198.51.100.${ipCounter}` };
}

beforeAll(async () => {
  const address = await server.listen(0, "127.0.0.1");
  url = `ws://127.0.0.1:${address.port}/ws`;
});

afterAll(async () => {
  await server.close();
});

async function hostWithRoom(headers = freshIp()): Promise<{
  host: JamClient;
  roomId: string;
  joinSecret: string;
}> {
  const host = await JamClient.hello(url, "desktop", headers);
  host.send({ type: "create", id: "h1", hostKey: HOST_KEY, hostName: "Маша" });
  const created = await host.nextOf("created");
  await host.nextOf("state");
  return { host, roomId: created.roomId, joinSecret: created.joinSecret };
}

describe("handshake", () => {
  it("ROOM-54 a connection that sends no hello in time is closed with 1008", async () => {
    const client = await JamClient.open(url, freshIp());
    expect(await client.closed).toEqual({ code: 1008 });
  });

  it("answers hello with welcome and the server time", async () => {
    const client = await JamClient.open(url, freshIp());
    client.send({ type: "hello", protocol: 1, app: "web", appVersion: "1.0.0" });
    const welcome = await client.next();
    expect(welcome).toMatchObject({ type: "welcome", protocol: 1 });
    client.close();
  });

  it("hello with a protocol the server does not speak gets update-required and a clean close", async () => {
    const client = await JamClient.open(url, freshIp());
    client.send({ type: "hello", protocol: 2, app: "web", appVersion: "9.0.0" });
    expect(await client.next()).toEqual({
      type: "rejected",
      reason: "update-required",
      serverProtocol: 1,
    });
    expect(await client.closed).toEqual({ code: 1000 });
  });
});

describe("frames and violations", () => {
  it("ROOM-55 a web connection's frame over its limit is closed with 1009", async () => {
    const client = await JamClient.hello(url, "web", freshIp());
    client.send({ type: "search", id: "g1", text: "x".repeat(5_000) });
    expect(await client.closed).toEqual({ code: 1009 });
  });

  it("ROOM-56 malformed text, an unknown type and a binary frame close with 1008", async () => {
    for (const send of [
      (client: JamClient) => {
        client.sendRaw("not json");
      },
      (client: JamClient) => {
        client.send({ type: "dance" });
      },
      (client: JamClient) => {
        client.sendRaw(Buffer.from([1, 2, 3]), true);
      },
    ]) {
      const client = await JamClient.hello(url, "web", freshIp());
      send(client);
      expect(await client.closed).toEqual({ code: 1008 });
    }
  });

  it("ROOM-56 a known message that breaks its schema is refused with its id, then closed with 1008", async () => {
    const client = await JamClient.hello(url, "web", freshIp());
    client.send({ type: "join", id: "g1", roomId: "NOPE" });
    expect(await client.next()).toEqual({ type: "rejected", id: "g1", reason: "invalid-message" });
    expect(await client.closed).toEqual({ code: 1008 });
  });

  it("ROOM-57 after three violations the IP gets 429 until the ban ends", async () => {
    const headers = freshIp();
    for (let violation = 0; violation < 3; violation++) {
      const client = await JamClient.hello(url, "web", headers);
      client.send({ type: "dance" });
      await client.closed;
    }
    await expect(JamClient.open(url, headers)).rejects.toThrow("HTTP 429");
    const other = await JamClient.open(url, freshIp());
    other.close();
  });
});

describe("who may connect", () => {
  it("ROOM-59 a browser page of another origin gets 403; the server's own origin and no origin are accepted", async () => {
    await expect(
      JamClient.open(url, { ...freshIp(), origin: "https://evil.example" }),
    ).rejects.toThrow("HTTP 403");
    (await JamClient.open(url, { ...freshIp(), origin: PUBLIC_URL })).close();
    (await JamClient.open(url, freshIp())).close();
  });

  it("ROOM-58 an IP with its maximum of open connections gets 429 for the next one", async () => {
    const headers = freshIp();
    const clients = await Promise.all(
      Array.from({ length: IP_OPEN_CONNECTIONS }, () => JamClient.open(url, headers)),
    );
    await expect(JamClient.open(url, headers)).rejects.toThrow("HTTP 429");
    for (const client of clients) {
      client.close();
    }
  });

  it("ROOM-61 a connection that does not answer pings is closed", async () => {
    const client = await JamClient.open(url, freshIp(), false);
    client.send({ type: "hello", protocol: 1, app: "web", appVersion: "1.0.0" });
    const closed = await client.closed;
    expect(closed.code).toBe(1006);
  });
});

describe("rooms over the socket", () => {
  it("ROOM-02 create with an unknown key gets bad-key, and a browser may not create at all", async () => {
    const desktop = await JamClient.hello(url, "desktop", freshIp());
    desktop.send({ type: "create", id: "h1", hostKey: ids.hostKey(), hostName: "Маша" });
    expect(await desktop.next()).toEqual({ type: "rejected", id: "h1", reason: "bad-key" });
    const web = await JamClient.hello(url, "web", freshIp());
    web.send({ type: "create", id: "h1", hostKey: HOST_KEY, hostName: "Маша" });
    expect(await web.next()).toEqual({ type: "rejected", id: "h1", reason: "not-allowed" });
    desktop.close();
    web.close();
  });

  it("ROOM-58 after the IP's maximum of failed joins even the right secret is rate-limited", async () => {
    const { host, roomId, joinSecret } = await hostWithRoom();
    const guest = await JamClient.hello(url, "web", freshIp());
    for (let attempt = 0; attempt < IP_FAILED_JOINS_PER_MINUTE; attempt++) {
      guest.send({
        type: "join",
        id: `g${attempt}`,
        roomId,
        joinSecret: "WrongSecretWrongSecret",
        participantId: "00000000-0000-4000-8000-000000000001",
        name: "Аня",
      });
      expect(await guest.next()).toMatchObject({ type: "rejected", reason: "bad-secret" });
    }
    guest.send({
      type: "join",
      id: "g-right",
      roomId,
      joinSecret,
      participantId: "00000000-0000-4000-8000-000000000001",
      name: "Аня",
    });
    expect(await guest.next()).toEqual({ type: "rejected", id: "g-right", reason: "rate-limited" });
    host.close();
    guest.close();
  });

  it("ROOM-23 a guest's add over the rate limit is rate-limited, refused or not", async () => {
    const { host, roomId, joinSecret } = await hostWithRoom();
    const guest = await JamClient.hello(url, "web", freshIp());
    guest.send({
      type: "join",
      id: "g0",
      roomId,
      joinSecret,
      participantId: "00000000-0000-4000-8000-000000000002",
      name: "Боря",
    });
    await guest.nextOf("joined");
    for (let add = 0; add < GUEST_ADDS_PER_MINUTE; add++) {
      guest.send({ type: "add", id: `a${add}`, trackId: `${add}` });
      expect(await guest.nextOf("rejected")).toMatchObject({ reason: "unknown-track" });
    }
    guest.send({ type: "add", id: "a-last", trackId: "1" });
    expect(await guest.nextOf("rejected")).toEqual({
      type: "rejected",
      id: "a-last",
      reason: "rate-limited",
    });
    host.close();
    guest.close();
  });

  it("a whole evening in short: create, join, search through the host, add, play, kick, end", async () => {
    const { host, roomId, joinSecret } = await hostWithRoom();
    const anya = await JamClient.hello(url, "web", { ...freshIp(), origin: PUBLIC_URL });
    anya.send({
      type: "join",
      id: "g1",
      roomId,
      joinSecret,
      participantId: "00000000-0000-4000-8000-000000000003",
      name: "Аня",
    });
    const joined = await anya.nextOf("joined");
    expect((await anya.nextOf("state")).room.you).toEqual({
      publicId: joined.publicId,
      isHost: false,
    });
    expect((await host.nextOf("state")).room.participants).toHaveLength(2);

    anya.send({ type: "search", id: "g2", text: "группа крови" });
    const request = await host.nextOf("searchRequest");
    expect(request.text).toBe("группа крови");
    host.send({ type: "searchResult", requestId: request.requestId, tracks: [track("38633712")] });
    expect(await anya.nextOf("searchResults")).toEqual({
      type: "searchResults",
      id: "g2",
      tracks: [track("38633712")],
    });

    anya.send({ type: "add", id: "g3", trackId: "38633712" });
    expect(await anya.next()).toEqual({ type: "ack", id: "g3" });
    expect((await anya.nextOf("state")).room.queue).toHaveLength(1);
    const withItem = await host.nextOf("state");
    expect(withItem.room.queue.map((item) => [item.itemId, item.addedBy])).toEqual([
      ["i1", joined.publicId],
    ]);

    host.send({ type: "started", itemId: "i1" });
    expect((await anya.nextOf("state")).room.nowPlaying).toMatchObject({
      source: "item",
      itemId: "i1",
    });

    host.send({ type: "kick", id: "h2", publicId: joined.publicId });
    expect(await anya.nextOf("kicked")).toEqual({ type: "kicked" });
    expect(await anya.closed).toEqual({ code: 1000 });
    expect(await host.nextOf("ack")).toEqual({ type: "ack", id: "h2" });

    host.send({ type: "end", id: "h3" });
    expect(await host.nextOf("ack")).toEqual({ type: "ack", id: "h3" });
    expect(await host.nextOf("ended")).toEqual({ type: "ended", reason: "host-ended" });
    expect(await host.closed).toEqual({ code: 1000 });

    const late = await JamClient.hello(url, "web", freshIp());
    late.send({
      type: "join",
      id: "g9",
      roomId,
      joinSecret,
      participantId: "00000000-0000-4000-8000-000000000004",
      name: "Боря",
    });
    expect(await late.next()).toEqual({ type: "rejected", id: "g9", reason: "room-not-found" });
    late.close();
  });

  it("ROOM-16 ROOM-18 a QiYaa guest's track goes through the host's check; without the host it is host-offline", async () => {
    const { host, roomId, joinSecret } = await hostWithRoom();
    const borya = await JamClient.hello(url, "android", freshIp());
    borya.send({
      type: "join",
      id: "q1",
      roomId,
      joinSecret,
      participantId: "00000000-0000-4000-8000-000000000005",
      name: "Боря",
    });
    await borya.nextOf("joined");
    borya.send({ type: "add", id: "q2", track: track("555", "guest title") });
    const request = await host.nextOf("validateRequest");
    expect(request.trackIds).toEqual(["555"]);
    host.send({
      type: "validateResult",
      requestId: request.requestId,
      results: [{ trackId: "555", track: track("555", "canonical title") }],
    });
    expect(await borya.nextOf("ack")).toEqual({ type: "ack", id: "q2" });
    const state = await host.nextOf("state");
    expect(state.room.queue.map((item) => item.track.title)).toEqual(["canonical title"]);

    host.close();
    await host.closed;
    await borya.stateWhere((state) => !state.room.hostOnline);
    borya.send({ type: "add", id: "q3", track: track("556") });
    expect(await borya.nextOf("rejected")).toEqual({
      type: "rejected",
      id: "q3",
      reason: "host-offline",
    });
    borya.close();
  });

  it("ROOM-03 the server refuses a room over its maximum with server-full", async () => {
    const hosts: JamClient[] = [];
    while (server.roomCount < ROOMS_PER_SERVER) {
      hosts.push((await hostWithRoom()).host);
    }
    const extra = await JamClient.hello(url, "android", freshIp());
    extra.send({ type: "create", id: "h1", hostKey: HOST_KEY, hostName: "Маша" });
    expect(await extra.next()).toEqual({ type: "rejected", id: "h1", reason: "server-full" });
    for (const host of [...hosts, extra]) {
      host.send({ type: "end", id: "bye" });
    }
    await Promise.all(hosts.map((host) => host.closed));
    extra.close();
  });
});

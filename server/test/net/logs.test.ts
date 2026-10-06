import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureLog } from "../../src/log.js";
import { parseTrustedProxies } from "../../src/net/real-ip.js";
import { JamServer } from "../../src/net/server.js";
import { JamClient } from "../support/jam-client.js";
import { track } from "../support/room-harness.js";

const PUBLIC_URL = "https://jam.example.org";
const lines: Record<string, unknown>[] = [];
configureLog({
  write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  level: "debug",
});

const server = new JamServer({
  publicUrl: PUBLIC_URL,
  trustedProxies: parseTrustedProxies("127.0.0.1"),
  assetlinksJson: null,
  webRoot: null,
  timing: { handshakeMs: 300, pingIntervalMs: 100, deadAfterMs: 400, statsIntervalMs: 50 },
});
let url = "";

beforeAll(async () => {
  const address = await server.listen(0, "127.0.0.1");
  url = `ws://127.0.0.1:${address.port}/ws`;
});

afterAll(async () => {
  await server.close();
});

function events(name: string): Record<string, unknown>[] {
  return lines.filter((line) => line.event === name);
}

describe("logs", () => {
  it("ROOM-63 an evening's logs count what happened and hold no names, titles, searches, secrets or ids", async () => {
    const participantId = "00000000-0000-4000-8000-0000000000a1";
    const host = await JamClient.hello(url, "desktop", { "x-real-ip": "198.51.100.7" });
    host.send({ type: "create", id: "h1", hostName: "Маша" });
    const { roomId, joinSecret, hostSecret } = await host.nextOf("created");
    await host.nextOf("state");

    const anya = await JamClient.hello(url, "web", {
      "x-real-ip": "198.51.100.8",
      origin: PUBLIC_URL,
    });
    anya.send({ type: "join", id: "g1", roomId, joinSecret, participantId, name: "Аня" });
    const joined = await anya.nextOf("joined");
    anya.send({ type: "search", id: "g2", text: "группа крови" });
    const request = await host.nextOf("searchRequest");
    host.send({
      type: "searchResult",
      requestId: request.requestId,
      tracks: [track("38633712", "Кино - Группа крови")],
    });
    await anya.nextOf("searchResults");
    anya.send({ type: "add", id: "g3", trackId: "38633712" });
    await anya.nextOf("ack");
    host.send({ type: "started", itemId: "i1" });
    await anya.stateWhere((state) => state.room.nowPlaying.source === "item");
    host.send({ type: "kick", id: "h2", publicId: joined.publicId });
    await anya.closed;
    host.send({ type: "end", id: "h3" });
    await host.closed;
    await expect.poll(() => events("room_ended").length).toBe(1);
    await expect.poll(() => events("jam_stats").length).toBeGreaterThan(0);

    const text = lines.map((line) => JSON.stringify(line)).join("\n");
    for (const secret of [
      "Маша",
      "Аня",
      "Группа крови",
      "группа крови",
      roomId,
      joinSecret,
      hostSecret,
      participantId,
      joined.publicId,
    ]) {
      expect(text, secret).not.toContain(secret);
    }

    for (const line of lines) {
      expect(line.service).toBe("qiyaa-jam");
      expect(["debug", "info", "warn", "error"]).toContain(line.level);
      expect(["http_request", "internal"]).toContain(line.stream);
      expect(Date.parse(String(line.ts))).not.toBeNaN();
    }
    expect(events("http_request").filter((line) => line.http_path === "/ws")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ http_status: 101, client_ip: "198.51.100.8" }),
      ]),
    );
    expect(events("ws_hello").map((line) => line.app)).toEqual(
      expect.arrayContaining(["desktop", "web"]),
    );
    expect(events("room_created")[0]).toMatchObject({ app: "desktop", order: "round-robin" });
    expect(events("guest_joined")).toEqual([expect.objectContaining({ kind: "web", guests: 1 })]);
    expect(events("guest_search")).toEqual([expect.objectContaining({ kind: "web" })]);
    expect(events("track_added")).toEqual([expect.objectContaining({ by: "guest", queue: 1 })]);
    expect(events("track_started")).toEqual([
      expect.objectContaining({ source: "item", by: "guest", listen: false }),
    ]);
    expect(events("guest_kicked")).toHaveLength(1);
    expect(events("room_ended")[0]).toMatchObject({
      reason: "host-ended",
      restored: false,
      guests: 1,
      guest_tracks: 1,
      host_tracks: 0,
      played_items: 1,
      searches: 1,
      kicked: 1,
      listen_shared: false,
      rooms: 0,
    });
    await expect
      .poll(() => events("ws_close").map((line) => line.app))
      .toEqual(expect.arrayContaining(["desktop", "web"]));
  });

  it("jam_stats tells what is live: rooms, people online and connections by app", async () => {
    const host = await JamClient.hello(url, "android", { "x-real-ip": "198.51.100.9" });
    host.send({ type: "create", id: "h1", hostName: "Маша" });
    await host.nextOf("created");
    const before = lines.length;
    await expect
      .poll(() => lines.slice(before).find((line) => line.event === "jam_stats"))
      .toMatchObject({
        rooms: 1,
        hosts_online: 1,
        guests: 0,
        connections: 1,
        connections_android: 1,
        rooms_sharing: 0,
      });
    host.send({ type: "end", id: "h2" });
    await host.closed;
  });
});

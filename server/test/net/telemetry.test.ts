import { readdirSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureLog } from "../../src/log.js";
import { createHttpServer } from "../../src/net/http.js";

const EXAMPLES = new URL("../../../spec/telemetry/examples/", import.meta.url);
const logged: Record<string, unknown>[] = [];
configureLog({
  write: (line) => logged.push(JSON.parse(line) as Record<string, unknown>),
  level: "debug",
});

const server = createHttpServer({
  assetlinksJson: null,
  webRoot: null,
  trustedProxies: new Set(["127.0.0.1"]),
});
let url = "";
let ipCounter = 0;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/telemetry`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function example(name: string): string {
  return readFileSync(new URL(name, EXAMPLES), "utf8");
}

/** An example from another machine: the examples share one, and so its per-minute budget. */
function fromMachine(name: string, machine: string): string {
  return JSON.stringify({ ...(JSON.parse(example(name)) as object), machine });
}

/** A batch from its own address, so the per-IP limit stays out of the way. */
async function post(body: string, ip = `203.0.113.${++ipCounter}`): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body,
  });
}

function since(before: number): Record<string, unknown>[] {
  return logged.slice(before);
}

describe("telemetry", () => {
  it("TEL-11 takes every valid example of the spec, one log line per event", async () => {
    for (const name of readdirSync(EXAMPLES).filter(
      (file) => file.endsWith(".json") && !file.startsWith("invalid-"),
    )) {
      const before = logged.length;
      const response = await post(example(name));
      expect(response.status, name).toBe(204);
      const batch = JSON.parse(example(name)) as { events: unknown[] };
      await expect
        .poll(() => since(before).filter((line) => line.stream === "telemetry").length)
        .toBe(batch.events.length);
    }
  });

  it("TEL-11 a line carries who sent it and the event's fields in snake_case, at its level", async () => {
    const before = logged.length;
    await post(example("crash-then-start.json"), "198.51.100.77");
    await expect
      .poll(() => since(before).filter((line) => line.stream === "telemetry"))
      .toHaveLength(2);
    const [crash, start] = since(before).filter((line) => line.stream === "telemetry");
    expect(crash).toMatchObject({
      service: "qiyaa-desktop",
      level: "error",
      event: "app_crash",
      machine: "5d41402abc4b2a76b9719d911017c592",
      client_ip: "198.51.100.77",
      client_at: "2026-10-08T09:59:58.000Z",
      session: "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b",
      app_version: "0.5.0",
      signal: "SIGSEGV",
      frames: "QiYaa+0x4f2a10 QiYaa+0x4f1c88 libQt6Widgets.so.6+0x1d2f40 libc.so.6+0x29d90",
      signature:
        "SIGSEGV QiYaa+0x4f2a10 QiYaa+0x4f1c88 libQt6Widgets.so.6+0x1d2f40 libc.so.6+0x29d90",
      seconds: 1834,
    });
    expect(start).toMatchObject({
      level: "info",
      event: "app_start",
      os_name: "Ubuntu 24.04.1 LTS",
      milkdrop_built: true,
      audio_backend: "PulseAudio",
      first_run: false,
    });
    expect(start).not.toHaveProperty("type");
  });

  it("TEL-11 an api error's status is api_status, not the store's http_status", async () => {
    const before = logged.length;
    await post(example("session.json"));
    await expect.poll(() => since(before).find((line) => line.event === "app_error")).toBeTruthy();
    const error = since(before).find((line) => line.event === "app_error");
    expect(error).toMatchObject({ level: "warn", area: "api", kind: "http", api_status: 502 });
    expect(error).not.toHaveProperty("http_status");
  });

  it("TEL-12 refuses what is not a batch, and logs only the request", async () => {
    for (const name of readdirSync(EXAMPLES).filter((file) => file.startsWith("invalid-"))) {
      const before = logged.length;
      expect((await post(example(name))).status, name).toBe(400);
      await expect.poll(() => since(before).length).toBeGreaterThan(0);
      expect(
        since(before).filter((line) => line.stream === "telemetry"),
        name,
      ).toEqual([]);
      expect(since(before).at(-1)).toMatchObject({
        stream: "http_request",
        level: "info",
        http_path: "/api/telemetry",
        http_status: 400,
      });
      expect(JSON.stringify(since(before))).not.toContain("Кино");
    }
    expect((await post("{not json")).status).toBe(400);
  });

  it("TEL-12 a body over 64 KiB is 413", async () => {
    const response = await post(JSON.stringify({ padding: "x".repeat(70 * 1024) }));
    expect(response.status).toBe(413);
  });

  it("TEL-12 over 10 batches a minute from one machine, or 30 from one address, is 429", async () => {
    const statuses: number[] = [];
    const busy = "0123456789abcdef0123456789abcdef";
    for (let batch = 0; batch < 10; batch++) {
      statuses.push((await post(fromMachine("start.json", busy))).status);
    }
    expect(statuses).toEqual(Array<number>(10).fill(204));
    const refused = await post(fromMachine("start.json", busy));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("60");

    const fromOneAddress: number[] = [];
    for (let batch = 0; batch < 31; batch++) {
      fromOneAddress.push((await post("{}", "192.0.2.200")).status);
    }
    expect(fromOneAddress.slice(0, 30).every((status) => status === 400)).toBe(true);
    expect(fromOneAddress[30]).toBe(429);
  });

  it("an answered post is quiet in the request log; only POST is taken", async () => {
    const before = logged.length;
    await post(fromMachine("start.json", "fedcba9876543210fedcba9876543210"), "198.51.100.90");
    await expect
      .poll(() => since(before).find((line) => line.event === "http_request"))
      .toMatchObject({
        level: "debug",
        http_status: 204,
      });
    expect((await fetch(url)).status).toBe(404);
  });
});

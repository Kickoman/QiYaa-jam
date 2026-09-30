import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpServer } from "../src/net/http.js";

const server = createHttpServer();
let base = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("http", () => {
  it("answers /healthz with 200 ok", async () => {
    const response = await fetch(`${base}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok\n");
  });

  it("answers every other path with an empty 404", async () => {
    for (const path of ["/", "/wp-login.php", "/.env", "/healthz/x"]) {
      const response = await fetch(base + path);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
  });
});

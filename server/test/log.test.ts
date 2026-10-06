import { describe, expect, it } from "vitest";
import { configureLog, emit, log } from "../src/log.js";

describe("log", () => {
  it("writes one JSON line in the log store's schema, and drops what is below the level", () => {
    const lines: string[] = [];
    configureLog({ write: (line) => lines.push(line), level: "warn" });
    log.info("dropped");
    log.warn("violation", { code: 1008, reason: "binary" });
    emit("error", "http_request", "http_request", { http_status: 500 });
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.endsWith("\n") && !line.slice(0, -1).includes("\n"))).toBe(
      true,
    );
    const { ts, ...warning } = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    expect(ts).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(warning).toEqual({
      service: "qiyaa-jam",
      stream: "internal",
      level: "warn",
      event: "violation",
      message: "violation",
      code: 1008,
      reason: "binary",
    });
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({
      stream: "http_request",
      level: "error",
      http_status: 500,
    });
  });
});

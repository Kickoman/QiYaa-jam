import type { IncomingMessage, ServerResponse } from "node:http";
import { Ajv2020 } from "ajv/dist/2020.js";
import { emit, type Level, type LogFields } from "../log.js";
import {
  telemetrySchema,
  type CrashEvent,
  type TelemetryBatch,
} from "../protocol/generated/telemetry.js";
import { RateLimiter } from "./rate-limit.js";

// POST /api/telemetry (spec/telemetry): the apps' usage statistics and crash reports. Every event
// of a valid batch becomes one log line under the app's own service; the host's log collector
// takes them to the log store like any other line. The numbers are spec/telemetry/README.md#limits.

export const TELEMETRY_PATH = "/api/telemetry";
export const TELEMETRY_BODY_BYTES = 64 * 1024;
const BATCHES_PER_IP_PER_MINUTE = 30;
const BATCHES_PER_MACHINE_PER_MINUTE = 10;
const MINUTE_MS = 60_000;
const SERVICES: Readonly<Record<TelemetryBatch["app"], string>> = { desktop: "qiyaa-desktop" };

type Event = TelemetryBatch["events"][number];

const validate = new Ajv2020({ strict: true, strictRequired: false }).compile<TelemetryBatch>(
  telemetrySchema,
);

/** TEL-11: a crash is an error of the store, a failure and an unclean exit warnings. */
function levelOf(type: Event["type"]): Level {
  switch (type) {
    case "crash":
      return "error";
    case "error":
    case "unclean_exit":
      return "warn";
    default:
      return "info";
  }
}

function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** One event's log fields: its own in snake_case, frames as one string, plus who sent it. */
export function eventFields(event: Event, machine: string, clientIp: string): LogFields {
  const fields: Record<string, string | number | boolean | null> = {
    machine,
    client_ip: clientIp,
    client_at: event.at,
    session: event.session,
    app_version: event.version,
  };
  for (const [name, value] of Object.entries(event)) {
    if (name === "type" || name === "at" || name === "session" || name === "version") {
      continue;
    }
    if (name === "httpStatus") {
      fields.api_status = value as number; // not http_status: the store keeps that for requests
    } else if (Array.isArray(value)) {
      fields[snakeCase(name)] = value.join(" ");
    } else {
      fields[snakeCase(name)] = value as string | number | boolean;
    }
  }
  if (event.type === "crash") {
    fields.signature = crashSignature(event);
  }
  return fields;
}

/** The same bug gives the same signature on every machine: the signal and the first frames. */
export function crashSignature(event: CrashEvent): string {
  return [event.signal, ...event.frames.slice(0, 4)].join(" ");
}

async function readBody(request: IncomingMessage): Promise<Buffer | null> {
  if (Number(request.headers["content-length"] ?? "0") > TELEMETRY_BODY_BYTES) {
    return null;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > TELEMETRY_BODY_BYTES) {
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export class TelemetryReceiver {
  private readonly perIp = new RateLimiter(BATCHES_PER_IP_PER_MINUTE, MINUTE_MS);
  private readonly perMachine = new RateLimiter(BATCHES_PER_MACHINE_PER_MINUTE, MINUTE_MS);
  private sweptAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** TEL-11, TEL-12. Nothing of a refused body is logged; the request itself is. */
  async receive(
    request: IncomingMessage,
    response: ServerResponse,
    clientIp: string,
  ): Promise<void> {
    const now = this.now();
    if (now - this.sweptAt > MINUTE_MS) {
      this.sweptAt = now;
      this.perIp.forgetIdle(now);
      this.perMachine.forgetIdle(now);
    }
    if (!this.perIp.take(clientIp, now)) {
      this.refuse(response, 429);
      return;
    }
    const body = await readBody(request);
    if (body === null) {
      this.refuse(response, 413);
      return;
    }
    let batch: unknown;
    try {
      batch = JSON.parse(body.toString("utf8"));
    } catch {
      this.refuse(response, 400);
      return;
    }
    if (!validate(batch)) {
      this.refuse(response, 400);
      return;
    }
    if (!this.perMachine.take(batch.machine, now)) {
      this.refuse(response, 429);
      return;
    }
    const service = SERVICES[batch.app];
    for (const event of batch.events) {
      emit(
        levelOf(event.type),
        "telemetry",
        `app_${event.type}`,
        eventFields(event, batch.machine, clientIp),
        service,
      );
    }
    response.writeHead(204).end();
  }

  private refuse(response: ServerResponse, status: 400 | 413 | 429): void {
    const headers: Record<string, string> = { connection: "close" };
    if (status === 429) {
      headers["retry-after"] = "60";
    }
    response.writeHead(status, headers).end();
  }
}

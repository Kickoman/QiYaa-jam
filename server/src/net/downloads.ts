import type { IncomingMessage, ServerResponse } from "node:http";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { LogFields } from "../log.js";
import { readJsonBody, refuse } from "./post-body.js";
import { RateLimiter } from "./rate-limit.js";

// POST /api/download (spec/telemetry/README.md#the-landing): a click on one of the landing's
// download buttons. It is no log line of its own: its fields go into the request's line. The
// numbers are that section's limits.

export const DOWNLOAD_PATH = "/api/download";
export const DOWNLOAD_BODY_BYTES = 1024;
const CLICKS_PER_IP_PER_MINUTE = 10;
const MINUTE_MS = 60_000;

/** The landing's `data-download` ids, as in web/site/releases.ts. */
const FILES = ["windows-setup", "windows-zip", "appimage", "deb", "dmg", "apk"] as const;
const PLACES = ["download", "android"] as const;
const LANGUAGES = ["be", "ru", "en"] as const;

export type DownloadClick = {
  readonly file: (typeof FILES)[number];
  readonly place: (typeof PLACES)[number];
  readonly language: (typeof LANGUAGES)[number];
  readonly version?: string;
  readonly browserLanguage?: string;
  readonly referrer?: string;
};

const validate = new Ajv2020({ strict: true, strictRequired: false }).compile<DownloadClick>({
  type: "object",
  additionalProperties: false,
  required: ["file", "place", "language"],
  properties: {
    file: { type: "string", enum: FILES },
    place: { type: "string", enum: PLACES },
    language: { type: "string", enum: LANGUAGES },
    version: { type: "string", maxLength: 20, pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    browserLanguage: { type: "string", pattern: "^[A-Za-z0-9-]{1,35}$" },
    referrer: { type: "string", pattern: "^[a-z0-9.:-]{1,253}$" },
  },
});

const NO_FIELDS: LogFields = {};

export function parseDownloadClick(value: unknown): DownloadClick | null {
  return validate(value) ? value : null;
}

/** TEL-14: the click as fields of the request's log line. */
export function clickFields(click: DownloadClick): LogFields {
  return {
    file: click.file,
    place: click.place,
    page_language: click.language,
    ...(click.version === undefined ? {} : { app_version: click.version }),
    ...(click.browserLanguage === undefined ? {} : { browser_language: click.browserLanguage }),
    ...(click.referrer === undefined ? {} : { referrer_host: click.referrer }),
  };
}

export class DownloadReceiver {
  private readonly perIp = new RateLimiter(CLICKS_PER_IP_PER_MINUTE, MINUTE_MS);
  private sweptAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** TEL-14, TEL-15. Returns the fields for the request's log line, none for a refusal. */
  async receive(
    request: IncomingMessage,
    response: ServerResponse,
    clientIp: string,
  ): Promise<LogFields> {
    const now = this.now();
    if (now - this.sweptAt > MINUTE_MS) {
      this.sweptAt = now;
      this.perIp.forgetIdle(now);
    }
    if (!this.perIp.take(clientIp, now)) {
      refuse(response, 429);
      return NO_FIELDS;
    }
    const body = await readJsonBody(request, DOWNLOAD_BODY_BYTES);
    if (body.kind === "too-large") {
      refuse(response, 413);
      return NO_FIELDS;
    }
    const click = body.kind === "json" ? parseDownloadClick(body.value) : null;
    if (click === null) {
      refuse(response, 400);
      return NO_FIELDS;
    }
    response.writeHead(204).end();
    return clickFields(click);
  }
}

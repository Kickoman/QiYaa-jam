// Structured logs: one JSON line per event on stdout, in the schema the log collector expects
// (ts, service, stream, level, event, message, and the http_* fields for requests). Nothing is
// shipped from here: the collector reads the container's stdout. What may go into a log is
// ROOM-63: never names, track titles, search texts, secrets, roomIds or participantIds.

export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export type Level = "debug" | "info" | "warn" | "error";

/** `http_request`: one event per HTTP request; `internal`: everything else. */
export type Stream = "http_request" | "internal";

const RANK: Readonly<Record<Level, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

function levelFrom(value: string | undefined): Level {
  const level = (value ?? "").toLowerCase();
  return level === "debug" || level === "warn" || level === "error" ? level : "info";
}

const settings = {
  service: process.env.SERVICE_NAME || "qiyaa-jam",
  minimum: levelFrom(process.env.LOG_LEVEL),
  write: (line: string): void => {
    process.stdout.write(line);
  },
};

/** Tests: where lines go and which level passes; the environment sets them in the server. */
export function configureLog(options: {
  readonly write?: (line: string) => void;
  readonly level?: Level;
}): void {
  if (options.write) {
    settings.write = options.write;
  }
  if (options.level) {
    settings.minimum = options.level;
  }
}

export function emit(level: Level, stream: Stream, event: string, fields: LogFields = {}): void {
  if (RANK[level] < RANK[settings.minimum]) {
    return;
  }
  const line = {
    ts: new Date().toISOString(),
    service: settings.service,
    stream,
    level,
    event,
    message: event,
    ...fields,
  };
  settings.write(JSON.stringify(line) + "\n");
}

export const log = {
  debug: (event: string, fields?: LogFields): void => {
    emit("debug", "internal", event, fields);
  },
  info: (event: string, fields?: LogFields): void => {
    emit("info", "internal", event, fields);
  },
  warn: (event: string, fields?: LogFields): void => {
    emit("warn", "internal", event, fields);
  },
  error: (event: string, fields?: LogFields): void => {
    emit("error", "internal", event, fields);
  },
};

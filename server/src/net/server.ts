import type { IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { log } from "../log.js";
import type {
  ClientMessage,
  CreateMessage,
  JoinMessage,
  RejectedMessage,
  ResumeMessage,
  ServerMessage,
} from "../protocol/generated/types.js";
import { isSnapshotData, parseClientMessage } from "../protocol/validate.js";
import {
  BAN_MS,
  DEAD_AFTER_MS,
  GUEST_ADDS_PER_MINUTE,
  GUEST_FRAME_BYTES,
  HANDSHAKE_MS,
  HOST_FRAME_BYTES,
  IP_FAILED_JOINS_PER_MINUTE,
  IP_LIVE_ROOMS,
  IP_NEW_CONNECTIONS_PER_MINUTE,
  IP_OPEN_CONNECTIONS,
  IP_ROOMS_PER_HOUR,
  PING_INTERVAL_MS,
  RATE_WINDOW_MS,
  ROOM_RATE_WINDOW_MS,
  ROOMS_PER_SERVER,
  SNAPSHOT_INTERVAL_MS,
  VIOLATIONS_BEFORE_BAN,
  WEB_GUEST_SEARCHES_PER_MINUTE,
} from "../room/limits.js";
import { createRoom, isPublicIdFree, reduce } from "../room/room.js";
import { hashSecret } from "../room/secrets.js";
import { fromSnapshot, snapshotProblem, toSnapshot } from "../room/snapshot.js";
import type { Outcome, RoomContext, RoomEvent, RoomState } from "../room/types.js";
import { stateFor } from "../room/view.js";
import { createHttpServer, logRequest, type HttpOptions } from "./http.js";
import { ids } from "./ids.js";
import { saveRooms, takeRooms } from "./persistence.js";
import { RateLimiter, Violations } from "./rate-limit.js";
import { clientIp } from "./real-ip.js";
import { newTally, roomChanges, roomSummary, type Tally } from "./room-log.js";

export const PROTOCOL = 1;

/** How often the server logs `jam_stats`, the gauges the dashboard shows as "now". */
const STATS_INTERVAL_MS = 60_000;

export type Timing = {
  readonly handshakeMs: number;
  readonly pingIntervalMs: number;
  readonly deadAfterMs: number;
  readonly snapshotIntervalMs: number;
  readonly statsIntervalMs: number;
};

export type JamServerOptions = HttpOptions & {
  readonly publicUrl: string;
  readonly trustedProxies: ReadonlySet<string>;
  readonly roomsFile?: string | null;
  readonly now?: () => number;
  readonly timing?: Partial<Timing>;
};

type Reason = RejectedMessage["reason"];

class Connection {
  app: "desktop" | "android" | "web" | null = null;
  roomId: string | null = null;
  publicId: string | null = null;
  host = false;
  replaced = false;
  handshake: NodeJS.Timeout | undefined;

  constructor(
    readonly id: string,
    readonly socket: WebSocket,
    readonly ip: string,
    readonly openedAt: number,
    public lastPongAt: number,
  ) {}

  get frameLimit(): number {
    if (this.host) {
      return HOST_FRAME_BYTES;
    }
    if (this.roomId !== null) {
      return GUEST_FRAME_BYTES;
    }
    return this.app === "desktop" || this.app === "android" ? HOST_FRAME_BYTES : GUEST_FRAME_BYTES;
  }

  send(message: ServerMessage): void {
    if (!this.replaced && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}

function frameText(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function requestIdOf(message: ClientMessage): string | null {
  const id: unknown = (message as Readonly<Record<string, unknown>>).id;
  return typeof id === "string" ? id : null;
}

export class JamServer {
  readonly http: Server;
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: HOST_FRAME_BYTES });
  private readonly connections = new Map<string, Connection>();
  private readonly rooms = new Map<string, RoomState>();
  private readonly timers = new Map<string, Set<NodeJS.Timeout>>();
  private readonly snapshotAt = new Map<string, number>();
  private readonly snapshotTimers = new Map<string, NodeJS.Timeout>();
  private readonly openPerIp = new Map<string, number>();
  private readonly newConnections = new RateLimiter(IP_NEW_CONNECTIONS_PER_MINUTE, RATE_WINDOW_MS);
  private readonly failedJoins = new RateLimiter(IP_FAILED_JOINS_PER_MINUTE, RATE_WINDOW_MS);
  private readonly adds = new RateLimiter(GUEST_ADDS_PER_MINUTE, RATE_WINDOW_MS);
  private readonly searches = new RateLimiter(WEB_GUEST_SEARCHES_PER_MINUTE, RATE_WINDOW_MS);
  private readonly newRooms = new RateLimiter(IP_ROOMS_PER_HOUR, ROOM_RATE_WINDOW_MS);
  /** The IP that created or raised each live room (ROOM-02); not in the snapshot. */
  private readonly roomIps = new Map<string, string>();
  /** What happened in each live room, for `room_ended`; not in the snapshot. */
  private readonly tallies = new Map<string, Tally>();
  private readonly violations = new Violations(VIOLATIONS_BEFORE_BAN, BAN_MS);
  private readonly allowedOrigin: string;
  private readonly timing: Timing;
  private readonly now: () => number;
  private readonly pinger: NodeJS.Timeout;
  private readonly statsTimer: NodeJS.Timeout;

  constructor(private readonly options: JamServerOptions) {
    this.now = options.now ?? Date.now;
    this.timing = {
      handshakeMs: HANDSHAKE_MS,
      pingIntervalMs: PING_INTERVAL_MS,
      deadAfterMs: DEAD_AFTER_MS,
      snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
      statsIntervalMs: STATS_INTERVAL_MS,
      ...options.timing,
    };
    this.allowedOrigin = new URL(options.publicUrl).origin;
    this.http = createHttpServer(options);
    this.http.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      this.upgrade(request, socket, head);
    });
    this.pinger = setInterval(() => {
      this.ping();
      this.expire();
    }, this.timing.pingIntervalMs);
    this.statsTimer = setInterval(() => {
      this.logStats();
    }, this.timing.statsIntervalMs);
    if (options.roomsFile) {
      this.load(options.roomsFile);
    }
  }

  private load(path: string): void {
    const taken = takeRooms(path);
    if (taken.problem !== null) {
      log.error("rooms_file_broken", { problem: taken.problem });
    }
    const now = this.now();
    for (const data of taken.rooms) {
      if (!isSnapshotData(data)) {
        log.warn("room_not_loaded", { problem: "does not match the schema" });
        continue;
      }
      const problem = snapshotProblem(data, now);
      if (problem !== null) {
        log.warn("room_not_loaded", { problem });
        continue;
      }
      this.rooms.set(data.room.id, fromSnapshot(data, now));
      this.tallies.set(data.room.id, newTally(now, true));
    }
    log.info("rooms_loaded", { rooms: this.rooms.size });
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  async listen(port: number, host: string): Promise<AddressInfo> {
    await new Promise<void>((resolve) => this.http.listen(port, host, resolve));
    return this.http.address() as AddressInfo;
  }

  async close(): Promise<void> {
    clearInterval(this.pinger);
    clearInterval(this.statsTimer);
    if (this.options.roomsFile) {
      saveRooms(this.options.roomsFile, [...this.rooms.values()].map(toSnapshot), this.now());
      log.info("rooms_saved", { rooms: this.rooms.size });
    }
    for (const timer of this.snapshotTimers.values()) {
      clearTimeout(timer);
    }
    this.snapshotTimers.clear();
    for (const roomTimers of this.timers.values()) {
      for (const timer of roomTimers) {
        clearTimeout(timer);
      }
    }
    this.timers.clear();
    for (const connection of this.connections.values()) {
      clearTimeout(connection.handshake);
      connection.socket.close(1001, "server restart");
    }
    this.sockets.close();
    await new Promise<void>((resolve) => {
      this.http.close(() => {
        resolve();
      });
      this.http.closeAllConnections();
    });
  }

  private context(): RoomContext {
    return { now: this.now(), publicUrl: this.options.publicUrl };
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const startedAt = process.hrtime.bigint();
    const now = this.now();
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const ip = clientIp(
      request.socket.remoteAddress,
      request.headers["x-real-ip"],
      this.options.trustedProxies,
    );
    const refuse = (status: number, text: string, reason: string): void => {
      logRequest(request, status, startedAt, this.options.trustedProxies, { reason });
      socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    if (path !== "/ws") {
      refuse(404, "Not Found", "path");
      return;
    }
    if (this.violations.isBanned(ip, now)) {
      refuse(429, "Too Many Requests", "banned");
      return;
    }
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== this.allowedOrigin) {
      refuse(403, "Forbidden", "origin");
      return;
    }
    if ((this.openPerIp.get(ip) ?? 0) >= IP_OPEN_CONNECTIONS) {
      refuse(429, "Too Many Requests", "open-connections");
      return;
    }
    if (!this.newConnections.take(ip, now)) {
      refuse(429, "Too Many Requests", "new-connections");
      return;
    }
    this.sockets.handleUpgrade(request, socket, head, (webSocket) => {
      logRequest(request, 101, startedAt, this.options.trustedProxies);
      this.open(webSocket, ip);
    });
  }

  private open(socket: WebSocket, ip: string): void {
    const connection = new Connection(ids.connectionId(), socket, ip, this.now(), this.now());
    this.connections.set(connection.id, connection);
    this.openPerIp.set(ip, (this.openPerIp.get(ip) ?? 0) + 1);
    connection.handshake = setTimeout(() => {
      this.violate(connection, 1008, "handshake");
    }, this.timing.handshakeMs);
    socket.on("message", (data: RawData, isBinary: boolean) => {
      this.receive(connection, data, isBinary);
    });
    socket.on("pong", () => {
      connection.lastPongAt = this.now();
    });
    socket.on("close", (code: number) => {
      this.closed(connection, code);
    });
    socket.on("error", (failed: Error & { code?: string }) => {
      if (failed.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") {
        this.recordViolation(connection, 1009, "frame-size");
      } else {
        log.warn("ws_error", { connection: connection.id, error: failed.code ?? failed.name });
      }
    });
    log.debug("ws_open", { connection: connection.id, client_ip: ip });
  }

  private closed(connection: Connection, code: number): void {
    clearTimeout(connection.handshake);
    this.connections.delete(connection.id);
    const open = (this.openPerIp.get(connection.ip) ?? 1) - 1;
    if (open > 0) {
      this.openPerIp.set(connection.ip, open);
    } else {
      this.openPerIp.delete(connection.ip);
    }
    log.info("ws_close", {
      connection: connection.id,
      app: connection.app ?? "none",
      role: connection.roomId === null ? "none" : connection.host ? "host" : "guest",
      code,
      seconds: Math.round((this.now() - connection.openedAt) / 1000),
    });
    if (connection.roomId !== null && connection.publicId !== null) {
      this.dispatch(connection.roomId, { kind: "disconnected", publicId: connection.publicId });
    }
  }

  private recordViolation(connection: Connection, code: number, reason: string): void {
    log.warn("violation", { connection: connection.id, client_ip: connection.ip, code, reason });
    if (this.violations.record(connection.ip, this.now())) {
      log.warn("ban", { client_ip: connection.ip });
    }
  }

  private violate(connection: Connection, code: number, reason: string): void {
    this.recordViolation(connection, code, reason);
    connection.socket.close(code);
  }

  private reject(connection: Connection, id: string | null, reason: Reason): void {
    log.info("rejected", { connection: connection.id, reason });
    connection.send(id === null ? { type: "rejected", reason } : { type: "rejected", id, reason });
  }

  private receive(connection: Connection, data: RawData, isBinary: boolean): void {
    const bytes = frameText(data);
    if (isBinary) {
      this.violate(connection, 1008, "binary");
      return;
    }
    if (bytes.length > connection.frameLimit) {
      this.violate(connection, 1009, "frame-size");
      return;
    }
    const parsed = parseClientMessage(bytes.toString("utf8"));
    switch (parsed.kind) {
      case "malformed":
      case "unknown-type":
        this.violate(connection, 1008, parsed.kind);
        return;
      case "invalid":
        this.reject(connection, parsed.id, "invalid-message");
        this.violate(connection, 1008, "invalid-message");
        return;
      case "message":
        if (connection.app === null) {
          this.hello(connection, parsed.message);
        } else {
          this.handle(connection, parsed.message);
        }
    }
  }

  private hello(connection: Connection, message: ClientMessage): void {
    if (message.type !== "hello") {
      this.violate(connection, 1008, "no-hello");
      return;
    }
    clearTimeout(connection.handshake);
    if (message.protocol !== PROTOCOL) {
      connection.send({ type: "rejected", reason: "update-required", serverProtocol: PROTOCOL });
      connection.socket.close(1000);
      return;
    }
    connection.app = message.app;
    log.info("ws_hello", {
      connection: connection.id,
      app: message.app,
      app_version: message.appVersion,
    });
    connection.send({ type: "welcome", protocol: PROTOCOL, serverTime: this.now() });
  }

  private handle(connection: Connection, message: ClientMessage): void {
    if (connection.replaced) {
      return;
    }
    const { roomId, publicId } = connection;
    if (roomId === null || publicId === null) {
      this.withoutRole(connection, message);
      return;
    }
    if (!connection.host) {
      const now = this.now();
      const key = `${roomId}/${publicId}`;
      if (message.type === "add" && !this.adds.take(key, now)) {
        this.reject(connection, message.id, "rate-limited");
        return;
      }
      if (message.type === "search" && !this.searches.take(key, now)) {
        this.reject(connection, message.id, "rate-limited");
        return;
      }
      if (message.type === "search") {
        const tally = this.tallies.get(roomId);
        if (tally) {
          tally.searches++;
        }
        log.info("guest_search", { kind: connection.app === "web" ? "web" : "qiyaa" });
      }
    }
    this.dispatch(roomId, {
      kind: "message",
      connection: connection.id,
      from: publicId,
      message,
      fresh: { requestId: ids.requestId(), joinSecret: ids.joinSecret() },
    });
  }

  private withoutRole(connection: Connection, message: ClientMessage): void {
    switch (message.type) {
      case "create":
        this.create(connection, message);
        return;
      case "join":
        this.join(connection, message);
        return;
      case "resume":
        this.resume(connection, message);
        return;
      default:
        this.reject(connection, requestIdOf(message), "not-allowed");
    }
  }

  private create(connection: Connection, message: CreateMessage): void {
    if (connection.app === "web") {
      this.reject(connection, message.id, "not-allowed");
      return;
    }
    if (!this.roomAllowed(connection, message.id)) {
      return;
    }
    let roomId = ids.roomId();
    while (this.rooms.has(roomId)) {
      roomId = ids.roomId();
    }
    const outcome = createRoom(
      {
        connection: connection.id,
        id: message.id,
        roomId,
        hostPublicId: ids.publicId(),
        hostName: message.hostName,
        hostSecret: ids.hostSecret(),
        joinSecret: ids.joinSecret(),
        ...(message.settings ? { settings: message.settings } : {}),
      },
      this.context(),
    );
    if (outcome.room) {
      this.rooms.set(roomId, outcome.room);
      this.countRoom(roomId, connection.ip);
      this.tallies.set(roomId, newTally(this.now(), false));
      const { order, guestsCanSkip, joinOpen, maxPendingPerGuest } = outcome.room.settings;
      log.info("room_created", {
        rooms: this.rooms.size,
        app: connection.app ?? "none",
        order,
        guests_can_skip: guestsCanSkip,
        join_open: joinOpen,
        max_pending: maxPendingPerGuest,
      });
    }
    this.apply(roomId, outcome);
  }

  private resume(connection: Connection, message: ResumeMessage): void {
    if (connection.app === "web") {
      this.reject(connection, message.id, "not-allowed");
      return;
    }
    const event = {
      kind: "resume",
      connection: connection.id,
      id: message.id,
      hostSecret: message.hostSecret,
      outbox: message.outbox,
    } as const;
    if (this.rooms.has(message.roomId)) {
      this.dispatch(message.roomId, { ...event, restored: false });
      return;
    }
    const snapshot = message.snapshot;
    let problem: string | null;
    if (snapshot === null) {
      problem = "no snapshot";
    } else if (snapshot.room.id !== message.roomId) {
      problem = "another room";
    } else {
      problem = snapshotProblem(snapshot, this.now());
    }
    if (snapshot === null || problem !== null) {
      log.info("room_not_restored", { problem });
      this.reject(connection, message.id, "room-not-found");
      return;
    }
    if (hashSecret(message.hostSecret) !== snapshot.room.hostSecretHash) {
      this.reject(connection, message.id, "bad-secret");
      return;
    }
    if (!this.roomAllowed(connection, message.id)) {
      return;
    }
    this.rooms.set(message.roomId, fromSnapshot(snapshot, this.now()));
    this.countRoom(message.roomId, connection.ip);
    this.tallies.set(message.roomId, newTally(this.now(), true));
    log.info("room_restored", { rooms: this.rooms.size, app: connection.app ?? "none" });
    this.dispatch(message.roomId, { ...event, restored: true });
  }

  /** ROOM-03, then ROOM-02: the limits on a new room, whether created or raised from a snapshot. */
  private roomAllowed(connection: Connection, id: string): boolean {
    if (this.rooms.size >= ROOMS_PER_SERVER) {
      this.reject(connection, id, "server-full");
      return false;
    }
    let live = 0;
    for (const ip of this.roomIps.values()) {
      if (ip === connection.ip) {
        live++;
      }
    }
    if (live >= IP_LIVE_ROOMS || !this.newRooms.allows(connection.ip, this.now())) {
      log.warn("rooms_limited", { client_ip: connection.ip, live });
      this.reject(connection, id, "rate-limited");
      return false;
    }
    return true;
  }

  private countRoom(roomId: string, ip: string): void {
    this.roomIps.set(roomId, ip);
    this.newRooms.spend(ip, this.now());
  }

  private join(connection: Connection, message: JoinMessage): void {
    const now = this.now();
    if (!this.failedJoins.allows(connection.ip, now)) {
      this.reject(connection, message.id, "rate-limited");
      return;
    }
    const room = this.rooms.get(message.roomId);
    if (!room) {
      this.failedJoins.spend(connection.ip, now);
      this.reject(connection, message.id, "room-not-found");
      return;
    }
    let publicId = ids.publicId();
    while (!isPublicIdFree(room, publicId)) {
      publicId = ids.publicId();
    }
    const outcome = this.dispatch(message.roomId, {
      kind: "join",
      connection: connection.id,
      id: message.id,
      participantId: message.participantId,
      joinSecret: message.joinSecret,
      name: message.name,
      participantKind: connection.app === "web" ? "web" : "qiyaa",
      newPublicId: publicId,
    });
    const badSecret = outcome?.effects.some(
      (effect) =>
        effect.kind === "send" &&
        effect.message.type === "rejected" &&
        effect.message.reason === "bad-secret",
    );
    if (badSecret) {
      this.failedJoins.spend(connection.ip, now);
    }
  }

  private dispatch(roomId: string, event: RoomEvent): Outcome | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }
    const outcome = reduce(room, event, this.context());
    if (outcome.room) {
      this.rooms.set(roomId, outcome.room);
      const tally = this.tallies.get(roomId);
      if (tally) {
        for (const change of roomChanges(room, outcome.room, tally, this.now())) {
          log.info(change.event, change.fields);
        }
      }
    }
    this.apply(roomId, outcome);
    return outcome;
  }

  private inRoom(roomId: string): Connection[] {
    return [...this.connections.values()].filter((connection) => connection.roomId === roomId);
  }

  private apply(roomId: string, outcome: Outcome): void {
    for (const effect of outcome.effects) {
      switch (effect.kind) {
        case "send":
          if (effect.message.type === "rejected") {
            log.info("rejected", { connection: effect.connection, reason: effect.message.reason });
          }
          this.connections.get(effect.connection)?.send(effect.message);
          break;
        case "admit": {
          const connection = this.connections.get(effect.connection);
          if (connection) {
            connection.roomId = roomId;
            connection.publicId = effect.publicId;
            connection.host = outcome.room?.hostPublicId === effect.publicId;
            if (connection.host) {
              this.replaceOlderHosts(roomId, connection);
            }
          }
          break;
        }
        case "state": {
          const room = outcome.room;
          const now = this.now();
          for (const connection of this.inRoom(roomId)) {
            if (room && connection.publicId !== null) {
              connection.send(stateFor(room, connection.publicId, now));
            }
          }
          this.snapshotSoon(roomId);
          break;
        }
        case "to-host":
          for (const connection of this.inRoom(roomId)) {
            if (connection.host) {
              connection.send(effect.message);
            }
          }
          break;
        case "timer":
          this.schedule(roomId, effect.requestId, effect.at);
          break;
        case "drop":
          for (const connection of this.inRoom(roomId)) {
            if (connection.publicId === effect.publicId) {
              connection.send({ type: "kicked" });
              connection.socket.close(1000);
            }
          }
          break;
        case "end":
          this.end(roomId, effect.reason);
          break;
      }
    }
  }

  private replaceOlderHosts(roomId: string, newest: Connection): void {
    for (const connection of this.inRoom(roomId)) {
      if (connection.host && connection !== newest && !connection.replaced) {
        connection.replaced = true;
        connection.socket.close(1000);
      }
    }
  }

  private snapshotSoon(roomId: string): void {
    if (this.snapshotTimers.has(roomId)) {
      return;
    }
    const last = this.snapshotAt.get(roomId);
    const wait = last === undefined ? 0 : last + this.timing.snapshotIntervalMs - this.now();
    if (wait <= 0) {
      this.sendSnapshot(roomId);
      return;
    }
    this.snapshotTimers.set(
      roomId,
      setTimeout(() => {
        this.snapshotTimers.delete(roomId);
        this.sendSnapshot(roomId);
      }, wait),
    );
  }

  private sendSnapshot(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    this.snapshotAt.set(roomId, this.now());
    const message: ServerMessage = { type: "snapshot", data: toSnapshot(room) };
    for (const connection of this.inRoom(roomId)) {
      if (connection.host) {
        connection.send(message);
      }
    }
  }

  private expire(): void {
    for (const roomId of [...this.rooms.keys()]) {
      this.dispatch(roomId, { kind: "tick" });
    }
  }

  private schedule(roomId: string, requestId: string, at: number): void {
    const roomTimers = this.timers.get(roomId) ?? new Set<NodeJS.Timeout>();
    this.timers.set(roomId, roomTimers);
    const timer = setTimeout(
      () => {
        roomTimers.delete(timer);
        this.dispatch(roomId, { kind: "timeout", requestId });
      },
      Math.max(0, at - this.now()),
    );
    roomTimers.add(timer);
  }

  private end(roomId: string, reason: "host-ended" | "expired"): void {
    for (const connection of this.inRoom(roomId)) {
      connection.send({ type: "ended", reason });
      connection.roomId = null;
      connection.publicId = null;
      connection.socket.close(1000);
    }
    for (const timer of this.timers.get(roomId) ?? []) {
      clearTimeout(timer);
    }
    this.timers.delete(roomId);
    clearTimeout(this.snapshotTimers.get(roomId));
    this.snapshotTimers.delete(roomId);
    this.snapshotAt.delete(roomId);
    this.rooms.delete(roomId);
    this.roomIps.delete(roomId);
    const tally = this.tallies.get(roomId) ?? newTally(this.now(), true);
    this.tallies.delete(roomId);
    log.info("room_ended", { ...roomSummary(tally, reason, this.now()), rooms: this.rooms.size });
  }

  private ping(): void {
    const now = this.now();
    for (const connection of this.connections.values()) {
      if (now - connection.lastPongAt > this.timing.deadAfterMs) {
        log.info("ws_dead", { connection: connection.id });
        connection.socket.terminate();
      } else {
        connection.socket.ping();
      }
    }
    for (const limiter of [
      this.newConnections,
      this.failedJoins,
      this.adds,
      this.searches,
      this.newRooms,
    ]) {
      limiter.forgetIdle(now);
    }
  }

  /** `jam_stats`: what is live right now, once a minute. */
  logStats(): void {
    let hostsOnline = 0;
    let guestsOnline = 0;
    let guests = 0;
    let sharing = 0;
    let queued = 0;
    for (const room of this.rooms.values()) {
      if (room.hostLeftAt === null) {
        hostsOnline++;
      }
      for (const participant of room.participants) {
        if (participant.kind !== "host") {
          guests++;
          guestsOnline += participant.connections > 0 ? 1 : 0;
        }
      }
      sharing += room.nowPlaying.listenUrl === undefined ? 0 : 1;
      queued += room.queue.length;
    }
    const apps = { web: 0, desktop: 0, android: 0, none: 0 };
    for (const connection of this.connections.values()) {
      apps[connection.app ?? "none"]++;
    }
    const memory = process.memoryUsage();
    log.info("jam_stats", {
      rooms: this.rooms.size,
      hosts_online: hostsOnline,
      guests,
      guests_online: guestsOnline,
      rooms_sharing: sharing,
      queued,
      connections: this.connections.size,
      connections_web: apps.web,
      connections_desktop: apps.desktop,
      connections_android: apps.android,
      connections_none: apps.none,
      rss_mb: Math.round(memory.rss / 1_048_576),
      heap_mb: Math.round(memory.heapUsed / 1_048_576),
    });
  }
}

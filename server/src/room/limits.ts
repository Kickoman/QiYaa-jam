// Every number here is a row of spec/jam/limits.md, named after it.

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const RATE_WINDOW_MS = MINUTE;

export const GUEST_FRAME_BYTES = 4 * 1024;
export const HOST_FRAME_BYTES = 256 * 1024;
export const HANDSHAKE_MS = 5 * SECOND;
export const PING_INTERVAL_MS = 25 * SECOND;
export const DEAD_AFTER_MS = 60 * SECOND;
export const IP_OPEN_CONNECTIONS = 20;
export const IP_NEW_CONNECTIONS_PER_MINUTE = 30;
export const IP_FAILED_JOINS_PER_MINUTE = 10;
export const VIOLATIONS_BEFORE_BAN = 3;
export const BAN_MS = 10 * MINUTE;

export const ROOMS_PER_SERVER = 20;
export const GUESTS_PER_ROOM = 30;
export const QUEUE_LENGTH = 300;
export const DEFAULT_MAX_PENDING_PER_GUEST = 10;
export const RECENT_ITEMS = 10;
export const WAVE_SEEDS = 5;
export const KICKED_REMEMBERED = 100;
export const ROOM_WITHOUT_HOST_MS = HOUR;
export const ROOM_MAX_AGE_MS = 12 * HOUR;

export const GUEST_ADDS_PER_MINUTE = 10;
export const WEB_GUEST_SEARCHES_PER_MINUTE = 20;
export const SNAPSHOT_INTERVAL_MS = 2 * SECOND;
export const PLAYING_REPORT_MS = 10 * SECOND;

export const HOST_ANSWER_MS = 10 * SECOND;
export const SEARCH_RESULTS = 20;
export const SEARCH_CACHE_MS = 30 * MINUTE;
export const SEARCH_CACHE_TRACKS = 200;
export const OUTBOX_EVENTS = 500;

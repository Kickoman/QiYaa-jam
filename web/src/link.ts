export type JoinLink = { readonly roomId: string; readonly joinSecret: string | null };

const ROOM_PATH = /^\/j\/([0-9a-hjkmnp-tv-z]{8})$/;
const SECRET = /^[A-Za-z0-9_-]{22}$/;

export function parseJoinLink(pathname: string, hash: string): JoinLink | null {
  const roomId = ROOM_PATH.exec(pathname)?.[1];
  if (roomId === undefined) {
    return null;
  }
  const secret = hash.replace(/^#/, "");
  return { roomId, joinSecret: SECRET.test(secret) ? secret : null };
}

export function socketUrl(location: Pick<Location, "protocol" | "host">): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

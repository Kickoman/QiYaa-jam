import { randomBytes, randomInt } from "node:crypto";

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

function crockford(length: number): string {
  let text = "";
  for (let index = 0; index < length; index++) {
    text += CROCKFORD.charAt(randomInt(CROCKFORD.length));
  }
  return text;
}

function base64url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export const ids = {
  roomId: (): string => crockford(8),
  publicId: (): string => crockford(6),
  joinSecret: (): string => base64url(16),
  hostSecret: (): string => base64url(32),
  hostKey: (): string => `qjk_${base64url(32)}`,
  requestId: (): string => base64url(9),
  connectionId: (): string => base64url(9),
};

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clientMessageTypes,
  isServerMessage,
  parseClientMessage,
  serverMessageTypes,
} from "../src/protocol/validate.js";

const examples = new URL("../../spec/jam/protocol/examples/", import.meta.url).pathname;

function examplesOf(type: string): { name: string; text: string }[] {
  return readdirSync(join(examples, type))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(examples, type, name), "utf8") }));
}

describe("client messages from spec/jam/protocol/examples", () => {
  for (const type of clientMessageTypes) {
    for (const { name, text } of examplesOf(type)) {
      if (name.startsWith("invalid-")) {
        it(`${type}/${name} is refused as invalid`, () => {
          expect(parseClientMessage(text)).toMatchObject({ kind: "invalid", type });
        });
      } else {
        it(`${type}/${name} parses`, () => {
          expect(parseClientMessage(text)).toMatchObject({ kind: "message", message: { type } });
        });
      }
    }
  }
});

describe("server messages from spec/jam/protocol/examples", () => {
  for (const type of serverMessageTypes) {
    for (const { name, text } of examplesOf(type)) {
      const valid = !name.startsWith("invalid-");
      it(`${type}/${name} ${valid ? "is" : "is not"} a server message`, () => {
        expect(isServerMessage(JSON.parse(text))).toBe(valid);
      });
    }
  }
});

describe("parseClientMessage", () => {
  it("calls text that is not a JSON object malformed", () => {
    for (const text of ["", "{", "[]", "null", '"hello"', "42"]) {
      expect(parseClientMessage(text)).toEqual({ kind: "malformed" });
    }
  });

  it("calls a missing, server-side or made-up type unknown", () => {
    for (const text of [
      '{"id":"a"}',
      '{"type":"welcome","protocol":1,"serverTime":0}',
      '{"type":"dance"}',
    ]) {
      expect(parseClientMessage(text)).toEqual({ kind: "unknown-type" });
    }
  });

  it("keeps the id of an invalid request so that rejected can name it", () => {
    expect(parseClientMessage('{"type":"pin","id":"h4"}')).toEqual({
      kind: "invalid",
      type: "pin",
      id: "h4",
    });
    expect(parseClientMessage('{"type":"pin","id":"not an id!"}')).toEqual({
      kind: "invalid",
      type: "pin",
      id: null,
    });
  });

  it("ignores unknown fields", () => {
    expect(parseClientMessage('{"type":"started","itemId":"i4","extra":true}')).toMatchObject({
      kind: "message",
    });
  });
});

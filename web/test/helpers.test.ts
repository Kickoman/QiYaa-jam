import { describe, expect, it } from "vitest";
import { initialLanguage, pickLanguage, rememberLanguage, text } from "../src/i18n.js";
import { parseJoinLink, socketUrl } from "../src/link.js";
import { loadMembership, saveMembership } from "../src/storage.js";

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("language", () => {
  it("follows the browser: Russian for ru, be and uk, English otherwise", () => {
    expect(pickLanguage(null, ["ru-RU", "en"])).toBe("ru");
    expect(pickLanguage(null, ["be"])).toBe("ru");
    expect(pickLanguage(null, ["de", "en-GB"])).toBe("en");
    expect(pickLanguage(null, ["de"])).toBe("en");
  });

  it("a stored choice wins, and blocked storage is survived", () => {
    const storage = memory();
    rememberLanguage(storage, "en");
    expect(initialLanguage(storage, ["ru"])).toBe("en");
    expect(initialLanguage(blocked, ["ru"])).toBe("ru");
    rememberLanguage(blocked, "en");
  });

  it("has every text in both languages", () => {
    expect(text("ru", "online")).toBe("На связи");
    expect(text("en", "online")).toBe("Connected");
  });
});

describe("join link", () => {
  it("takes the room from the path and the secret from the fragment", () => {
    expect(parseJoinLink("/j/7k3m9q2x", "#JoinSecretJoinSecret12")).toEqual({
      roomId: "7k3m9q2x",
      joinSecret: "JoinSecretJoinSecret12",
    });
    expect(parseJoinLink("/j/7k3m9q2x", "")).toEqual({ roomId: "7k3m9q2x", joinSecret: null });
    expect(parseJoinLink("/", "#x")).toBeNull();
    expect(parseJoinLink("/j/ROOM1234", "")).toBeNull();
  });

  it("builds the socket address from the page", () => {
    expect(socketUrl({ protocol: "https:", host: "jam.example.org" })).toBe(
      "wss://jam.example.org/ws",
    );
    expect(socketUrl({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws");
  });
});

describe("membership storage", () => {
  it("keeps the participantId and name per room", () => {
    const storage = memory();
    saveMembership(storage, "7k3m9q2x", { participantId: "p1", name: "Аня" });
    expect(loadMembership(storage, "7k3m9q2x")).toEqual({ participantId: "p1", name: "Аня" });
    expect(loadMembership(storage, "zzzzzzzz")).toBeNull();
  });

  it("treats a broken entry or blocked storage as no membership", () => {
    const storage = memory();
    storage.setItem("qiyaa-jam.room.7k3m9q2x", "{not json");
    expect(loadMembership(storage, "7k3m9q2x")).toBeNull();
    expect(loadMembership(blocked, "7k3m9q2x")).toBeNull();
    saveMembership(blocked, "7k3m9q2x", { participantId: "p1", name: "Аня" });
  });
});

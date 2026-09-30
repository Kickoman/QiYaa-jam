import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { orderQueue, type OrderMode, type Orderable } from "../../src/room/ordering.js";

type OrderingCase = {
  readonly name: string;
  readonly mode: OrderMode;
  readonly items: readonly Orderable[];
  readonly lastServedAt: Readonly<Record<string, number>>;
  readonly expected: readonly string[];
};

const directory = new URL("../../../spec/jam/ordering/", import.meta.url).pathname;
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".json"))
  .sort();

describe("spec/jam/ordering", () => {
  it("has reference cases", () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
  });

  for (const file of files) {
    const orderingCase = JSON.parse(readFileSync(join(directory, file), "utf8")) as OrderingCase;
    it(`ordering/${file.replace(/\.json$/, "")}: ${orderingCase.name}`, () => {
      const lastServedAt = new Map(Object.entries(orderingCase.lastServedAt));
      const ordered = orderQueue(orderingCase.items, orderingCase.mode, lastServedAt);
      expect(ordered.map((item) => item.itemId)).toEqual(orderingCase.expected);
    });
  }
});

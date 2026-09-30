export type OrderMode = "round-robin" | "fifo";

export type Orderable = {
  readonly itemId: string;
  readonly addedBy: string;
  readonly addedAt: number;
  readonly pinnedAt: number | null;
};

export function itemNumber(itemId: string): number {
  return Number(itemId.slice(1));
}

function byAdded(left: Orderable, right: Orderable): number {
  return left.addedAt - right.addedAt || itemNumber(left.itemId) - itemNumber(right.itemId);
}

type Person<T> = { readonly person: string; readonly first: T; readonly items: T[] };

function roundRobin<T extends Orderable>(
  items: readonly T[],
  lastServedAt: ReadonlyMap<string, number>,
): T[] {
  const people = new Map<string, Person<T>>();
  for (const item of [...items].sort(byAdded)) {
    const person = people.get(item.addedBy);
    if (person) {
      person.items.push(item);
    } else {
      people.set(item.addedBy, { person: item.addedBy, first: item, items: [item] });
    }
  }
  const order = [...people.values()].sort((left, right) => {
    const leftServed = lastServedAt.get(left.person);
    const rightServed = lastServedAt.get(right.person);
    if (leftServed !== rightServed) {
      if (leftServed === undefined) {
        return -1;
      }
      if (rightServed === undefined) {
        return 1;
      }
      return leftServed - rightServed;
    }
    return byAdded(left.first, right.first);
  });
  const ordered: T[] = [];
  const rounds = Math.max(0, ...order.map((person) => person.items.length));
  for (let round = 0; round < rounds; round++) {
    for (const person of order) {
      const item = person.items[round];
      if (item) {
        ordered.push(item);
      }
    }
  }
  return ordered;
}

export function orderQueue<T extends Orderable>(
  items: readonly T[],
  mode: OrderMode,
  lastServedAt: ReadonlyMap<string, number>,
): T[] {
  const pinned = items
    .filter((item) => item.pinnedAt !== null)
    .sort(
      (left, right) =>
        (left.pinnedAt ?? 0) - (right.pinnedAt ?? 0) ||
        itemNumber(left.itemId) - itemNumber(right.itemId),
    );
  const rest = items.filter((item) => item.pinnedAt === null);
  return [
    ...pinned,
    ...(mode === "fifo" ? [...rest].sort(byAdded) : roundRobin(rest, lastServedAt)),
  ];
}

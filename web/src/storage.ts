export type Membership = { readonly participantId: string; readonly name: string };

function key(roomId: string): string {
  return `qiyaa-jam.room.${roomId}`;
}

export function loadMembership(
  storage: Pick<Storage, "getItem"> | null,
  roomId: string,
): Membership | null {
  try {
    const raw = storage?.getItem(key(roomId));
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw) as Partial<Membership>;
    return typeof data.participantId === "string" && typeof data.name === "string"
      ? { participantId: data.participantId, name: data.name }
      : null;
  } catch {
    return null; // blocked storage or a broken entry: start as a new participant
  }
}

export function saveMembership(
  storage: Pick<Storage, "setItem"> | null,
  roomId: string,
  membership: Membership,
): void {
  try {
    storage?.setItem(key(roomId), JSON.stringify(membership));
  } catch {
    // blocked storage: the guest comes back as a new participant after a reload
  }
}

export function newParticipantId(random: Pick<Crypto, "randomUUID">): string {
  return random.randomUUID();
}

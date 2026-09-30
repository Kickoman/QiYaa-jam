import type { Room } from "../../../server/src/protocol/generated/types.js";
import type { Translate } from "./translate.js";

export function People({ t, room }: { readonly t: Translate; readonly room: Room }) {
  return (
    <section class="people">
      <p class="label">{t("people")}</p>
      <ul class="people-list">
        {room.participants.map((participant) => (
          <li
            class={participant.online ? "person" : "person person-away"}
            key={participant.publicId}
          >
            <span class="dot" aria-hidden="true" />
            <span>{participant.name}</span>
            {participant.kind === "host" ? <span class="badge">{t("host")}</span> : null}
            {participant.publicId === room.you.publicId ? (
              <span class="badge">{t("you")}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

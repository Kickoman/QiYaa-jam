import type { Room } from "../../../server/src/protocol/generated/types.js";
import { Lamp, Window } from "./chrome.js";
import type { Translate } from "./translate.js";

export function People({ t, room }: { readonly t: Translate; readonly room: Room }) {
  return (
    <Window
      title={t("people")}
      class="people"
      titleExtra={<span class="title-readout">{room.participants.length}</span>}
    >
      <ul class="people-list">
        {room.participants.map((participant) => (
          <li
            class={participant.online ? "person" : "person person-away"}
            key={participant.publicId}
          >
            <span class={participant.online ? "led led-on" : "led"} aria-hidden="true" />
            <span class="person-name">{participant.name}</span>
            {participant.kind === "host" ? <Lamp on={false}>{t("host")}</Lamp> : null}
            {participant.publicId === room.you.publicId ? <Lamp on>{t("you")}</Lamp> : null}
          </li>
        ))}
      </ul>
    </Window>
  );
}

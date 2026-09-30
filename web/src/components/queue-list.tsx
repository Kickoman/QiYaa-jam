import type { Room } from "../../../server/src/protocol/generated/types.js";
import { coverUrl } from "../format.js";
import type { Translate } from "./translate.js";

type Props = {
  readonly t: Translate;
  readonly room: Room;
  readonly names: ReadonlyMap<string, string>;
  readonly onRemove: (itemId: string) => void;
};

export function QueueList({ t, room, names, onRemove }: Props) {
  const you = room.you.publicId;
  const mine = room.queue.filter((item) => item.addedBy === you).length;
  return (
    <section class="queue">
      <div class="section-head">
        <p class="label">{t("queue")}</p>
        {room.you.isHost ? null : (
          <p class="readout">
            {t("yourTracks", { count: mine, limit: room.settings.maxPendingPerGuest })}
          </p>
        )}
      </div>
      {room.queue.length === 0 ? (
        <p class="hint">{t("queueEmpty")}</p>
      ) : (
        <ol class="items">
          {room.queue.map((item) => {
            const own = item.addedBy === you;
            const cover = coverUrl(item.track.coverUri, 100);
            return (
              <li class={own ? "item item-own" : "item"} key={item.itemId}>
                {cover ? (
                  <img class="cover" src={cover} alt="" loading="lazy" />
                ) : (
                  <div class="cover" />
                )}
                <div class="item-text">
                  <p class="item-title">{item.track.title}</p>
                  <p class="item-artists">{item.track.artists.join(", ")}</p>
                  <p class="item-who">
                    {own ? t("you") : (names.get(item.addedBy) ?? "?")}
                    {item.pinned ? <span class="badge">{t("next")}</span> : null}
                  </p>
                </div>
                {own ? (
                  <button
                    class="icon"
                    type="button"
                    aria-label={t("remove")}
                    onClick={() => {
                      onRemove(item.itemId);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

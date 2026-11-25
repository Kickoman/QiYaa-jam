import type { Room } from "../../../server/src/protocol/generated/types.js";
import { formatTime, spotifyUrl } from "../format.js";
import { Icon, Lamp, Window } from "./chrome.js";
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
  const readout = room.you.isHost ? null : (
    <span class="title-readout">
      {t("yourTracks", { count: mine, limit: room.settings.maxPendingPerGuest })}
    </span>
  );
  return (
    <Window title={t("queue")} class="queue" titleExtra={readout}>
      {room.queue.length === 0 ? (
        <p class="playlist playlist-empty">{t("queueEmpty")}</p>
      ) : (
        <ol class="playlist items">
          {room.queue.map((item, index) => {
            const own = item.addedBy === you;
            return (
              <li class={own ? "row item row-own" : "row item"} key={item.itemId}>
                <div class="row-text">
                  <p class="row-line">
                    {index + 1}. <span class="item-artists">{item.track.artists.join(", ")}</span> -{" "}
                    {item.track.source === "spotify" ? (
                      <a
                        class="item-title"
                        href={spotifyUrl(item.track)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.track.title}
                      </a>
                    ) : (
                      <span class="item-title">{item.track.title}</span>
                    )}
                  </p>
                  <p class={own ? "row-meta row-mine" : "row-meta"}>
                    {own ? t("you") : (names.get(item.addedBy) ?? "?")}
                    {item.pinned ? <Lamp on>{t("next")}</Lamp> : null}
                  </p>
                </div>
                <span class="row-time">{formatTime(item.track.durationMs)}</span>
                {own ? (
                  <button
                    class="row-button remove"
                    type="button"
                    aria-label={t("remove")}
                    title={t("remove")}
                    onClick={() => {
                      onRemove(item.itemId);
                    }}
                  >
                    <Icon name="x" />
                  </button>
                ) : (
                  <span class="row-button-space" />
                )}
              </li>
            );
          })}
        </ol>
      )}
      {room.recent.length > 0 ? (
        <details class="playlist">
          <summary>{t("recentTracks")}</summary>
          <ul class="items">
            {room.recent.map(({ itemId, track }) => {
              const url = spotifyUrl(track);
              return (
                <li class="row item" key={itemId}>
                  <p class="row-line">
                    <span class="item-artists">{track.artists.join(", ")}</span> -{" "}
                    {url ? (
                      <a class="item-title" href={url} target="_blank" rel="noopener noreferrer">
                        {track.title}
                      </a>
                    ) : (
                      <span class="item-title">{track.title}</span>
                    )}
                  </p>
                  <span class="row-time">{formatTime(track.durationMs)}</span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </Window>
  );
}

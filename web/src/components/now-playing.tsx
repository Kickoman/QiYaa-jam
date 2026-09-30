import { useEffect, useState } from "preact/hooks";
import type { Room } from "../../../server/src/protocol/generated/types.js";
import { coverUrl, formatTime, positionAt } from "../format.js";
import type { Translate } from "./translate.js";

type Props = {
  readonly t: Translate;
  readonly room: Room;
  readonly names: ReadonlyMap<string, string>;
  readonly serverNow: () => number;
  readonly onSkip: (itemId: string) => void;
};

export function NowPlaying({ t, room, names, serverNow, onSkip }: Props) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(serverNow());
    }, 1_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [serverNow]);

  const playing = room.nowPlaying;
  const track = playing.track;
  if (playing.source === "idle" || !track) {
    return (
      <section class="now">
        <p class="label">{t("nowPlaying")}</p>
        <p class="hint">{t("silence")}</p>
      </section>
    );
  }
  const position = positionAt(playing, now);
  const cover = coverUrl(track.coverUri, 400);
  const who =
    playing.source === "wave"
      ? t("jamWave")
      : t("addedBy", { name: names.get(playing.addedBy ?? "") ?? "?" });
  const canSkip =
    !room.you.isHost && room.settings.guestsCanSkip && playing.source === "item" && playing.itemId;
  return (
    <section class="now">
      <p class="label">{t("nowPlaying")}</p>
      <div class="now-body">
        {cover ? (
          <img class="cover cover-large" src={cover} alt="" />
        ) : (
          <div class="cover cover-large" />
        )}
        <div class="now-text">
          <p class="track-title">{track.title}</p>
          <p class="track-artists">{track.artists.join(", ")}</p>
          <p class={playing.source === "wave" ? "who who-wave" : "who"}>{who}</p>
        </div>
      </div>
      <div
        class="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={track.durationMs}
        aria-valuenow={position}
      >
        <div
          class="progress-fill"
          style={{ width: `${(100 * position) / Math.max(1, track.durationMs)}%` }}
        />
      </div>
      <p class="readout">
        <span>{formatTime(position)}</span>
        <span>{formatTime(track.durationMs)}</span>
      </p>
      {canSkip ? (
        <button
          class="secondary"
          type="button"
          onClick={() => {
            onSkip(playing.itemId ?? "");
          }}
        >
          {t("skip")}
        </button>
      ) : null}
    </section>
  );
}

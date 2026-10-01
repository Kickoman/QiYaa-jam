import { useEffect, useState } from "preact/hooks";
import type { Room } from "../../../server/src/protocol/generated/types.js";
import { coverUrl, formatTime, positionAt } from "../format.js";
import { Icon, Lamp, Window } from "./chrome.js";
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
      <Window title={t("nowPlaying")} class="now">
        <p class="screen screen-text">{t("silence")}</p>
      </Window>
    );
  }
  const position = positionAt(playing, now);
  const cover = coverUrl(track.coverUri, 200);
  const canSkip =
    !room.you.isHost && room.settings.guestsCanSkip && playing.source === "item" && playing.itemId;
  return (
    <Window title={t("nowPlaying")} class="now">
      <div class="now-body">
        <div class="cover-frame">
          {cover ? <img class="cover" src={cover} alt="" /> : <div class="cover" />}
        </div>
        <div class="now-text">
          <p class="track-title">{track.title}</p>
          <p class="track-artists">{track.artists.join(", ")}</p>
          {playing.source === "wave" ? (
            <Lamp on>{t("jamWave")}</Lamp>
          ) : (
            <p class="who">{t("addedBy", { name: names.get(playing.addedBy ?? "") ?? "?" })}</p>
          )}
        </div>
      </div>
      <div class="screen now-time">
        <span class="digits">{formatTime(position)}</span>
        <span class="digits digits-dim">{formatTime(track.durationMs)}</span>
      </div>
      <div
        class="posbar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={track.durationMs}
        aria-valuenow={position}
      >
        <div
          class="posbar-fill"
          style={{ width: `calc(${(100 * position) / Math.max(1, track.durationMs)}% - 8px)` }}
        />
      </div>
      {canSkip ? (
        <button
          class="btn btn-wide"
          type="button"
          onClick={() => {
            onSkip(playing.itemId ?? "");
          }}
        >
          <Icon name="skip-forward" />
          {t("skip")}
        </button>
      ) : null}
    </Window>
  );
}

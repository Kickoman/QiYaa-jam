import { useState } from "preact/hooks";
import type { Room, Track } from "../../../server/src/protocol/generated/types.js";
import { addButton, waitingOfYours, type AddButton } from "../add-state.js";
import { coverUrl, formatTime } from "../format.js";
import type { AddState, Search } from "../session.js";
import type { Translate } from "./translate.js";

type Props = {
  readonly t: Translate;
  readonly reason: (reason: string) => string;
  readonly room: Room;
  readonly search: Search;
  readonly adds: ReadonlyMap<string, AddState>;
  readonly names: ReadonlyMap<string, string>;
  readonly onFind: (text: string) => boolean;
  readonly onAdd: (trackId: string) => void;
  readonly onClose: () => void;
};

function buttonLabel(t: Translate, button: AddButton): string {
  switch (button.kind) {
    case "add":
    case "failed":
      return "+";
    case "sending":
      return "…";
    case "yours":
      return t("yoursInQueue");
    case "queued-by":
      return t("inQueueFrom", { name: button.name });
    case "limit":
      return t("limitReached");
  }
}

function Result(props: {
  readonly t: Translate;
  readonly reason: (reason: string) => string;
  readonly track: Track;
  readonly button: AddButton;
  readonly onAdd: (trackId: string) => void;
}) {
  const { t, track, button } = props;
  const cover = coverUrl(track.coverUri, 100);
  const active = button.kind === "add" || button.kind === "failed";
  return (
    <li class="item">
      {cover ? <img class="cover" src={cover} alt="" loading="lazy" /> : <div class="cover" />}
      <div class="item-text">
        <p class="item-title">{track.title}</p>
        <p class="item-artists">
          {track.artists.join(", ")} · {formatTime(track.durationMs)}
        </p>
        {button.kind === "failed" ? (
          <p class="item-who item-error">{props.reason(button.reason)}</p>
        ) : null}
        {button.kind === "queued-by" || button.kind === "yours" || button.kind === "limit" ? (
          <p class="item-who">{buttonLabel(t, button)}</p>
        ) : null}
      </div>
      {active || button.kind === "sending" ? (
        <button
          class="add"
          type="button"
          aria-label={t("add")}
          disabled={!active}
          onClick={() => {
            props.onAdd(track.id);
          }}
        >
          {buttonLabel(t, button)}
        </button>
      ) : null}
    </li>
  );
}

export function SearchPanel(props: Props) {
  const { t, room, search } = props;
  const [text, setText] = useState("");
  const offline = !room.hostOnline;
  const limitHit = !room.you.isHost && waitingOfYours(room) >= room.settings.maxPendingPerGuest;
  return (
    <section class="search">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          props.onFind(text);
        }}
      >
        <label class="label" for="search">
          {t("searchLabel")}
        </label>
        <input
          id="search"
          class="input"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellcheck={false}
          maxLength={100}
          value={text}
          disabled={offline}
          placeholder={t("searchPlaceholder")}
          onInput={(event) => {
            setText(event.currentTarget.value);
          }}
        />
        <p class="hint">{offline ? t("searchOffline") : t("searchHint")}</p>
      </form>
      {limitHit ? (
        <p class="hint">{t("limitHint", { limit: room.settings.maxPendingPerGuest })}</p>
      ) : null}
      {search.kind === "searching" ? <p class="hint">{t("searching")}</p> : null}
      {search.kind === "failed" ? (
        <p class="hint item-error">{props.reason(search.reason)}</p>
      ) : null}
      {search.kind === "results" ? (
        <>
          <div class="section-head">
            <p class="readout">«{search.text}»</p>
            <button class="link" type="button" onClick={props.onClose}>
              {t("closeResults")}
            </button>
          </div>
          {search.tracks.length === 0 ? (
            <p class="hint">{t("nothingFound")}</p>
          ) : (
            <ol class="items">
              {search.tracks.map((track) => (
                <Result
                  key={track.id}
                  t={t}
                  reason={props.reason}
                  track={track}
                  button={addButton(track, room, props.adds, props.names)}
                  onAdd={props.onAdd}
                />
              ))}
            </ol>
          )}
        </>
      ) : null}
    </section>
  );
}

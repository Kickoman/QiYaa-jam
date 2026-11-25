import { useEffect, useState } from "preact/hooks";
import type { Room, Track } from "../../../server/src/protocol/generated/types.js";
import { addButton, waitingOfYours, type AddButton } from "../add-state.js";
import { formatTime, spotifyUrl } from "../format.js";
import type { AddState, CatalogSource, Search } from "../session.js";
import { Icon, TitleButton, Window } from "./chrome.js";
import type { Translate } from "./translate.js";

type Props = {
  readonly t: Translate;
  readonly reason: (reason: string) => string;
  readonly room: Room;
  readonly search: Search;
  readonly adds: ReadonlyMap<string, AddState>;
  readonly names: ReadonlyMap<string, string>;
  readonly onFind: (text: string, source: CatalogSource) => boolean;
  readonly onAdd: (trackId: string, source?: CatalogSource) => void;
  readonly onClose: () => void;
};

function stateLine(t: Translate, reason: (reason: string) => string, button: AddButton) {
  switch (button.kind) {
    case "failed":
      return <p class="row-meta row-error">{reason(button.reason)}</p>;
    case "yours":
      return <p class="row-meta row-mine">{t("yoursInQueue")}</p>;
    case "queued-by":
      return <p class="row-meta">{t("inQueueFrom", { name: button.name })}</p>;
    case "limit":
      return <p class="row-meta">{t("limitReached")}</p>;
    case "add":
    case "sending":
      return null;
  }
}

function Result(props: {
  readonly t: Translate;
  readonly reason: (reason: string) => string;
  readonly number: number;
  readonly track: Track;
  readonly button: AddButton;
  readonly onAdd: (trackId: string, source?: CatalogSource) => void;
}) {
  const { t, track, button } = props;
  const active = button.kind === "add" || button.kind === "failed";
  return (
    <li class="row item">
      <div class="row-text">
        <p class="row-line">
          {props.number}. <span class="item-artists">{track.artists.join(", ")}</span> -{" "}
          {track.source === "spotify" ? (
            <a
              class="item-title"
              href={spotifyUrl(track)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {track.title}
            </a>
          ) : (
            <span class="item-title">{track.title}</span>
          )}
        </p>
        {stateLine(t, props.reason, button)}
      </div>
      <span class="row-time">{formatTime(track.durationMs)}</span>
      {active || button.kind === "sending" ? (
        <button
          class="row-button add"
          type="button"
          aria-label={t("add")}
          title={t("add")}
          disabled={!active}
          onClick={() => {
            props.onAdd(track.id, track.source === "spotify" ? "spotify" : "yandex");
          }}
        >
          {active ? <Icon name="plus" /> : "…"}
        </button>
      ) : (
        <span class="row-button-space" />
      )}
    </li>
  );
}

export function SearchPanel(props: Props) {
  const { t, room, search } = props;
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (search.kind === "searching") {
      setCollapsed(false);
    }
  }, [search.kind]);
  const sources = room.searchSources ?? ["yandex"];
  const [preferred, setPreferred] = useState<CatalogSource>("yandex");
  const source = sources.includes(preferred) ? preferred : sources[0];
  useEffect(() => {
    props.onClose();
  }, [source]);
  const offline = !room.hostOnline;
  const limitHit = waitingOfYours(room) >= room.settings.maxPendingPerGuest;
  const results = search.kind === "results" ? search : null;
  const buttons = results ? (
    <>
      <TitleButton
        icon={collapsed ? "chevron-down" : "chevron-up"}
        label={t(collapsed ? "expand" : "collapse")}
        expanded={!collapsed}
        onClick={() => {
          setCollapsed(!collapsed);
        }}
      />
      <TitleButton icon="x" label={t("closeResults")} onClick={props.onClose} />
    </>
  ) : null;
  return (
    <Window title={t("searchTitle")} class="search" stickyTitle buttons={buttons}>
      <form
        role="search"
        class="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (source) {
            props.onFind(text, source);
          }
        }}
      >
        <label class="field-label" for="search">
          {t("searchLabel")}
        </label>
        {sources.length > 1 ? (
          <fieldset class="search-sources" aria-label={t("searchSource")}>
            {sources.map((catalog) => (
              <label class="search-source" key={catalog}>
                <input
                  type="radio"
                  name="search-source"
                  value={catalog}
                  checked={source === catalog}
                  onChange={() => {
                    setPreferred(catalog);
                  }}
                />
                {catalog === "yandex" ? "Yandex Music" : "Spotify"}
              </label>
            ))}
          </fieldset>
        ) : null}
        <div class="search-row">
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
            disabled={offline || !source}
            placeholder={t("searchPlaceholder")}
            onInput={(event) => {
              setText(event.currentTarget.value);
            }}
          />
          <button
            class="btn btn-primary find"
            type="submit"
            disabled={offline || !source || text.trim().length === 0}
          >
            <Icon name="search" />
            {t("searchButton")}
          </button>
        </div>
      </form>
      {offline ? <p class="note">{t("searchOffline")}</p> : null}
      {limitHit ? (
        <p class="note">{t("limitHint", { limit: room.settings.maxPendingPerGuest })}</p>
      ) : null}
      {search.kind === "searching" ? <p class="screen screen-text">{t("searching")}</p> : null}
      {search.kind === "failed" ? (
        <p class="note note-error">{props.reason(search.reason)}</p>
      ) : null}
      {results ? (
        <>
          <button
            class="results-head"
            type="button"
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed(!collapsed);
            }}
          >
            <Icon name={collapsed ? "chevron-down" : "chevron-up"} size={12} />
            <span class="results-text">{t("results", { text: results.text })}</span>
            <span class="results-count">{results.tracks.length}</span>
          </button>
          {collapsed ? null : results.tracks.length === 0 ? (
            <p class="playlist playlist-empty">{t("nothingFound")}</p>
          ) : (
            <ol class="playlist items">
              {results.tracks.map((track, index) => (
                <Result
                  key={track.id}
                  t={t}
                  reason={props.reason}
                  number={index + 1}
                  track={track}
                  button={addButton(track, room, props.adds, props.names)}
                  onAdd={props.onAdd}
                />
              ))}
            </ol>
          )}
        </>
      ) : null}
    </Window>
  );
}

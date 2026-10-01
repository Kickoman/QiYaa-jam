import { useState } from "preact/hooks";
import { Window } from "./chrome.js";
import type { Translate } from "./translate.js";

type Props = {
  readonly t: Translate;
  readonly initialName: string;
  readonly onJoin: (name: string) => boolean;
};

export function JoinForm({ t, initialName, onJoin }: Props) {
  const [name, setName] = useState(initialName);
  const ready = name.trim().length > 0;
  return (
    <Window title={t("joinTitle")} class="join">
      <form
        class="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onJoin(name);
        }}
      >
        <p class="text">{t("invited")}</p>
        <label class="field">
          <span class="field-label">{t("namePrompt")}</span>
          <input
            id="name"
            class="input"
            value={name}
            maxLength={24}
            autoComplete="nickname"
            autoFocus
            placeholder={t("namePlaceholder")}
            onInput={(event) => {
              setName(event.currentTarget.value);
            }}
          />
        </label>
        <button class="btn btn-primary btn-wide" type="submit" disabled={!ready}>
          {t("join")}
        </button>
      </form>
    </Window>
  );
}

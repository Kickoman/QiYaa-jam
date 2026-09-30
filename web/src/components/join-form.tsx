import { useState } from "preact/hooks";
import type { TextKey } from "../i18n.js";

type Props = {
  readonly t: (key: TextKey) => string;
  readonly initialName: string;
  readonly onJoin: (name: string) => boolean;
};

export function JoinForm({ t, initialName, onJoin }: Props) {
  const [name, setName] = useState(initialName);
  const ready = name.trim().length > 0;
  return (
    <form
      class="join"
      onSubmit={(event) => {
        event.preventDefault();
        onJoin(name);
      }}
    >
      <h1 class="title">{t("invited")}</h1>
      <label class="label" for="name">
        {t("namePrompt")}
      </label>
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
      <button class="primary" type="submit" disabled={!ready}>
        {t("join")}
      </button>
    </form>
  );
}

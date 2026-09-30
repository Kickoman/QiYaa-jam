import type { TextKey } from "../i18n.js";

export type Translate = (
  key: TextKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

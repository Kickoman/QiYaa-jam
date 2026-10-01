import type { ComponentChildren } from "preact";

// Lucide icons (ISC, lucide.dev): the paths the QiYaa design system's Icon carries.
const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "skip-forward": '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 14 }: { readonly name: IconName; readonly size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

/** A title-bar button: options, shade, close. The tap target is larger than the drawn key. */
export function TitleButton(props: {
  readonly icon: IconName;
  readonly label: string;
  readonly onClick: () => void;
  readonly expanded?: boolean;
}) {
  return (
    <button
      class="title-button"
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-expanded={props.expanded}
      onClick={props.onClick}
    >
      <Icon name={props.icon} size={10} />
    </button>
  );
}

/** A skinned window: a ridged title bar with a gold pixel title, and a brushed body. */
export function Window(props: {
  readonly title: string;
  readonly class?: string;
  readonly stickyTitle?: boolean;
  readonly titleExtra?: ComponentChildren;
  readonly buttons?: ComponentChildren;
  readonly children?: ComponentChildren;
}) {
  return (
    <section class={`window ${props.class ?? ""}`} aria-label={props.title}>
      <div class={props.stickyTitle ? "title-bar title-bar-sticky" : "title-bar"}>
        <span class="ridge" aria-hidden="true" />
        <h2 class="window-title">{props.title}</h2>
        {props.titleExtra}
        <span class="ridge" aria-hidden="true" />
        {props.buttons}
      </div>
      {props.children === undefined ? null : <div class="window-body">{props.children}</div>}
    </section>
  );
}

/** An engraved label that lights up: online, host, you, next. */
export function Lamp({
  on,
  children,
}: {
  readonly on: boolean;
  readonly children: ComponentChildren;
}) {
  return <span class={on ? "lamp lamp-on" : "lamp"}>{children}</span>;
}

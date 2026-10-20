export interface BindKeyOptions {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  /** Fire even with a field focused, or a control that answers the key itself. */
  allowWhileTyping?: boolean;
  /** Keep firing while the key is held. */
  repeat?: boolean;
  /** Where to listen. Defaults to `window`. */
  target?: EventTarget;
  preventDefault?: boolean;
}

/** `code` is a KeyboardEvent.code such as "KeyR". Returns a function that unbinds. */
export function bindKey(
  code: string,
  fn: (event: KeyboardEvent) => void,
  options?: BindKeyOptions
): () => void;

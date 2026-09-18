import { useCallback, useRef } from "react";
import { normalize } from "./text";

/**
 * Type-ahead search (APG listbox/menu): accumulates printable keys for 500 ms and returns the index of the
 * first label (after `from`, wrapping) that starts with the buffer; -1 when nothing matches or the key is not printable.
 */
export function useTypeahead(): (key: string, labels: string[], from: number, isDisabled?: (index: number) => boolean) => number {
  const buffer = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return useCallback((key, labels, from, isDisabled) => {
    if (key.length !== 1 || !/\S/.test(key)) return -1;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { buffer.current = ""; }, 500);
    const repeated = buffer.current.length > 0 && buffer.current.split("").every(char => char === key.toLowerCase());
    buffer.current += key.toLowerCase();
    const query = normalize(repeated ? key : buffer.current);
    const count = labels.length;
    const start = repeated || buffer.current.length === 1 ? from + 1 : from;
    for (let step = 0; step < count; step += 1) {
      const index = (((start + step) % count) + count) % count;
      if (isDisabled?.(index)) continue;
      if (normalize(labels[index]).startsWith(query)) return index;
    }
    return -1;
  }, []);
}

/** Next enabled index from `from` moving by `delta` (wraps when `loop`). Returns `from` when none. */
export function nextEnabled(count: number, from: number, delta: number, isDisabled: (index: number) => boolean, loop = true): number {
  if (!count) return -1;
  let index = from;
  for (let step = 0; step < count; step += 1) {
    index += delta;
    if (index < 0 || index >= count) {
      if (!loop) return from;
      index = (index + count) % count;
    }
    if (!isDisabled(index)) return index;
  }
  return from;
}

/** First (delta=1) or last (delta=-1) enabled index. */
export function edgeEnabled(count: number, delta: 1 | -1, isDisabled: (index: number) => boolean): number {
  const start = delta === 1 ? -1 : count;
  const found = nextEnabled(count, start, delta, isDisabled, false);
  return found === start ? -1 : found;
}

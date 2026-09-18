import { useCallback } from "react";
import { formatMoney, hiddenMoney, type FormatMoneyOptions } from "../lib/money";
import { useHideValues } from "./usePreferences";

/**
 * `format(minor, currency?, options?)` for money inside text (hints, labels, chart axes) that honors privacy mode:
 * returns "R$ •••••" while `hide_values` is on. Prefer the `Money` component for standalone values.
 */
export function useMoneyFormat(): (minor: number, currency?: string, options?: FormatMoneyOptions) => string {
  const hidden = useHideValues();
  return useCallback((minor: number, currency?: string, options?: FormatMoneyOptions) =>
    hidden ? hiddenMoney(currency) : formatMoney(minor, currency, options), [hidden]);
}

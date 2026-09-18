import type { ReactNode } from "react";

/** One choice of Select/Combobox. `icon` is a node (e.g. <CategoryIcon/>, <BankLogo/>, <CurrencyIcon/>). */
export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
  /** Extra search terms (Combobox filtering). */
  keywords?: string[];
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

/** Options, groups, or a mix (ungrouped options keep their position). */
export type OptionsInput = ReadonlyArray<SelectOption | SelectOptionGroup>;

export interface FlatOption {
  option: SelectOption;
  group?: string;
}

function isGroup(entry: SelectOption | SelectOptionGroup): entry is SelectOptionGroup {
  return Array.isArray((entry as SelectOptionGroup).options);
}

export function flattenOptions(input: OptionsInput): FlatOption[] {
  return input.flatMap(entry => isGroup(entry) ? entry.options.map(option => ({ option, group: entry.label })) : [{ option: entry }]);
}

/** DOM id of an option (aria-activedescendant target). */
export const optionId = (listId: string, index: number): string => `${listId}-opt-${index}`;

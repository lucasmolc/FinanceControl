import { Pencil, Trash2 } from "lucide-react";
import type { MenuActionItem, MenuEntry } from "../Menu";

export interface RecordMenuOptions {
  onEdit?: () => void;
  onRemove?: () => void;
  /** Disables edit/remove with this reason (e.g. "Mês fechado", MEL-22). */
  disabledReason?: string;
  /** Record-specific actions listed first (e.g. "Pagar", "Lançar cobrança"). */
  before?: Array<MenuActionItem | false | null | undefined>;
}

/** Menu entries for a record row: specific actions, then Editar, then Remover (danger) after a separator. */
export function recordMenuItems({ onEdit, onRemove, disabledReason, before = [] }: RecordMenuOptions): MenuEntry[] {
  const items: MenuEntry[] = before.filter((item): item is MenuActionItem => Boolean(item));
  const locked = Boolean(disabledReason);
  if (onEdit) items.push({ label: "Editar", icon: Pencil, onSelect: onEdit, disabled: locked, disabledReason });
  if (onRemove) {
    if (items.length) items.push({ type: "separator" });
    items.push({ label: "Remover", icon: Trash2, tone: "danger", onSelect: onRemove, disabled: locked, disabledReason });
  }
  return items;
}

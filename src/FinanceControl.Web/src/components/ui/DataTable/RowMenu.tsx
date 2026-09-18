import { DropdownMenu, type MenuEntry } from "../Menu";

export interface RowMenuProps {
  /** Record name: the trigger reads "Mais ações para <label>". */
  label: string;
  items: MenuEntry[];
  /** While a removal is in flight the menu gives way to "Removendo…" (MEL-07). */
  removing?: boolean;
  /** Status shown instead of the menu while an action on the row runs (e.g. "Estornando…"). */
  busyLabel?: string | null;
  disabled?: boolean;
}

/** "…" row actions (CR-08/CR-20): one quiet trigger per row instead of repeated buttons; destructive items last. */
export function RowMenu({ label, items, removing = false, busyLabel, disabled = false }: RowMenuProps) {
  if (removing || busyLabel) return <span className="row-actions"><span className="removing-status muted" role="status">{busyLabel || "Removendo…"}</span></span>;
  return <DropdownMenu label={`Mais ações para ${label}`} items={items} disabled={disabled} />;
}

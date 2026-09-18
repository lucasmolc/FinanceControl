import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { dialogHost } from "../../dialogHost";
import { cx } from "../shared/cx";
import { renderIcon, type IconProp } from "../shared/icon";
import { useModalLayer } from "../shared/useModalLayer";
import { rankCommands } from "./rankCommands";

export interface Command {
  id: string;
  label: string;
  /** Group heading ("Ir para", "Criar", "Registros"…). */
  group?: string;
  icon?: IconProp;
  description?: string;
  /** Display-only key hint, e.g. ["G", "L"] or ["Ctrl", "N"]. */
  shortcut?: string[];
  /** Extra search terms. */
  keywords?: string[];
  /** Score multiplier while searching (e.g. 1.25 so the core action wins ties); default 1. */
  rank?: number;
  disabled?: boolean;
  /** Runs without closing the palette (e.g. "Mostrar todos"). */
  keepOpen?: boolean;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
  /** Accessible dialog name. */
  label?: string;
  /** Called on every keystroke (e.g. to search records and feed more commands). */
  onQueryChange?: (query: string) => void;
  /** Empty-state text; receives the query. */
  emptyMessage?: (query: string) => ReactNode;
  /** Max results rendered (default 60). */
  limit?: number;
  /** Max results per group while there is a query (e.g. `{ "Ir para": 3 }`, CR-17). */
  groupLimits?: Record<string, number>;
  /** R2-CMD-1: without a query, each group shows at most this many items plus "Mostrar todos (N)". */
  emptyQueryGroupLimit?: number;
  /** R2-CMD-2: commands offered when a query matches nothing (e.g. create a record with the query as its name). */
  fallback?: (query: string) => Command[];
}

/** Caps every group at `limit` items and adds a "Mostrar todos (N)" row that expands it (no query only). */
function capGroups(commands: Command[], limit: number, expanded: ReadonlySet<string>, expand: (group: string) => void): Command[] {
  const totals = new Map<string, number>();
  commands.forEach(command => totals.set(command.group ?? "", (totals.get(command.group ?? "") ?? 0) + 1));
  const seen = new Map<string, number>();
  const result: Command[] = [];
  commands.forEach(command => {
    const group = command.group ?? "";
    const count = (seen.get(group) ?? 0) + 1;
    seen.set(group, count);
    const total = totals.get(group) ?? 0;
    if (expanded.has(group) || total <= limit + 1 || count <= limit) result.push(command);
    if (!expanded.has(group) && total > limit + 1 && count === total) {
      result.push({ id: `__more:${group}`, label: `Mostrar todos (${total})`, group: command.group, keepOpen: true, run: () => expand(group) });
    }
  });
  return result;
}

/**
 * Ctrl/Cmd+K command palette (MEL-42): modal dialog with a search combobox and a grouped listbox of commands
 * (ranked filter — rankCommands.ts —, ↑/↓/Home/End, Enter runs, Esc closes). Commands are passed in; the app wires navigation/actions.
 * Pair with `useCommandPaletteHotkey`.
 */
export function CommandPalette({ open, onClose, commands, placeholder = "Buscar páginas, ações e registros…", label = "Paleta de comandos", onQueryChange, emptyMessage = query => <>Nada encontrado para “{query}”.</>, limit = 60, groupLimits, emptyQueryGroupLimit, fallback }: CommandPaletteProps) {
  const [host] = useState(() => (typeof document === "undefined" ? null : dialogHost()));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  useModalLayer(open, layerRef, panelRef, onClose, { initialFocus: () => inputRef.current });

  useEffect(() => { if (!open) { setQuery(""); setActive(0); setExpanded(new Set()); } }, [open]);

  const { results, noMatch } = useMemo(() => {
    const trimmed = query.trim();
    const ranked = rankCommands(commands, query, groupLimits);
    if (!trimmed && emptyQueryGroupLimit) {
      return { results: capGroups(ranked, emptyQueryGroupLimit, expanded, group => setExpanded(current => new Set(current).add(group))).slice(0, limit), noMatch: false };
    }
    if (trimmed && !ranked.length) return { results: fallback?.(trimmed) ?? [], noMatch: true };
    return { results: ranked.slice(0, limit), noMatch: false };
  }, [commands, query, limit, groupLimits, emptyQueryGroupLimit, expanded, fallback]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, listId]);

  if (!open || !host) return null;

  const enabledIndexes = results.map((command, index) => (command.disabled ? -1 : index)).filter(index => index >= 0);
  const execute = (index: number) => {
    const command = results[index];
    if (!command || command.disabled) return;
    if (command.keepOpen) { command.run(); inputRef.current?.focus(); return; }
    onClose();
    command.run();
  };
  const move = (delta: number) => {
    if (!enabledIndexes.length) return;
    const position = enabledIndexes.indexOf(active);
    setActive(enabledIndexes[(position + delta + enabledIndexes.length) % enabledIndexes.length]!);
  };
  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); move(1); break;
      case "ArrowUp": event.preventDefault(); move(-1); break;
      case "Home": if (event.ctrlKey) { event.preventDefault(); setActive(enabledIndexes[0] ?? 0); } break;
      case "End": if (event.ctrlKey) { event.preventDefault(); setActive(enabledIndexes[enabledIndexes.length - 1] ?? 0); } break;
      case "Enter": event.preventDefault(); execute(active); break;
    }
  };

  let lastGroup: string | undefined;
  return createPortal(<div ref={layerRef} className="ui-command-layer" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} className="ui-command" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
      <div className="ui-command-search">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          aria-label={label}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={event => { setQuery(event.target.value); setActive(0); onQueryChange?.(event.target.value); }}
          onKeyDown={handleKey}
        />
        <kbd className="ui-kbd" aria-hidden="true">Esc</kbd>
      </div>
      <div id={listId} role="listbox" aria-label="Resultados" className="ui-command-list">
        {(noMatch || !results.length) && <p className="ui-listbox-empty" role="presentation">{emptyMessage(query)}</p>}
        {results.map((command, index) => {
          const heading = command.group && command.group !== lastGroup ? command.group : undefined;
          lastGroup = command.group;
          return <div key={command.id} role="presentation">
            {heading && <div role="presentation" className="ui-listbox-group-label">{heading}</div>}
            <div id={`${listId}-${index}`} role="option" aria-selected={index === active} aria-disabled={command.disabled || undefined} aria-keyshortcuts={command.shortcut?.join("+")}
              className={cx("ui-option ui-command-item", index === active && "is-active", command.disabled && "is-disabled")}
              onMouseDown={event => event.preventDefault()} onMouseMove={() => { if (!command.disabled && index !== active) setActive(index); }} onClick={() => execute(index)}>
              {command.icon && <span className="ui-option-icon" aria-hidden="true">{renderIcon(command.icon, 16)}</span>}
              <span className="ui-option-text">
                <span className="ui-option-label">{command.label}</span>
                {command.description && <span className="ui-option-description">{command.description}</span>}
              </span>
              {command.shortcut && <span className="ui-command-shortcut" aria-hidden="true">{command.shortcut.map(key => <kbd key={key} className="ui-kbd">{key}</kbd>)}</span>}
            </div>
          </div>;
        })}
      </div>
      <div className="ui-command-footer muted" aria-hidden="true"><span><kbd className="ui-kbd">↑</kbd><kbd className="ui-kbd">↓</kbd> navegar</span><span><kbd className="ui-kbd">Enter</kbd> abrir</span><span><kbd className="ui-kbd">Esc</kbd> fechar</span></div>
    </div>
  </div>, host.isConnected ? host : dialogHost());
}

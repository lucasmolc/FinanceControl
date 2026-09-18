import { useId, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, EyeOff, GripVertical } from "lucide-react";
import { Skeleton } from "../../components/ui/Skeleton";
import type { DashboardWidgetId } from "../../lib/preferences";
import { dragProps, type WidgetEditing } from "./widgetDrag";
import { widgetLabel, widgetSpan } from "./widgetModel";


export interface WidgetFrameProps {
  id: DashboardWidgetId;
  title?: string;
  description?: ReactNode;
  /** Right side of the header (total, badge…). */
  aside?: ReactNode;
  footer?: ReactNode;
  /** Data of another month is on screen while the selected one loads (crossfade). */
  switching?: boolean;
  /** First load: skeleton instead of the body. */
  loading?: boolean;
  editing?: WidgetEditing | null;
  className?: string;
  children?: ReactNode;
}

/** Edit controls: drag handle (arrows move it), move up/down and hide. */
export function WidgetEditControls({ id, title, editing }: { id: DashboardWidgetId; title: string; editing: WidgetEditing }) {
  const hintId = useId();
  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    editing.move(id, delta);
  };
  return <div className="widget-actions">
    <span id={hintId} className="sr-only">Posição {editing.index + 1} de {editing.count}. Use as setas para mover.</span>
    <button type="button" className="icon-btn widget-handle" aria-label={`Reordenar ${title}`} aria-describedby={hintId} title="Arraste ou use as setas" onKeyDown={onKey}><GripVertical size={16} aria-hidden="true" /></button>
    <button type="button" className="icon-btn" aria-label={`Mover ${title} para cima`} disabled={editing.index === 0} onClick={() => editing.move(id, -1)}><ChevronUp size={16} aria-hidden="true" /></button>
    <button type="button" className="icon-btn" aria-label={`Mover ${title} para baixo`} disabled={editing.index === editing.count - 1} onClick={() => editing.move(id, 1)}><ChevronDown size={16} aria-hidden="true" /></button>
    <button type="button" className="icon-btn" aria-label={`Ocultar ${title}`} title="Ocultar do painel" onClick={() => editing.hide(id)}><EyeOff size={16} aria-hidden="true" /></button>
  </div>;
}

/** `.widget.card` shell (DESIGN.md › Widgets): header, body (skeleton on first load), optional footer. */
export function WidgetFrame({ id, title = widgetLabel(id), description, aside, footer, switching = false, loading = false, editing, className, children }: WidgetFrameProps) {
  const titleId = useId();
  const span = widgetSpan[id];
  const classes = ["widget card", span === "full" ? "span-full" : span === "2" ? "span-2" : "", switching ? "is-switching" : "",
    editing?.dragging === id ? "is-dragging" : "", editing?.dropTarget === id && editing.dragging !== id ? "is-drop-target" : "", editing ? "is-editing" : "", className ?? ""].filter(Boolean).join(" ");
  return <section className={classes} aria-labelledby={titleId} aria-busy={switching || loading || undefined} data-widget={id} {...dragProps(id, editing)}>
    <div className="card-header">
      <div><h2 id={titleId}>{title}</h2>{description && <p className="muted">{description}</p>}</div>
      {aside}
      {editing && <WidgetEditControls id={id} title={title} editing={editing} />}
    </div>
    <div className="widget-body">
      {loading ? <Skeleton variant="rect" height={180} label={`Carregando ${title.toLowerCase()}…`} className="skeleton-chart-wrap" /> : children}
    </div>
    {footer && !loading && <div className="widget-footer">{footer}</div>}
  </section>;
}

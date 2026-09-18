import type { DragEvent } from "react";
import type { DashboardWidgetId } from "../../lib/preferences";

/** Edit-mode handlers shared by every widget (reorder by keyboard, buttons or drag and drop; hide). */
export interface WidgetEditing {
  index: number;
  count: number;
  move: (id: DashboardWidgetId, delta: number) => void;
  hide: (id: DashboardWidgetId) => void;
  dragging: DashboardWidgetId | null;
  dropTarget: DashboardWidgetId | null;
  onDragStart: (id: DashboardWidgetId) => void;
  onDragEnter: (id: DashboardWidgetId) => void;
  onDrop: (id: DashboardWidgetId) => void;
  onDragEnd: () => void;
}

/** Drag-and-drop props for a widget container in edit mode. */
export function dragProps(id: DashboardWidgetId, editing: WidgetEditing | null | undefined) {
  if (!editing) return {};
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => { event.dataTransfer?.setData("text/plain", id); editing.onDragStart(id); },
    onDragEnter: () => editing.onDragEnter(id),
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDrop: (event: DragEvent) => { event.preventDefault(); editing.onDrop(id); },
    onDragEnd: () => editing.onDragEnd(),
  };
}


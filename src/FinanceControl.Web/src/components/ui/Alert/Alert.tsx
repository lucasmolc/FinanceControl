import { forwardRef, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Action buttons shown under the text. */
  action?: ReactNode;
  /** Shows a close button ("Fechar aviso"). */
  onDismiss?: () => void;
  /** Live-region role; defaults to "alert" for danger and "status" otherwise. Pass "none" for static notes. */
  role?: "alert" | "status" | "none";
  size?: Size;
  className?: string;
}

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

/** Inline message (never color alone: icon + title/text). */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert({ tone = "info", title, children, action, onDismiss, role, size = "md", className }, ref) {
  const Icon = ICONS[tone];
  const resolvedRole = role ?? (tone === "danger" ? "alert" : "status");
  return <div ref={ref} className={cx("ui-alert", `tone-${tone}`, sizeClass(size), className)} role={resolvedRole === "none" ? undefined : resolvedRole}>
    <Icon className="ui-alert-icon" size={18} aria-hidden="true" />
    <div className="ui-alert-body">
      {title && <p className="ui-alert-title">{title}</p>}
      {children && <div className="ui-alert-text">{children}</div>}
      {action && <div className="ui-alert-actions">{action}</div>}
    </div>
    {onDismiss && <button type="button" className="icon-btn ui-alert-close" aria-label="Fechar aviso" onClick={onDismiss}><X size={16} aria-hidden="true" /></button>}
  </div>;
});

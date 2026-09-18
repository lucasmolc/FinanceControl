import { forwardRef, useId, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../shared/cx";

export type CardVariant = "default" | "kpi" | "list" | "chart" | "credit" | "outline" | "ghost";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  variant?: CardVariant;
  title?: ReactNode;
  description?: ReactNode;
  /** Header actions (buttons, menus). */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Heading level of the title (default 2). */
  headingLevel?: 2 | 3 | 4;
  /** Accent edge tone. */
  tone?: "neutral" | "positive" | "negative" | "warning" | "accent";
  /** Credit variant: card color ("#rrggbb"). */
  color?: string;
  /** Renders as <section> (landmark with the title as name) instead of <div>. */
  as?: "div" | "section" | "article";
  padding?: "none" | "sm" | "md" | "lg";
  /** Hover/focus affordance for clickable cards (the click target must still be a button/link inside). */
  interactive?: boolean;
}

/** Surface card (MEL-42) on the legacy `.card` look; variants KPI, list, chart, credit card, outline and ghost. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card({ variant = "default", title, description, actions, footer, headingLevel = 2, tone, color, as = "div", padding = "md", interactive = false, className, children, style, ...rest }, ref) {
  const titleId = useId();
  const Tag = as;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const cardStyle = color ? { ...style, "--card-color": color } as CSSProperties : style;
  return <Tag
    ref={ref as never}
    className={cx(variant === "ghost" ? "ui-card" : "card ui-card", `variant-${variant}`, variant === "credit" && "visual-card", tone && `tone-${tone}`, padding !== "md" && `padding-${padding}`, interactive && "is-interactive", className)}
    aria-labelledby={as !== "div" && title ? titleId : undefined}
    style={cardStyle}
    {...rest}
  >
    {(title || actions) && <div className="card-header ui-card-header">
      <div>
        {title && <Heading id={titleId} className="ui-card-title">{title}</Heading>}
        {description && <p className="muted ui-card-description">{description}</p>}
      </div>
      {actions && <div className="ui-card-actions">{actions}</div>}
    </div>}
    {children}
    {footer && <div className="card-actions ui-card-footer">{footer}</div>}
  </Tag>;
});

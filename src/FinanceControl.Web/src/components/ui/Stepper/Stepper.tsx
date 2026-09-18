import { forwardRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";

export interface StepperStep {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  optional?: boolean;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step (0-based). */
  current: number;
  /** Makes completed steps (and the current one) clickable to go back. */
  onStepClick?: (index: number) => void;
  orientation?: "horizontal" | "vertical";
  size?: Size;
  "aria-label"?: string;
  className?: string;
}

/** Progress through steps (setup wizard): ordered list, `aria-current="step"`, status text for each step. */
export const Stepper = forwardRef<HTMLOListElement, StepperProps>(function Stepper({ steps, current, onStepClick, orientation = "horizontal", size = "md", className, ...aria }, ref) {
  return <ol ref={ref} className={cx("ui-stepper", `orientation-${orientation}`, sizeClass(size), className)} aria-label={aria["aria-label"] ?? "Etapas"}>
    {steps.map((step, index) => {
      const status = index < current ? "complete" : index === current ? "current" : "upcoming";
      const statusText = status === "complete" ? "concluída" : status === "current" ? "etapa atual" : "pendente";
      const marker = <span className="ui-step-marker" aria-hidden="true">{status === "complete" ? <Check size={14} strokeWidth={3} /> : index + 1}</span>;
      const text = <span className="ui-step-text">
        <span className="ui-step-label">{step.label}{step.optional && <span className="muted"> (opcional)</span>}</span>
        {step.description && <span className="ui-step-description">{step.description}</span>}
        <span className="sr-only">, {statusText}</span>
      </span>;
      const clickable = onStepClick && index <= current;
      return <li key={step.id} className={cx("ui-step", `is-${status}`)} aria-current={status === "current" ? "step" : undefined}>
        {clickable ? <button type="button" className="ui-step-button" onClick={() => onStepClick(index)}>{marker}{text}</button> : <span className="ui-step-button">{marker}{text}</span>}
      </li>;
    })}
  </ol>;
});

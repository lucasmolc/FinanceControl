import type { ReactNode } from "react";
import type { ConfirmFn } from "../../components/confirmContext";
import type { FinanceState, FormState, RecordModule } from "../../types";

export interface FormContext {
  state: FinanceState; month: string; mode: "create" | "edit"; id?: number;
  /** Confirmation dialog (e.g. MEL-43 "desligar o cálculo automático"); absent outside a ConfirmProvider. */
  confirm?: ConfirmFn;
  /** Closed months "YYYY-MM" (MEL-44), loaded by RecordModal for definitions with `usesClosedMonths`. */
  closedMonths?: string[];
  /** R3-REC-2: reopens a closed month from the form (confirm first); resolves true when reopened. */
  reopenMonth?: (month: string) => Promise<boolean>;
}
export type FormErrors = Record<string, string>;
export type SetField = (key: string, value: FormState[string]) => void;
export interface FieldsProps { form: FormState; set: SetField; errors: FormErrors; ctx: FormContext; }

/** Returned by a custom `submit` to offer "Desfazer" in the success notice (e.g. a subscription charge). */
export interface SavedUndo { run: () => Promise<void>; /** Notice shown after undoing. */ message: string; }

export interface RecordFormDefinition {
  /** Enables the generic api.create / api.update submit. */
  module?: RecordModule;
  /** e.g. "Nova conta a pagar" / "Editar conta a pagar"; movements carry the entity name. */
  title(ctx: FormContext, form: FormState): string;
  /** Create mode: builds the initial form from the caller's `initial` (defaults + normalization). */
  defaults?(ctx: FormContext, initial: FormState): FormState;
  /** Edit mode initial state (money as formatMoneyInput text). */
  fromRecord?(record: object): FormState;
  /** Form keys → pt-BR messages. */
  validate(form: FormState, ctx: FormContext): FormErrors;
  toPayload?(form: FormState, ctx: FormContext): Record<string, unknown>;
  /** Custom flows (entries, bill payment); overrides the generic submit. */
  submit?(form: FormState, ctx: FormContext): Promise<void | SavedUndo>;
  /** API field → form key (e.g. amount_cents → amount). */
  apiFieldMap?: Record<string, string>;
  successMessage(ctx: FormContext, form: FormState): string;
  /** When it returns a reason, the primary button is disabled and shows it as tooltip (e.g. closed month, MEL-44). */
  submitDisabledReason?(ctx: FormContext, form: FormState): string | undefined;
  /** Primary button label (default "Salvar"). */
  submitLabel?(ctx: FormContext, form: FormState): string;
  size?: "md" | "lg";
  /** Loads the closed months into `ctx.closedMonths` (movements dated in a closed month are blocked, MEL-44). */
  usesClosedMonths?: boolean;
  /**
   * CR-15: "Salvar e lançar outro" (create mode). After saving, the dialog stays open with `next(form)` — e.g. the same
   * date and payment method, empty description and amount.
   */
  saveAndNew?: { label: string; /** Phone label (half-width button, R1-REC-3); default "Salvar e outro". */ shortLabel?: string; next(form: FormState, ctx: FormContext): FormState; message?: string };
  Fields(props: FieldsProps): ReactNode;
}

/** Third argument of `RecordModal`'s `onSaved`: `keepOpen` asks the host to refresh without closing the dialog. */
export interface SavedOptions { keepOpen?: boolean; }

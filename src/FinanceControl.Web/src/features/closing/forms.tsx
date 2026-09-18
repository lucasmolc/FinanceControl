import { api } from "../../api/client";
import { monthOr, textOrNull, validator } from "../records/formUtils";
import type { RecordFormDefinition } from "../records/types";
import { monthTitle } from "./closingModel";
import { MonthCloseFields } from "./formFields";

// ── Fechamento mensal (MEL-22) ───────────────────────────────────────────────

export const monthCloseForm: RecordFormDefinition = {
  title: (ctx, form) => `Fechar ${monthTitle(monthOr(form, "month", ctx.month)).toLowerCase()}`,
  defaults: (ctx, initial) => ({ month: ctx.month, notes: "", ...initial }),
  validate: form => validator(form).maxLength("notes", 500).errors,
  submit: async (form, ctx) => {
    const month = monthOr(form, "month", ctx.month);
    await api.closeMonth(month, textOrNull(form, "notes"));
    return { run: async () => { await api.reopenMonth(month); }, message: `${monthTitle(month)} foi reaberto.` };
  },
  successMessage: (ctx, form) => `${monthTitle(monthOr(form, "month", ctx.month))} foi fechado.`,
  submitLabel: () => "Fechar mês",
  Fields: MonthCloseFields,
};

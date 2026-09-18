// MEL-45: "Balde do plano" field for the category form (components only: react-refresh; helpers in ./bucketModel.ts).
// Usage in features/catalog/formFields.tsx › CategoryFields: `<BucketField f={f} />`, with
// `bucket: bucketFormValue(category)` in fromRecord and `bucket: bucketPayload(form)` in toPayload.
import { SelectField } from "../records/fields";
import { text } from "../records/formUtils";
import type { FieldsProps } from "../records/types";
import { BUCKET_FIELD, BUCKETS, bucketLabels } from "./bucketModel";

const OPTIONS: [string, string][] = BUCKETS.map(bucket => [bucket, bucketLabels[bucket]]);

/** Shown for expense and investment categories (income never enters the plan). */
export function BucketField({ f, label = "Balde do plano 70-20-10" }: { f: FieldsProps; label?: string }) {
  const kind = text(f.form, "kind") || "expense";
  if (kind === "income") return null;
  const hasPlan = typeof f.ctx.state.settings.plan_fixed_pct === "number";
  return <SelectField f={f} name={BUCKET_FIELD} label={label} optional options={OPTIONS} emptyLabel="Sem balde"
    hint={hasPlan
      ? "Os gastos desta categoria entram no limite de gastos fixos, no limite de lazer ou no investimento mínimo do seu plano."
      : "Usado pelo plano 70-20-10 (Configurações) para somar gastos fixos, lazer e investimentos."} />;
}

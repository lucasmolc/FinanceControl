/** MEL-45: category buckets of the 70-20-10 plan (helpers for the category form; components live in BucketField.tsx). */
import type { Category, CategoryBucket, FormState } from "../../types";

export const BUCKETS: readonly CategoryBucket[] = ["fixo", "lazer", "investimento", "fora"];

export const bucketLabels: Record<CategoryBucket, string> = { fixo: "Gastos fixos", lazer: "Lazer", investimento: "Investimento", fora: "Fora do plano" };

/** Short explanation of each bucket (field hint / option descriptions). */
export const bucketDescriptions: Record<CategoryBucket, string> = {
  fixo: "Moradia, contas, mercado, transporte: conta no limite de gastos fixos.",
  lazer: "Restaurantes, viagens, hobbies: conta no limite de lazer.",
  investimento: "Aportes e reservas: conta no mínimo investido.",
  fora: "Não entra em nenhum balde do plano.",
};

export const isBucket = (value: unknown): value is CategoryBucket => typeof value === "string" && (BUCKETS as readonly string[]).includes(value);

/** Form key used by the category form. */
export const BUCKET_FIELD = "bucket";

/** Form value ("" = no bucket) from a saved category (edit mode). */
export const bucketFormValue = (category: Pick<Category, "bucket">): string => (isBucket(category.bucket) ? category.bucket : "");

/** Payload value for POST/PUT /api/categories: the bucket or null (no bucket). */
export const bucketPayload = (form: FormState): CategoryBucket | null => {
  const value = String(form[BUCKET_FIELD] ?? "").trim();
  return isBucket(value) ? value : null;
};

/** The bucket label, "Sem balde" when none. */
export const bucketLabel = (bucket: string | null | undefined): string => (isBucket(bucket) ? bucketLabels[bucket] : "Sem balde");

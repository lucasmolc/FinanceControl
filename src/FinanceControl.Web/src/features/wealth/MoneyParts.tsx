import { Money } from "../../components/ui";
import { CurrencyIcon } from "../../components/ui/CurrencyIcon";
import { currencyLabel, currencyOf, isBaseCurrency } from "../../lib/currencies";
import { toBaseCents, type ExchangeRates } from "../../lib/money";

/** `.currency-chip`: currency badge + code (MEL-36), with the pt-BR name as tooltip. */
export function CurrencyChip({ code }: { code: string | null | undefined }) {
  const info = currencyOf(code);
  return <span className="currency-chip" title={currencyLabel(info.code)}><CurrencyIcon code={info.code} size={18} decorative /><span>{info.code}</span></span>;
}

/**
 * Native amount plus its BRL conversion ("≈ R$ …") for non-BRL records (MEL-26); privacy aware through `Money`.
 * Without a known rate the second line says "sem cotação".
 */
export function NativeMoney({ cents, currency, rates, tone, signed = false }: { cents: number; currency?: string | null; rates: ExchangeRates; tone?: "auto" | "positive" | "negative" | "neutral"; signed?: boolean }) {
  const code = currencyOf(currency).code;
  if (isBaseCurrency(code)) return <Money cents={cents} tone={tone} signed={signed} />;
  const base = toBaseCents(cents, code, rates);
  return <span className="native-value">
    <Money cents={cents} currency={code} tone={tone} signed={signed} />
    <small className="muted">{base === null ? "sem cotação" : <>≈ <Money cents={base} signed={signed} /></>}</small>
  </span>;
}

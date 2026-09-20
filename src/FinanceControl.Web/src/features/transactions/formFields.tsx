// Form field components for the record definitions in ./forms.tsx (components only: react-refresh).
import { useEffect, useRef, useState } from "react";
import { useMarketRates } from "../../hooks/useMarketRates";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { brandById, detectBrand } from "../../lib/brands";
import { currencyOf } from "../../lib/currencies";
import { optionsOf, paymentMethodLabels } from "../../lib/labels";
import { formatRate, parseRate, toBaseCents } from "../../lib/money";
import { BrandField, CategoryField, ChoiceField, CurrencyField, DateField, FormGrid, MoneyField, NumberField, SelectField, TextAreaField, TextField } from "../records/fields";
import { accountIcon, cardIcon } from "../records/optionIcons";
import { ClosedMonthActions } from "../records/ClosedMonthActions";
import { accountCurrency, accountOptions, checked, closedMonthMessage, idOrNull, inClosedMonth, KIND_OPTIONS, money, text, trimmed } from "../records/formUtils";
import type { FieldsProps } from "../records/types";
import { preselectedCard, transactionCurrency } from "./formModel";
import { REMOVED_ACCOUNT_HINT } from "./transactionsModel";
import {
  AMOUNT_BASIS_OPTIONS, closedInstallmentMonths, installmentPlan, installmentSummary, MAX_INSTALLMENTS, MIN_INSTALLMENTS,
  REPEAT_DESCRIPTIONS, REPEAT_OPTIONS, repeatMode,
} from "./installments";

/**
 * "Cotação usada" for non-BRL transactions (MEL-26): prefilled with the latest market rate until the user edits it,
 * with a preview of the amount in reais.
 */
function ExchangeRateField({ f, currency }: { f: FieldsProps; currency: string }) {
  const info = currencyOf(currency);
  const { rates, loading } = useMarketRates(true);
  const format = useMoneyFormat();
  const marketRate = rates[info.code];
  const rateText = text(f.form, "exchange_rate");
  const touched = checked(f.form, "exchange_rate_touched");
  const setRef = useRef(f.set);
  useEffect(() => { setRef.current = f.set; });

  useEffect(() => {
    if (touched || rateText || marketRate === null || marketRate === undefined) return;
    setRef.current("exchange_rate", formatRate(String(marketRate)));
  }, [touched, rateText, marketRate]);

  const amount = money(f.form, "amount", info.decimals);
  const rate = parseRate(rateText);
  const base = amount !== null && rate !== null ? toBaseCents(amount, info.code, { [info.code]: rate }) : null;
  const hint = base !== null
    ? `Em reais: ${format(base)}. R$ por 1 ${info.code}; em branco, usamos a cotação mais recente.`
    : loading ? "Buscando a cotação mais recente…" : `R$ por 1 ${info.code}; em branco, usamos a cotação mais recente.`;
  return <TextField f={{ ...f, set: (key, next) => { f.set(key, next); f.set("exchange_rate_touched", true); } }} name="exchange_rate" label="Cotação usada" placeholder="Ex.: 5,1234" hint={hint} />;
}

/**
 * "Repetição" (v1.4): um lançamento só, uma compra parcelada (N lançamentos, um por mês, para trás e para frente) ou
 * um gasto mensal sem prazo — que é uma assinatura, para poder mudar de valor e ser desativada depois.
 */
function RepetitionSection({ f, kind }: { f: FieldsProps; kind: string }) {
  const format = useMoneyFormat();
  const mode = repeatMode(f.form);
  const currency = transactionCurrency(f.form);
  const plan = installmentPlan(f.form, currencyOf(currency).decimals);
  const date = trimmed(f.form, "date");
  const closed = plan ? closedInstallmentMonths(plan, date, f.ctx.closedMonths) : [];
  // Assinatura é sempre uma despesa; para receita ou aporte a opção não se aplica.
  const disabled = kind === "expense" ? undefined : ["forever"];
  return <>
    <ChoiceField f={f} name="repeat" label="Repetição" options={REPEAT_OPTIONS} descriptions={REPEAT_DESCRIPTIONS}
      variant="cards" columns={3} disabledOptions={disabled} />
    {mode === "installments" && <div className="stack">
      <FormGrid>
        <NumberField f={f} name="installment_number" label="Parcela atual" min={1} max={MAX_INSTALLMENTS} required
          hint="Em qual parcela a compra está hoje. As anteriores entram nos meses passados." />
        <NumberField f={f} name="installment_count" label="Total de parcelas" min={MIN_INSTALLMENTS} max={MAX_INSTALLMENTS} required />
      </FormGrid>
      <ChoiceField f={f} name="amount_basis" label="O valor informado é" options={AMOUNT_BASIS_OPTIONS} />
      {plan && closed.length === 0 && <p className="field-hint" role="status">{installmentSummary(plan, format)}</p>}
      {closed.length > 0 && <p className="field-error" role="alert">
        {closed.length === 1 ? `A parcela de ${closed[0]} cai em um mês fechado.` : `Parcelas caem em meses fechados (${closed.join(", ")}).`} Reabra para lançar a compra inteira.
      </p>}
    </div>}
    {mode === "forever" && <p className="field-hint">
      Vira uma <b>assinatura</b>: a cobrança se repete todo mês, aparece nas próximas faturas e segue até você desativar em
      Assinaturas. Alterar o valor lá vale só para as cobranças seguintes. A cobrança desta data já é lançada agora.
    </p>}
  </>;
}

/** Keys that live in "Mais detalhes" (CR-15): the section opens by itself when one of them has a value or an error. */
const DETAIL_KEYS = ["currency", "exchange_rate", "brand", "notes"] as const;

export function TransactionFields(f: FieldsProps) {
  const kind = trimmed(f.form, "kind") || "expense";
  const paymentMethod = trimmed(f.form, "payment_method") || "card";
  const cardMode = paymentMethod === "card";
  const cardId = cardMode ? idOrNull(f.form, "card_id") : null;
  const cards = f.ctx.state.cards.map((card): [string, string] => [String(card.id), card.name]);
  const accounts = accountOptions(f.ctx.state);
  const accountId = text(f.form, "account_id");
  // MEL-16: the linked account was removed — listed as "(removida)", disabled, so the user picks another one.
  const accountRemoved = accountId !== "" && !accounts.some(([value]) => value === accountId);
  const currency = transactionCurrency(f.form);
  const accountLocksCurrency = cardId === null && idOrNull(f.form, "account_id") !== null && !accountRemoved;
  const currencyLocked = cardId !== null || accountLocksCurrency;

  // MEL-39: suggest the service/merchant brand from the description until the user picks one.
  const description = text(f.form, "description");
  const brandTouched = checked(f.form, "brand_touched");
  const brand = text(f.form, "brand");
  const setRef = useRef(f.set);
  useEffect(() => { setRef.current = f.set; });
  useEffect(() => {
    if (brandTouched) return;
    const detected = detectBrand(description, "service")?.id ?? "";
    if (detected !== brand) setRef.current("brand", detected);
  }, [description, brandTouched, brand]);

  // CR-15: optional details stay folded unless they carry something.
  const detailsFilled = currency !== "BRL" || trimmed(f.form, "notes") !== "" || (brandTouched && brand !== "");
  const detailsInvalid = DETAIL_KEYS.some(key => Boolean(f.errors[key]));
  const [detailsOpen, setDetailsOpen] = useState(detailsFilled);
  const open = detailsOpen || detailsInvalid;
  const summary = [currency !== "BRL" ? currency : null, brandById(brand)?.name ?? null, trimmed(f.form, "notes") ? "com observação" : null].filter(Boolean).join(" · ");

  /** Currency change: an automatic (untouched) rate is cleared so the new currency's rate is prefilled. */
  const setCurrency = (next: string) => {
    f.set("currency", next);
    if (!checked(f.form, "exchange_rate_touched")) f.set("exchange_rate", "");
  };
  const changeKind = (next: string) => {
    f.set("kind", next);
    const categoryId = idOrNull(f.form, "category_id");
    const category = f.ctx.state.categories.find(item => item.id === categoryId);
    if (categoryId !== null && category?.kind !== next) f.set("category_id", "");
    // Assinatura só existe para despesa: trocar o tipo desfaz a escolha "todo mês, sem prazo".
    if (next !== "expense" && repeatMode(f.form) === "forever") f.set("repeat", "none");
  };
  const changeMethod = (next: string) => {
    f.set("payment_method", next);
    // CR-06: switching to the credit card picks the only card right away.
    if (next === "card") { if (!trimmed(f.form, "card_id")) f.set("card_id", preselectedCard(f.ctx.state)); }
    else f.set("card_id", "");
  };
  const changeCard = (next: string) => {
    f.set("card_id", next);
    if (next) f.set("account_id", "");
  };
  const changeAccount = (next: string) => {
    f.set("account_id", next);
    // MEL-26: a transaction linked to an account uses the account currency.
    if (next) setCurrency(accountCurrency(f.ctx.state, next));
  };
  const noCards = cards.length === 0;
  const cardField = <SelectField f={f} name="card_id" label="Cartão" required options={cards} onChange={changeCard} icon={cardIcon(f.ctx.state)} disabled={noCards && cardId === null}
    placeholder={noCards ? "Nenhum cartão cadastrado" : "Escolha o cartão"}
    missingLabel={`${String(f.form.card_name ?? "Cartão atual")} (removido)`} missingDisabled
    hint={noCards ? "Cadastre um cartão em Cartões ou escolha outra forma de pagamento." : cardId !== null ? "A compra entra na fatura do cartão; a conta só é movimentada ao pagar a fatura." : "Sem o cartão, a compra ficaria fora das faturas e do limite."} />;
  const accountField = <SelectField f={f} name="account_id" label="Conta bancária" options={accounts} emptyLabel="Não movimentar conta" onChange={changeAccount} icon={accountIcon(f.ctx.state)}
    missingLabel={`${String(f.form.account_name ?? "Conta atual")} (removida)`} missingDisabled
    hint={accountRemoved ? REMOVED_ACCOUNT_HINT : "Quando escolhida, o saldo da conta é ajustado automaticamente."} />;
  // R3-REC-2: a date in a closed month is flagged before Salvar, with the ways out right below the field.
  const date = trimmed(f.form, "date");
  const closedDateErrors = inClosedMonth(date, f.ctx.closedMonths) && !f.errors.date ? { ...f.errors, date: closedMonthMessage(date) } : f.errors;
  const currencyHint = cardId !== null ? "Compras no cartão são em reais." : accountLocksCurrency ? "Moeda da conta escolhida." : undefined;
  return <>
    {/* R1-REC-6: the type comes first — it changes the category options and the sign of the amount. */}
    <ChoiceField f={f} name="kind" label="Tipo" options={KIND_OPTIONS} onChange={changeKind} />
    <TextField f={f} name="description" label="Descrição" maxLength={160} required autoFocus placeholder="Ex.: Supermercado, salário ou aporte" />
    <FormGrid>
      <MoneyField f={f} name="amount" label="Valor" required currency={currency} />
      <DateField f={{ ...f, errors: closedDateErrors }} name="date" label="Data" required />
    </FormGrid>
    <ClosedMonthActions f={f} />
    <CategoryField f={f} kind={kind} brand={brand} />
    <FormGrid>
      <SelectField f={f} name="payment_method" label="Forma de pagamento" options={optionsOf(paymentMethodLabels)} onChange={changeMethod} />
      {cardMode ? cardField : accountField}
    </FormGrid>
    {f.ctx.mode === "create" && <RepetitionSection f={f} kind={kind} />}
    <details className="form-more" open={open} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
      <summary>
        <span className="form-more-title">Mais detalhes</span>
        <span className="form-more-summary muted">{summary || "Moeda, serviço ou loja e observações"}</span>
      </summary>
      <div className="stack form-more-body">
        <FormGrid>
          <CurrencyField f={{ ...f, form: { ...f.form, currency } }} onChange={setCurrency} disabled={currencyLocked} hint={currencyHint} />
          {currency !== "BRL" && <ExchangeRateField f={f} currency={currency} />}
        </FormGrid>
        <BrandField f={f} kind="service" label="Serviço ou loja" source={description} />
        <TextAreaField f={f} name="notes" label="Observações" maxLength={500} />
      </div>
    </details>
  </>;
}

// Form field components for the record definitions in ./forms.tsx (components only: react-refresh).
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { currencyOf } from "../../lib/currencies";
import { cardNetworkLabels, labelFor, optionsOf, paymentMethodLabels, subscriptionFrequencyLabels } from "../../lib/labels";
import { formatDate } from "../../lib/date";
import { BrandField, CategoryField, ChoiceField, ColorField, CurrencyField, DateField, DayField, FormContextNote, FormGrid, IconField, MoneyField, MoreDetails, SelectField, SwitchField, TextAreaField, TextField } from "../records/fields";
import { brandById } from "../../lib/brands";
import { BucketField } from "../plan/BucketField";
import { accountOptions, CARD_SWATCHES, checked, currencyCode, findById, idOrNull, KIND_OPTIONS, text, trimmed } from "../records/formUtils";
import { accountIcon, cardIcon } from "../records/optionIcons";
import type { FieldsProps } from "../records/types";
import { useBrandIconSuggestions } from "../records/useSuggestions";
import { needsBillingDate, suggestedBucket } from "./catalogMetrics";
import { VisualCard } from "./VisualCard";

export function CategoryFields(f: FieldsProps) {
  const kind = trimmed(f.form, "kind") || "expense";
  const expense = kind === "expense";
  const iconKind = kind === "income" || kind === "investment" ? kind : "expense";
  const name = text(f.form, "name");
  useBrandIconSuggestions(f, name, { icon: iconKind });
  // R2-REC-1: in create mode the preselected bucket follows Tipo until the user picks one; "Sem balde" says what it costs.
  const hasPlan = typeof f.ctx.state.settings.plan_fixed_pct === "number";
  const bucket = trimmed(f.form, "bucket");
  const kindField: FieldsProps = f.ctx.mode === "create" && !f.form.bucket_touched
    ? { ...f, set: (key, value) => { f.set(key, value); if (key === "kind") f.set("bucket", suggestedBucket(f.ctx.state.settings, String(value))); } }
    : f;
  const bucketField: FieldsProps = { ...f, set: (key, value) => { f.set(key, value); if (key === "bucket") f.set("bucket_touched", true); } };
  return <>
    <ChoiceField f={kindField} name="kind" label="Tipo" options={KIND_OPTIONS} />
    <TextField f={f} name="name" label="Nome" maxLength={120} required autoFocus placeholder="Ex.: Alimentação, moradia ou transporte" />
    {expense && <MoneyField f={f} name="monthly_budget" label="Limite mensal" hint="Usado para acompanhar o consumo do mês." />}
    <IconField f={f} kind={iconKind} source={name} color={text(f.form, "color")} hint="Aparece em listas, gráficos e lançamentos." />
    <ColorField f={f} hint="Sem cor usa a cor do grupo do ícone." />
    <BucketField f={bucketField} />
    {hasPlan && kind !== "income" && !bucket && <p className="field-hint bucket-none-hint" role="note">Sem balde, {kind === "investment" ? "os aportes" : "os gastos"} desta categoria ficam fora das somas do plano e aparecem como "sem balde" no Painel e em Relatórios.</p>}
  </>;
}

const SUBSCRIPTION_DETAIL_KEYS = ["brand", "icon", "notes"] as const;

export function SubscriptionFields(f: FieldsProps) {
  const state = f.ctx.state;
  const cards = state.cards.map((card): [string, string] => [String(card.id), card.name]);
  const frequency = trimmed(f.form, "frequency") || "monthly";
  const monthly = !needsBillingDate({ frequency });
  const currency = currencyCode(f.form);
  const autoDebit = checked(f.form, "auto_debit");
  const cardId = idOrNull(f.form, "card_id");
  const hasCard = cardId !== null;
  const name = text(f.form, "name");
  const brand = text(f.form, "brand");
  useBrandIconSuggestions(f, name, { brand: "service", icon: "expense" });
  const summary = [brandById(brand)?.name ?? null, trimmed(f.form, "notes") ? "com observação" : null].filter(Boolean).join(" · ");
  // R1-REC-2: one hint explains the schedule — monthly uses the day; yearly/weekly count from the next charge date.
  const scheduleHint = monthly
    ? "Cobrada todo mês neste dia. A próxima cobrança é opcional: use só para começar em outra data."
    : `A partir desta data calculamos as próximas cobranças (${frequency === "yearly" ? "todo ano" : "a cada 7 dias"}).`;
  return <>
    <TextField f={f} name="name" label="Assinatura" maxLength={120} required autoFocus placeholder="Ex.: Netflix, Spotify ou Smart Fit" />
    <FormGrid>
      <MoneyField f={f} name="amount" label="Valor" required currency={currency} />
      <CurrencyField f={f} />
    </FormGrid>
    <ChoiceField f={f} name="frequency" label="Periodicidade" options={optionsOf(subscriptionFrequencyLabels)} />
    {/* R3-REC-4: most subscriptions are charged to a card — the card is chosen here, not in "Mais detalhes". */}
    {(cards.length > 0 || hasCard) && <SelectField f={f} name="card_id" label="Cartão" options={cards} emptyLabel="Sem cartão" missingLabel={String(f.form.card_name ?? "Cartão atual")} icon={cardIcon(state)} />}
    {monthly
      ? <FormGrid>
        <DayField f={f} name="billing_day" label="Dia da cobrança" hint={scheduleHint} />
        <DateField f={f} name="next_billing_date" label="Próxima cobrança" />
      </FormGrid>
      : <DateField f={f} name="next_billing_date" label="Próxima cobrança" required hint={scheduleHint} />}
    <CategoryField f={f} kind="expense" brand={brand} />
    <SwitchField f={f} name="auto_debit" label="Débito automático" hint={hasCard ? "Lançado automaticamente no cartão em cada cobrança." : "Lançado automaticamente no vencimento."} />
    {autoDebit && !hasCard && <SelectField f={f} name="account_id" label="Conta debitada" required options={accountOptions(state)} emptyLabel="Selecione a conta" icon={accountIcon(state)}
      missingLabel={`${String(f.form.account_name ?? "Conta atual")} (removida)`} missingDisabled hint={cards.length ? "Ou escolha um cartão acima." : undefined} />}
    <MoreDetails f={f} keys={SUBSCRIPTION_DETAIL_KEYS} filled={trimmed(f.form, "notes") !== ""} summary={summary} placeholder="Empresa ou serviço, ícone e observações">
      <FormGrid>
        <BrandField f={f} kind="service" label="Empresa ou serviço" source={name} />
        <IconField f={f} kind="expense" source={name} brand={brand} />
      </FormGrid>
      <TextAreaField f={f} name="notes" label="Observações" maxLength={500} />
    </MoreDetails>
  </>;
}

export function CardFields(f: FieldsProps) {
  const name = text(f.form, "name");
  useBrandIconSuggestions(f, name, { brand: "bank" });
  const closing = Number(trimmed(f.form, "closing_day")) || null;
  const due = Number(trimmed(f.form, "due_day")) || null;
  return <>
    <div className="card-form-preview" aria-hidden="true">
      <VisualCard compact name={name || "Novo cartão"} brand={text(f.form, "brand") || null} network={text(f.form, "network") || null} color={text(f.form, "color") || null} dueDay={due} closingDay={closing} />
    </div>
    <TextField f={f} name="name" label="Nome" maxLength={120} required placeholder="Ex.: Nubank Ultravioleta" />
    <FormGrid>
      <BrandField f={f} kind="bank" label="Emissor" hint="Banco que emite o cartão." source={name} />
      <SelectField f={f} name="network" label="Bandeira" options={optionsOf(cardNetworkLabels)} emptyLabel="Não informar" />
    </FormGrid>
    <ColorField f={f} label="Cor do cartão" swatches={CARD_SWATCHES} hint="O texto do cartão se ajusta para continuar legível." />
    <FormGrid>
      <MoneyField f={f} name="personal_limit" label="Limite pessoal" hint="Quanto você se permite usar por mês." />
      <MoneyField f={f} name="real_limit" label="Limite do banco" />
    </FormGrid>
    <FormGrid>
      <DayField f={f} name="closing_day" label="Dia do fechamento" />
      <DayField f={f} name="due_day" label="Dia do vencimento" />
    </FormGrid>
  </>;
}

export function SubscriptionChargeFields(f: FieldsProps) {
  const state = f.ctx.state;
  const subscription = findById(state.subscriptions, f.form.subscription_id);
  const currency = currencyOf(subscription?.currency).code;
  const format = useMoneyFormat();
  return <>
    {subscription && <FormContextNote>{format(subscription.amount_cents, currency)} · {labelFor(subscriptionFrequencyLabels, subscription.frequency)}{subscription.card_name ? ` · ${subscription.card_name}` : ""}. A cobrança vira uma despesa{subscription.category_name ? ` em ${subscription.category_name}` : ""}.</FormContextNote>}
    <FormGrid>
      <DateField f={f} name="date" label="Data da cobrança" required />
      <MoneyField f={f} name="amount" label="Valor cobrado" required currency={currency} />
    </FormGrid>
    <FormGrid>
      <SelectField f={f} name="payment_method" label="Forma de pagamento" options={optionsOf(paymentMethodLabels)} />
      <SelectField f={f} name="account_id" label="Conta bancária" options={accountOptions(state)} emptyLabel="Não movimentar conta" icon={accountIcon(state)} hint="Quando escolhida, o saldo da conta é ajustado." />
    </FormGrid>
  </>;
}

export function InvoicePaymentFields(f: FieldsProps) {
  const state = f.ctx.state;
  const format = useMoneyFormat();
  const total = typeof f.form.total_cents === "number" ? f.form.total_cents : null;
  const due = typeof f.form.due_date === "string" && f.form.due_date ? f.form.due_date : null;
  return <>
    {total !== null && <FormContextNote>Total da fatura: {format(total)}{due ? ` · vence em ${formatDate(due)}` : ""}. O pagamento é registrado como saída da conta; as compras já contam como despesas.</FormContextNote>}
    <SelectField f={f} name="account_id" label="Conta de pagamento" required options={accountOptions(state)} emptyLabel="Selecione a conta" icon={accountIcon(state)} />
    <FormGrid>
      <DateField f={f} name="date" label="Data do pagamento" required />
      <MoneyField f={f} name="amount" label="Valor pago" required />
    </FormGrid>
  </>;
}

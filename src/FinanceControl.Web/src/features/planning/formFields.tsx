// Form field components for the record definitions in ./forms.tsx (components only: react-refresh).
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { currencyOf } from "../../lib/currencies";
import { formatDate, formatMonthLabel } from "../../lib/date";
import { goalEntryKindLabels, goalTypeLabels, monthsLabel, optionsOf, paymentMethodLabels } from "../../lib/labels";
import { BrandField, CategoryField, CheckboxField, ChoiceField, CurrencyField, DateField, DayField, FormContextNote, FormGrid, IconField, MoneyField, MoreDetails, SelectField, SwitchField, TextAreaField, TextField } from "../records/fields";
import { brandById } from "../../lib/brands";
import { accountIcon, goalTypeIcon } from "../records/optionIcons";
import { ClosedMonthActions } from "../records/ClosedMonthActions";
import { findById, monthOr, accountOptions, checked, closedMonthMessage, currencyCode, dayValue, inClosedMonth, text, trimmed } from "../records/formUtils";
import type { FieldsProps } from "../records/types";
import { useBrandIconSuggestions } from "../records/useSuggestions";
import { isAutoReserveGoal } from "./reserveModel";

const AUTO_DEBIT_HINT = "Lançado automaticamente no vencimento.";
const BILL_DETAIL_KEYS = ["brand", "icon", "active_since"] as const;

export function BillFields(f: FieldsProps) {
  const day = dayValue(f.form, "due_day");
  const currency = currencyCode(f.form);
  const autoDebit = checked(f.form, "auto_debit");
  const name = text(f.form, "name");
  const state = f.ctx.state;
  useBrandIconSuggestions(f, name, { brand: "service", icon: "expense" });
  return <>
    <TextField f={f} name="name" label="Nome" maxLength={120} required autoFocus placeholder="Ex.: Aluguel, internet ou energia" />
    <FormGrid>
      <MoneyField f={f} name="amount" label="Valor" required currency={currency} />
      <CurrencyField f={f} />
    </FormGrid>
    <FormGrid>
      <DayField f={f} name="due_day" label="Dia do vencimento" hint={day !== null && day > 28 ? "Em meses mais curtos, vence no último dia do mês." : undefined} />
      <CategoryField f={f} kind="expense" brand={text(f.form, "brand")} hint="Usada no lançamento criado ao pagar a conta." />
    </FormGrid>
    <SwitchField f={f} name="auto_debit" label="Débito automático" hint={AUTO_DEBIT_HINT} />
    {autoDebit && <SelectField f={f} name="account_id" label="Conta debitada" required options={accountOptions(state)} emptyLabel="Selecione a conta" icon={accountIcon(state)}
      missingLabel={`${String(f.form.account_name ?? "Conta atual")} (removida)`} missingDisabled />}
    {/* R1-REC-2: brand and icon are optional polish, folded like in the transaction form. */}
    <MoreDetails f={f} keys={BILL_DETAIL_KEYS} filled={false} summary={[brandById(text(f.form, "brand"))?.name ?? null, trimmed(f.form, "active_since") ? `desde ${formatDate(trimmed(f.form, "active_since"))}` : null].filter(Boolean).join(" · ")} placeholder="Empresa ou serviço, ícone e desde quando existe">
      <FormGrid>
        <BrandField f={f} kind="service" label="Empresa ou serviço" source={name} />
        <IconField f={f} kind="expense" source={name} brand={text(f.form, "brand")} />
      </FormGrid>
      <DateField f={f} name="active_since" label="Existe desde"
        hint={f.ctx.mode === "create" ? "Em branco, a conta passa a valer a partir de hoje. Informe uma data anterior para registrar pagamentos de meses passados." : "A conta só aparece a partir do mês desta data. Em branco, aparece em todos os meses."} />
    </MoreDetails>
  </>;
}

export function BillPaymentFields(f: FieldsProps) {
  const register = checked(f.form, "register_transaction");
  const month = monthOr(f.form, "month", f.ctx.month);
  const currency = currencyOf(findById(f.ctx.state.bills, f.form.bill_id)?.currency).code;
  return <>
    <FormContextNote>Competência: {formatMonthLabel(month)}</FormContextNote>
    <CheckboxField f={f} name="register_transaction" label="Lançar como despesa" hint="Cria um lançamento de despesa com a categoria da conta. Desmarque para apenas marcar como paga." />
    {register && <>
      <FormGrid>
        <DateField f={f} name="date" label="Data do pagamento" required />
        <MoneyField f={f} name="amount" label="Valor pago" required currency={currency} />
      </FormGrid>
      <FormGrid>
        <SelectField f={f} name="payment_method" label="Forma de pagamento" options={optionsOf(paymentMethodLabels)} />
        <SelectField f={f} name="account_id" label="Conta bancária" options={accountOptions(f.ctx.state)} emptyLabel="Não movimentar conta" icon={accountIcon(f.ctx.state)} />
      </FormGrid>
    </>}
  </>;
}

export function GoalFields(f: FieldsProps) {
  const create = f.ctx.mode === "create";
  const currency = currencyCode(f.form);
  const format = useMoneyFormat();
  const settings = f.ctx.state.settings;
  const autoReserve = !create && isAutoReserveGoal(settings, f.ctx.id);
  const targetHint = autoReserve
    ? `Calculado automaticamente: ${monthsLabel(settings.emergency_months_target)} × ${format(settings.monthly_net_income_cents)} de salário líquido. Mudar o valor desliga o cálculo automático.`
    : undefined;
  return <>
    <TextField f={f} name="name" label="Nome da meta" maxLength={120} required placeholder="Ex.: Reserva, viagem ou compra planejada" />
    <FormGrid>
      <SelectField f={f} name="type" label="Tipo" options={optionsOf(goalTypeLabels)} icon={goalTypeIcon} />
      <CurrencyField f={f} />
    </FormGrid>
    <FormGrid>
      <MoneyField f={f} name="target" label="Valor da meta" required currency={currency} hint={targetHint} />
      {create && <MoneyField f={f} name="current" label="Valor já guardado" hint="Depois, registre aportes pela meta." currency={currency} />}
    </FormGrid>
    <DateField f={f} name="target_date" label="Data alvo" />
    <TextAreaField f={f} name="notes" label="Observações" maxLength={500} />
  </>;
}

export function GoalEntryFields(f: FieldsProps) {
  const goal = findById(f.ctx.state.goals, f.form.goal_id);
  const withdrawal = trimmed(f.form, "kind") === "withdrawal";
  const format = useMoneyFormat();
  const currency = currencyOf(goal?.currency).code;
  const date = trimmed(f.form, "date");
  // MEL-44: show the closed-month block right away (the save button is disabled too).
  const dateErrors = inClosedMonth(date, f.ctx.closedMonths) && !f.errors.date ? { ...f.errors, date: closedMonthMessage(date) } : f.errors;
  return <>
    {goal && <FormContextNote>Guardado: {format(goal.current_cents, currency)} de {format(goal.target_cents, currency)}{goal.target_date ? ` · até ${formatDate(goal.target_date)}` : ""}</FormContextNote>}
    <FormGrid>
      <ChoiceField f={f} name="kind" label="Movimentação" options={optionsOf(goalEntryKindLabels)} />
      <DateField f={{ ...f, errors: dateErrors }} name="date" label="Data" required />
    </FormGrid>
    <ClosedMonthActions f={f} />
    <MoneyField f={f} name="amount" label={withdrawal ? "Valor do resgate" : "Valor do aporte"} required currency={currency}
      hint={withdrawal && goal ? `Disponível para resgate: ${format(goal.current_cents, currency)}.` : undefined} />
    <TextAreaField f={f} name="notes" label="Observações" maxLength={500} />
  </>;
}

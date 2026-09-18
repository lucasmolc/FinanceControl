// Form field components for the record definitions in ./forms.tsx (components only: react-refresh).
import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, PiggyBank, SlidersHorizontal, TrendingUp } from "lucide-react";
import { CurrencyIcon } from "../../components/ui/CurrencyIcon";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { currencyOf } from "../../lib/currencies";
import { accountTypeLabels, bankEntryKindLabels, investmentEntryKindLabels, investmentTypeLabels, optionsOf } from "../../lib/labels";
import { BrandField, ChoiceField, CurrencyField, DateField, FormContextNote, FormGrid, LogoField, MoneyField, SelectField, TextAreaField, TextField } from "../records/fields";
import { accountIcon } from "../records/optionIcons";
import { ClosedMonthActions } from "../records/ClosedMonthActions";
import { findById, accountCurrency, accountOptions, closedMonthMessage, currencyCode, inClosedMonth, money, text, trimmed } from "../records/formUtils";
import type { FieldsProps } from "../records/types";
import { useBrandIconSuggestions } from "../records/useSuggestions";
import { impliedRate, isCrossCurrencyTransfer } from "./formModel";
import { hasTransferTarget, TRANSFER_UNAVAILABLE } from "./transfer";
import { withdrawalPreview } from "./wealthMetrics";

/** MEL-44: the closed-month block shown right away on the date field (the save button is disabled too). */
function closedDateErrors(f: FieldsProps) {
  const date = trimmed(f.form, "date");
  return inClosedMonth(date, f.ctx.closedMonths) && !f.errors.date ? { ...f.errors, date: closedMonthMessage(date) } : f.errors;
}

export function InvestmentFields(f: FieldsProps) {
  const create = f.ctx.mode === "create";
  const currency = currencyCode(f.form);
  const institution = text(f.form, "institution");
  useBrandIconSuggestions(f, institution, { brand: "bank" });
  return <>
    <TextField f={f} name="name" label="Investimento" maxLength={120} required placeholder="Ex.: Tesouro Selic, CDB ou fundo" />
    <FormGrid>
      <SelectField f={f} name="type" label="Tipo" options={optionsOf(investmentTypeLabels)} />
      <TextField f={f} name="institution" label="Instituição" maxLength={120} placeholder="Ex.: Banco ou corretora" />
    </FormGrid>
    {create && <>
      <CurrencyField f={f} hint="Não pode ser alterada depois." />
      <FormGrid>
        <MoneyField f={f} name="invested" label="Valor aplicado" required currency={currency} />
        <MoneyField f={f} name="current" label="Saldo atual" hint="Em branco, usa o valor aplicado." currency={currency} />
      </FormGrid>
    </>}
    <FormGrid>
      <TextField f={f} name="benchmark" label="Rentabilidade de referência" maxLength={80} placeholder="Ex.: 100% do CDI ou IPCA + 6%" />
      <TextField f={f} name="liquidity" label="Liquidez" maxLength={80} placeholder="Ex.: D+0 ou no vencimento" />
    </FormGrid>
    <BrandField f={f} kind="bank" label="Marca da instituição" source={institution} />
    <LogoField f={f} />
    {!create && <p className="field-hint">Valor aplicado e saldo mudam pelas movimentações do investimento.</p>}
  </>;
}

const INVESTMENT_KIND_ICONS: Record<string, ReactNode> = {
  deposit: <PiggyBank size={18} />, withdrawal: <ArrowUpRight size={18} />, yield: <TrendingUp size={18} />, adjustment: <SlidersHorizontal size={18} />,
};

export function InvestmentEntryFields(f: FieldsProps) {
  const investment = findById(f.ctx.state.investments, f.form.investment_id);
  const currency = currencyOf(investment?.currency).code;
  const format = useMoneyFormat();
  const kind = trimmed(f.form, "kind");
  const adjustment = kind === "adjustment";
  const withdrawal = kind === "withdrawal";
  const amount = money(f.form, "amount", currencyOf(currency).decimals);
  const preview = withdrawal && investment && amount !== null ? withdrawalPreview(investment.invested_cents, investment.current_cents, amount) : null;
  const withdrawalHint = "O valor aplicado é reduzido na proporção do resgate (custo médio)."
    + (preview ? ` Depois do resgate: aplicado ${format(preview.investedCents, currency)} · atual ${format(preview.currentCents, currency)}.` : "");
  return <>
    {investment && <FormContextNote>Saldo atual: {format(investment.current_cents, currency)} · Aplicado: {format(investment.invested_cents, currency)}</FormContextNote>}
    <ChoiceField f={f} name="kind" label="Movimentação" variant="cards" columns={2} options={optionsOf(investmentEntryKindLabels)} icons={INVESTMENT_KIND_ICONS} />
    <FormGrid>
      <DateField f={{ ...f, errors: closedDateErrors(f) }} name="date" label="Data" required />
      <MoneyField f={f} name="amount" label={adjustment ? "Novo saldo atual" : "Valor"} required currency={currency}
        hint={adjustment ? "Informe o saldo total do investimento após o ajuste." : withdrawal ? withdrawalHint : undefined} />
    </FormGrid>
    <ClosedMonthActions f={f} />
    <TextAreaField f={f} name="notes" label="Observações" maxLength={500} />
  </>;
}

export function BankAccountFields(f: FieldsProps) {
  const create = f.ctx.mode === "create";
  const currency = currencyCode(f.form);
  const institution = text(f.form, "institution");
  useBrandIconSuggestions(f, institution, { brand: "bank" });
  return <>
    <FormGrid>
      <TextField f={f} name="institution" label="Instituição" maxLength={120} required placeholder="Ex.: Banco ou corretora" />
      <TextField f={f} name="name" label="Nome ou apelido" maxLength={120} required placeholder="Ex.: Conta principal" />
    </FormGrid>
    <FormGrid>
      <SelectField f={f} name="account_type" label="Tipo" options={optionsOf(accountTypeLabels)} />
      {create && <CurrencyField f={f} hint="Não pode ser alterada depois." />}
    </FormGrid>
    {create && <MoneyField f={f} name="current_balance" label="Saldo inicial" allowNegative hint="O saldo de hoje; pode ser negativo (cheque especial). Lançamentos vinculados a esta conta, mesmo com data anterior, passam a somar ou subtrair dele." currency={currency} />}
    <BrandField f={f} kind="bank" label="Marca do banco" source={institution} />
    <LogoField f={f} />
    {!create && <p className="field-hint">O saldo muda pelas movimentações e pelos lançamentos vinculados a esta conta, inclusive os com data anterior. Para corrigir, use Movimentar → Ajuste de saldo.</p>}
  </>;
}

const BANK_ENTRY_KINDS = ["deposit", "withdrawal", "transfer_out", "adjustment"];
const BANK_KIND_ICONS: Record<string, ReactNode> = {
  deposit: <ArrowDownLeft size={18} />, withdrawal: <ArrowUpRight size={18} />, transfer_out: <ArrowLeftRight size={18} />, adjustment: <SlidersHorizontal size={18} />,
};

export function BankEntryFields(f: FieldsProps) {
  const account = findById(f.ctx.state.bank_accounts, f.form.account_id);
  const currency = accountCurrency(f.ctx.state, account?.id ?? f.form.account_id);
  const format = useMoneyFormat();
  const kind = trimmed(f.form, "kind");
  const adjustment = kind === "adjustment";
  const canTransfer = hasTransferTarget(f.ctx.state, account?.id ?? Number(f.form.account_id));
  const crossCurrency = isCrossCurrencyTransfer(f.form, f.ctx);
  const targetCurrency = accountCurrency(f.ctx.state, f.form.related_account_id);
  const sent = money(f.form, "amount", currencyOf(currency).decimals);
  const received = money(f.form, "related_amount", currencyOf(targetCurrency).decimals);
  const implied = crossCurrency ? impliedRate(sent, currency, received, targetCurrency) : null;
  return <>
    {account && <FormContextNote>Saldo atual: {format(account.current_balance_cents, currency)}</FormContextNote>}
    <ChoiceField f={f} name="kind" label="Tipo" variant="cards" columns={2} options={optionsOf(bankEntryKindLabels, BANK_ENTRY_KINDS)} icons={BANK_KIND_ICONS} disabledOptions={canTransfer ? undefined : ["transfer_out"]}
      hint={canTransfer ? undefined : TRANSFER_UNAVAILABLE} />
    {kind === "transfer_out" && <SelectField f={f} name="related_account_id" label="Conta de destino" required options={accountOptions(f.ctx.state, account?.id ?? Number(f.form.account_id))} emptyLabel="Selecione a conta" icon={accountIcon(f.ctx.state)} />}
    <FormGrid>
      <DateField f={f} name="date" label="Data" required />
      <MoneyField f={f} name="amount" label={adjustment ? "Novo saldo" : crossCurrency ? "Valor enviado" : "Valor"} required allowNegative={adjustment} currency={currency}
        hint={adjustment ? "Saldo total da conta após o ajuste; pode ser negativo." : undefined} />
    </FormGrid>
    {crossCurrency && <div className="transfer-conversion">
      <MoneyField f={f} name="related_amount" label="Valor recebido na conta destino" required currency={targetCurrency}
        hint={`Contas em moedas diferentes: informe quanto entrou em ${currencyOf(targetCurrency).name}.`} />
      <p className="transfer-rate" aria-live="polite">
        <CurrencyIcon code={currency} size={18} decorative /><ArrowRight size={14} aria-hidden="true" /><CurrencyIcon code={targetCurrency} size={18} decorative />
        <span>{implied ?? `${currency} → ${targetCurrency}: informe os dois valores para ver a cotação usada.`}</span>
      </p>
    </div>}
    <TextField f={f} name="description" label="Descrição" maxLength={160} />
    <TextAreaField f={f} name="notes" label="Observações" maxLength={500} />
  </>;
}

import type { ModalKind } from "../../types";
import { cardForm, categoryForm, invoicePaymentForm, subscriptionChargeForm, subscriptionForm } from "../catalog/forms";
import { monthCloseForm } from "../closing/forms";
import { billForm, billPaymentForm, goalEntryForm, goalForm } from "../planning/forms";
import { transactionForm } from "../transactions/forms";
import { bankAccountForm, bankEntryForm, investmentEntryForm, investmentForm } from "../wealth/forms";
import type { RecordFormDefinition } from "./types";

export const recordForms: Record<ModalKind, RecordFormDefinition> = {
  transaction: transactionForm,
  bill: billForm,
  "bill-payment": billPaymentForm,
  goal: goalForm,
  "goal-entry": goalEntryForm,
  investment: investmentForm,
  "investment-entry": investmentEntryForm,
  card: cardForm,
  "bank-account": bankAccountForm,
  "bank-entry": bankEntryForm,
  category: categoryForm,
  subscription: subscriptionForm,
  "subscription-charge": subscriptionChargeForm,
  "invoice-payment": invoicePaymentForm,
  "month-close": monthCloseForm,
};

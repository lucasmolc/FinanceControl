import type { FinanceState } from "../../types";

export const TRANSFER_UNAVAILABLE = "Cadastre outra conta para transferir.";

/** True when another active account can receive a transfer from `accountId` (MEL-02). */
export const hasTransferTarget = (state: FinanceState, accountId: number): boolean =>
  state.bank_accounts.some(account => account.id !== accountId && account.active !== false);

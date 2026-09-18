import { describe, expect, it } from "vitest";
import type { CardInvoiceRow, ChecklistItem } from "../../types";
import { monthPendencies, pendencyCountText } from "./closingModel";

const bill = (id: number, name: string, amount_cents: number, paid: boolean, due_day = 10) => ({ id, name, amount_cents, paid, due_day }) as unknown as ChecklistItem;
const invoice = (card_id: number, month: string, total_cents: number, status: string, paid: CardInvoiceRow["paid"] = null) =>
  ({ card_id, card_name: "Nubank", month, total_cents, status, paid, due_date: `${month}-10` }) as unknown as CardInvoiceRow;

describe("pendências do fechamento (R4-LANC-3)", () => {
  it("lista faturas e contas não pagas com o total", () => {
    const pending = monthPendencies(
      [bill(1, "Aluguel", 320_000, true), bill(2, "Internet", 19_900, false, 20)],
      [invoice(9, "2026-08", 102_300, "vencida"), invoice(9, "2026-07", 50_000, "paga"), invoice(8, "2026-08", 0, "fechada")],
    );
    expect(pending.items.map(item => item.name)).toEqual(["Fatura Nubank · Agosto/2026", "Internet"]);
    expect(pending.totalCents).toBe(122_200);
    expect(pendencyCountText(pending)).toBe("1 fatura e 1 conta não pagas");
  });

  it("singular e plural", () => {
    expect(pendencyCountText({ bills: 1, invoices: 0 })).toBe("1 conta não paga");
    expect(pendencyCountText({ bills: 2, invoices: 0 })).toBe("2 contas não pagas");
    expect(pendencyCountText({ bills: 0, invoices: 2 })).toBe("2 faturas não pagas");
  });
});

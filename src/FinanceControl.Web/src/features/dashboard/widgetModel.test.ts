import { describe, expect, it } from "vitest";
import { hiddenWidgets, moveWidget, moveWidgetTo, setWidgetVisible, tickerCodes, visibleWidgets } from "./widgetModel";

describe("widgets do painel (MEL-30/38)", () => {
  it("usa a ordem salva, ignora ids desconhecidos e lista os ocultos na ordem padrão", () => {
    const saved = ["metas", "futuro", "saldo", "metas"];
    expect(visibleWidgets(saved)).toEqual(["metas", "saldo"]);
    expect(hiddenWidgets(saved).slice(0, 3)).toEqual(["fluxo", "contas", "categorias"]);
  });

  it("move, arrasta, oculta e mostra preservando ids desconhecidos", () => {
    const saved = ["saldo", "fluxo", "contas", "futuro"];
    expect(moveWidget(saved, "contas", -1)).toEqual(["saldo", "contas", "fluxo", "futuro"]);
    expect(moveWidget(saved, "saldo", -1)).toEqual(["saldo", "fluxo", "contas", "futuro"]);
    expect(moveWidgetTo(saved, "contas", "saldo")).toEqual(["contas", "saldo", "fluxo", "futuro"]);
    expect(setWidgetVisible(saved, "fluxo", false)).toEqual(["saldo", "contas", "futuro"]);
    expect(setWidgetVisible(saved, "metas", true)).toEqual(["saldo", "fluxo", "contas", "futuro", "metas"]);
  });

  it("cotações de referência mais as moedas que a pessoa tem", () => {
    expect(tickerCodes(["USD", "GBP", "BRL"])).toEqual(["USD", "EUR", "BTC", "GBP"]);
  });
});

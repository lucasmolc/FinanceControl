import { useState } from "react";
import { CandlestickChart } from "lucide-react";
import { api } from "../../api/client";
import { OFFLINE_REASON } from "../../api/insights";
import { Switch } from "../../components/ui/Switch";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import type { FinanceState, Notify, PageId } from "../../types";
import { LinkedGoalBadge, LinkedGoalStatus } from "./LinkedGoal";
import { MobileCollapse } from "./MobileCollapse";
import { reserveFormula } from "./settingsModel";

interface SectionProps {
  state: FinanceState;
  refresh: () => Promise<void>;
  notify: Notify;
  onError: (reason: unknown) => void;
  navigate?: (page: PageId) => void;
  /** R1 decision 4: the local server is unreachable (actions disabled). */
  offline?: boolean;
}

/**
 * Configurações › Reserva de emergência (MEL-43): target = net salary × months, kept in ONE linked goal.
 * CR-22: the amount is calculated once, in "Perfil e planejamento"; here only the link, the goal progress and the switch.
 */
export function ReserveSection({ state, refresh, notify, onError, navigate, offline = false }: SectionProps) {
  const fmt = useMoneyFormat();
  const { settings } = state;
  const [busy, setBusy] = useState(false);
  const formula = reserveFormula(settings.monthly_net_income_cents, settings.emergency_months_target, value => fmt(value));
  const auto = settings.emergency_goal_auto !== false;
  const status = settings.emergency_goal_status ?? (settings.emergency_goal_id ? "linked" : "none");
  const goal = settings.emergency_goal_id ? state.goals.find(item => item.id === settings.emergency_goal_id) : undefined;

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      notify(message);
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  };

  return <section className="card settings-reserve" aria-labelledby="reserve-title" aria-busy={busy || undefined}>
    <div className="card-header">
      <div><h2 id="reserve-title" tabIndex={-1}>Reserva de emergência</h2><p className="muted">Uma única meta em Metas acompanha o salário: meses de reserva × salário líquido. O cálculo fica em Perfil e planejamento.</p></div>
      <LinkedGoalBadge status={status} />
    </div>
    <MobileCollapse section="reserva" summary="Ver a meta vinculada e o cálculo automático" open={busy}>
    <LinkedGoalStatus noun="meta de reserva" status={status} goal={goal} canCreate={formula !== null}
      missing="Informe o salário líquido em Perfil e planejamento para criar a meta." auto={auto} busy={busy} disabledReason={offline ? OFFLINE_REASON : undefined}
      onCreate={() => void run(() => api.createEmergencyGoal(), "Meta de reserva criada e vinculada ao salário.")}
      onAuto={on => void run(() => api.settings({ emergency_goal_auto: on }), on ? "Cálculo automático da reserva ligado." : "Cálculo automático desligado: o valor-alvo da meta não muda mais com o salário.")}
      switchLabel="Calcular a reserva automaticamente" autoDescription="Quando o salário ou os meses mudam, o valor-alvo da meta acompanha. O nome e o valor guardado nunca mudam."
      navigate={navigate} />
    </MobileCollapse>
  </section>;
}

/** Configurações › Mercado (MEL-27): automatic refresh switch and a shortcut to refresh now on the Mercado page. */
export function MarketSection({ state, refresh, notify, onError, navigate, offline = false }: SectionProps) {
  const [busy, setBusy] = useState(false);
  const on = state.settings.market_auto_refresh !== false;
  const setAuto = async (next: boolean) => {
    setBusy(true);
    try {
      await api.settings({ market_auto_refresh: next });
      await refresh();
      notify(next ? "Atualização automática das cotações ligada." : "Atualização automática das cotações desligada.");
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  };
  // R2-CFG-2: one row (the switch) plus a shortcut in the header; the details live on the Mercado page.
  return <section className="card settings-market" aria-labelledby="market-title">
    <div className="card-header">
      <div><h2 id="market-title" tabIndex={-1}>Mercado</h2><p className="muted">Cotações e indicadores de fontes públicas. Nenhum dado seu é enviado.</p></div>
      <a className="btn small" href="#/mercado" onClick={event => { if (!navigate) return; event.preventDefault(); navigate("market"); }}>
        <CandlestickChart size={14} aria-hidden="true" />Abrir Mercado
      </a>
    </div>
    <ul className="pref-list">
      <li className="pref-row">
        <span className="pref-text"><b>Atualizar automaticamente</b><small className="muted">Ao abrir o app e a cada 6 horas.</small></span>
        <Switch aria-label="Atualizar cotações automaticamente" checked={on} disabled={busy || offline} onChange={next => void setAuto(next)} />
      </li>
    </ul>
  </section>;
}

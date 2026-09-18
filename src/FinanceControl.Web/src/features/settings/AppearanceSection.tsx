import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Badge, Money } from "../../components/ui";
import { Segmented } from "../../components/ui/Segmented";
import { KpiDelta } from "../../components/ui/Stat";
import { Switch } from "../../components/ui/Switch";
import { usePreferences } from "../../hooks/usePreferences";
import { ACCENTS, accentLabels, DENSITIES, densityLabels, THEMES, themeLabels, type DashboardWidgetId } from "../../lib/preferences";
import type { UiPreferences } from "../../types";
import { defaultWidgets, hiddenWidgets, moveWidget, setWidgetVisible, visibleWidgets, widgetLabel } from "../dashboard/widgetModel";

const themeHints: Record<string, string> = {
  noite: "Padrão, azul-noite", esmeralda: "Verde profundo", ouro: "Tons quentes", grafite: "Neutro", claro: "Fundo claro", sistema: "Segue o sistema",
};

function PrefRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <li className="pref-row">
    <span className="pref-text"><b>{title}</b><small className="muted">{description}</small></span>
    {children}
  </li>;
}

/** Live preview of the chosen theme/accent/density (uses the real tokens, so it is the current look). */
function AppearancePreview() {
  return <div className="appearance-preview" aria-hidden="true">
    <span className="appearance-preview-tag">Exemplo</span>
    <div className="appearance-preview-hero">
      <span className="hero-label">Patrimônio (exemplo)</span>
      <strong className="appearance-preview-value"><Money cents={4_823_150} /></strong>
      <span className="row"><KpiDelta value={0.042} /><span className="muted">desde o mês passado</span></span>
    </div>
    <div className="appearance-preview-side">
      <svg className="appearance-preview-chart" viewBox="0 0 120 40" preserveAspectRatio="none" focusable="false">
        <path d="M0 34 L20 28 L40 30 L60 20 L80 14 L100 16 L120 6 L120 40 L0 40 Z" fill="var(--chart-1)" fillOpacity="0.14" />
        <path d="M0 34 L20 28 L40 30 L60 20 L80 14 L100 16 L120 6" fill="none" stroke="var(--chart-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="row"><button type="button" className="btn small primary" tabIndex={-1}>Ação principal</button><Badge tone="positive">Dentro do limite</Badge></span>
    </div>
  </div>;
}

/** Configurações › Aparência (MEL-30): theme, accent, density, animations, privacy, ticker and dashboard widgets. */
export function AppearanceSection({ onError }: { onError: (reason: unknown) => void }) {
  const { preferences, update } = usePreferences();
  const save = (patch: Partial<UiPreferences>) => { update(patch).catch(onError); };
  const saved = preferences.dashboard_widgets;
  const shown = visibleWidgets(saved);
  const rows: { id: DashboardWidgetId; visible: boolean }[] = [...shown.map(id => ({ id, visible: true })), ...hiddenWidgets(saved).map(id => ({ id, visible: false }))];

  return <section className="card settings-appearance" aria-labelledby="appearance-title">
    <div className="card-header"><div><h2 id="appearance-title" tabIndex={-1}>Aparência</h2><p className="muted">As mudanças valem na hora e ficam salvas neste computador e no seu banco de dados.</p></div></div>
    <div className="appearance-grid">
      <div className="appearance-group" role="group" aria-labelledby="theme-title">
        <h3 id="theme-title">Tema</h3>
        <div className="theme-picker">
          {THEMES.map(theme => <button type="button" key={theme} className="theme-swatch" data-value={theme} aria-pressed={preferences.theme === theme} onClick={() => save({ theme })}>
            <span className="theme-swatch-label"><b>{themeLabels[theme]}</b><small className="muted">{themeHints[theme]}</small></span>
          </button>)}
        </div>
      </div>

      <div className="appearance-group" role="group" aria-labelledby="accent-title">
        <h3 id="accent-title">Cor de destaque</h3>
        <p>Usada em botões, foco, seleção e na primeira cor dos gráficos.</p>
        <div className="accent-picker">
          {ACCENTS.map(accent => <button type="button" key={accent} className="accent-swatch" data-value={accent} aria-pressed={preferences.accent === accent} onClick={() => save({ accent })}>
            <span>{accentLabels[accent]}</span>
          </button>)}
        </div>
      </div>

      <AppearancePreview />

      <ul className="pref-list">
        <PrefRow title="Densidade" description="Compacto mostra mais linhas por tela.">
          <Segmented aria-label="Densidade" size="sm" value={preferences.density} onChange={value => save({ density: value as UiPreferences["density"] })}
            options={DENSITIES.map(density => ({ value: density, label: densityLabels[density] }))} />
        </PrefRow>
        <PrefRow title="Animações" description="Transições, contagem dos valores e desenho dos gráficos. O sistema pode reduzir o movimento.">
          <Switch aria-label="Animações" checked={preferences.animations} onChange={animations => save({ animations })} />
        </PrefRow>
        <PrefRow title="Ocultar valores" description="Troca os valores por “R$ •••••” em todas as telas. Também pelo olho no topo.">
          <Switch aria-label="Ocultar valores" checked={preferences.hide_values} onChange={hide_values => save({ hide_values })} />
        </PrefRow>
        <PrefRow title="Cotações no painel" description="Faixa com dólar, euro, bitcoin e as moedas que você tem, no topo da Visão geral.">
          <Switch aria-label="Cotações no painel" checked={preferences.show_market_ticker} onChange={show_market_ticker => save({ show_market_ticker })} />
        </PrefRow>
      </ul>

      {/* R1-CFG-6: the 13 widget rows stay one click away (the page was a 4 000 px wall). */}
      <details className="appearance-group widgets-details">
        <summary><span className="widgets-summary-title">Widgets da Visão geral</span><span className="muted">{shown.length} de {rows.length} visíveis</span></summary>
        <div className="row widgets-details-head">
          <p>Escolha o que aparece no painel e em que ordem. Também dá para arrastar direto no painel em “Personalizar painel”.</p>
          <button type="button" className="btn small ghost" onClick={() => save({ dashboard_widgets: defaultWidgets() })}><RotateCcw size={14} aria-hidden="true" />Restaurar padrão</button>
        </div>
        <ol className="widget-toggle-list" aria-label="Widgets do painel">
          {rows.map(({ id, visible }) => {
            const index = shown.indexOf(id);
            const label = widgetLabel(id);
            return <li key={id} className={`widget-toggle${visible ? "" : " is-hidden"}`}>
              <span className="widget-toggle-position" aria-hidden="true">{visible ? index + 1 : "–"}</span>
              <span className="widget-toggle-name">{label}</span>
              <span className="widget-toggle-moves">
                <button type="button" className="icon-btn" aria-label={`Mover ${label} para cima`} disabled={!visible || index === 0} onClick={() => save({ dashboard_widgets: moveWidget(saved, id, -1) })}><ChevronUp size={16} aria-hidden="true" /></button>
                <button type="button" className="icon-btn" aria-label={`Mover ${label} para baixo`} disabled={!visible || index === shown.length - 1} onClick={() => save({ dashboard_widgets: moveWidget(saved, id, 1) })}><ChevronDown size={16} aria-hidden="true" /></button>
              </span>
              <Switch aria-label={`Mostrar ${label}`} checked={visible} onChange={on => save({ dashboard_widgets: setWidgetVisible(saved, id, on) })} />
            </li>;
          })}
        </ol>
      </details>
    </div>
  </section>;
}

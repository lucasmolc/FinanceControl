---
name: "LMM Finance Control"
description: "Cofre Noturno: um painel financeiro pessoal, local e sereno, em noite profunda com esmeralda e ouro."
colors:
  # Tema padrão (noite + destaque esmeralda). Os demais temas/destaques estão em styles/themes.css e na seção Themes.
  background: "#05080e"
  surface: "#0a0f17"
  surface-raised: "#0e1520"
  surface-control: "#16202e"
  card-end: "#0a1019"
  field: "#070b12"
  field-border: "#5a6983"
  field-border-hover: "#7282a0"
  border: "#1c2636"
  border-strong: "#2f3c52"
  border-hover: "#435373"
  text: "#f2f5f9"
  text-soft: "#cad3df"
  text-muted: "#9ca9bc"
  placeholder: "#8492a8"
  primary: "#3ddc97"
  primary-strong: "#2fd08f"
  primary-strong-hover: "#26bb7f"
  on-primary: "#03140d"
  focus-ring: "#6ee7b7"
  positive: "#34d399"
  money-green: "#2bd48f"
  danger: "#ff7d87"
  warning: "#f5a524"
  gold: "#e8c468"
  info: "#7cc4ff"
  # Temas escuros alternativos (fundo / painel elevado)
  esmeralda-background: "#030c09"
  esmeralda-surface-raised: "#091a14"
  ouro-background: "#0c0905"
  ouro-surface-raised: "#18130b"
  grafite-background: "#09090b"
  grafite-surface-raised: "#161619"
  # Tema claro
  claro-background: "#f2f5f1"
  claro-surface-raised: "#ffffff"
  claro-surface-control: "#e9eee8"
  claro-text: "#0c1511"
  claro-text-muted: "#55635b"
  claro-positive: "#036c48"
  claro-danger: "#c0283a"
  claro-warning: "#9a5800"
  claro-gold: "#865f00"
  # Destaques (tema escuro)
  accent-indigo: "#8f9bff"
  accent-violeta: "#b9a2ff"
  accent-ciano: "#4fd4e8"
  accent-rosa: "#ff90c1"
  accent-ouro: "#e9c46a"
  # Paleta de gráficos (escuro / claro), anel na ordem validada
  chart-blue: "#5d80ef"
  chart-emerald: "#03af73"
  chart-violet: "#9a6cdf"
  chart-orange: "#da6c1e"
  chart-cyan: "#00a5c1"
  chart-gold: "#b68e05"
  chart-pink: "#d95c9a"
  chart-lime: "#72a62a"
  # Marca (logo) e arte fixa (chip e bandeiras do cartão visual; tinta preta de máscaras)
  brand-emerald: "#1fcf8e"
  brand-mid: "#7fd07a"
  brand-gold: "#ecc55e"
  brand-ink: "#05130d"
  chip-light: "#f3dc8e"
  chip-mid: "#c9a14a"
  chip-end: "#f0d58a"
  network-mastercard-red: "#eb001b"
  network-mastercard-amber: "#f79e1b"
  network-elo: "#111111"
  network-hipercard: "#b3131b"
  ink-black: "#000000"
  # Paleta dos ícones de categoria (lib/icons.ts, cor sugerida por grupo; escolha do usuário, fora dos tokens de tema — CR-30)
  icon-moradia: "#5b8def"
  icon-alimentacao: "#f08a4b"
  icon-transporte: "#e0b341"
  icon-saude: "#ef6b7b"
  icon-educacao: "#8f7cf6"
  icon-lazer: "#e56fc2"
  icon-compras: "#4fb7d6"
  icon-pets: "#c99a6b"
  icon-servicos: "#6fa8ff"
  icon-familia: "#f29fb5"
  icon-financas: "#9aa7bd"
  icon-receitas: "#4bd5b5"
  icon-investimentos: "#57c785"
  icon-outros: "#a3aec0"
typography:
  hero:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(34px, 3.2vw + 14px, 52px)"
    fontWeight: 760
    lineHeight: "1.02"
    letterSpacing: "-0.045em"
    fontFeature: "tnum"
  brand:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 780
    lineHeight: "1"
    letterSpacing: "-0.035em"
  display:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 760
    lineHeight: "1.12"
    letterSpacing: "-0.035em"
  metric:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 760
    lineHeight: "1.15"
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 720
    lineHeight: "1.3"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "1.3"
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.5"
  data:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "1.45"
    fontFeature: "tnum"
  meta:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.45"
  label:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "1.5"
  micro:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: "1.6"
    letterSpacing: "0.1em"
  micro-dock:
    fontFamily: "Inter Variable, Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: "1.1"
rounded:
  xs: "3px"
  sm: "8px"
  field: "10px"
  md: "12px"
  lg: "18px"
  xl: "22px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "32px"
  "8": "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.on-primary}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    size: "34px"
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "20px"
  hero-balance:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.hero}"
    rounded: "{rounded.xl}"
    padding: "24px 32px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
    height: "42px"
  badge:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  toast:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    padding: "12px"
  dialog:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: LMM Finance Control v1.3

## Overview

**Creative North Star: "Cofre Noturno"** — um cofre de vidro em uma noite sem ruído. A base é noite profunda; o dinheiro aparece como luz esmeralda (ganho, ação) e ouro (conquista, marca); o vidro separa camadas sem peso; os números são nítidos, tabulares e grandes onde decidem algo.

Operate mode: a pessoa vem cumprir tarefas (lançar, conferir, decidir). A expressão vive nos detalhes que se repetem com propósito — o número do patrimônio com a malha esmeralda/ouro que respira devagar, o traço do gráfico da marca desenhando a subida, os cartões de crédito como objetos. Profissional, nunca lúdico; movimento sutil (150–400 ms, ease-out) e sempre opcional.

Implementação (`src/styles.css`, em cascade layers `theme → base → app → components → adapt`): `tokens.css` (primitivos e tokens derivados), `themes.css` (valores por `[data-theme]`/`[data-accent]`, moedas), `base.css`, `motion.css`, `shell.css`, `components.css`, `forms.css`, `tables.css`, `feedback.css` (toasts), `dataviz.css` (hero, ticker, widgets, gráficos, relatórios, projeções, mercado), `finance.css` (logos, moedas, cartão visual, débito automático, fechamento, faturas, metas), `features.css`, `appearance.css` (Aparência) e `touch.css`. A biblioteca `src/styles/ui.css` (MEL-42) entra na layer `components`, depois de `app`.

**Key Characteristics:**

- Noite profunda com aurora esmeralda/ouro fixa no topo do canvas; superfícies em vidro (translúcidas, borda-luz de 1px, sem blur nos cartões).
- Esmeralda = ação padrão e ganho; ouro = marca e conquistas; coral = perda/risco; âmbar = atenção.
- Números fortes: `tnum` em tudo que é valor, hero de 34–52px com tracking −0.045em.
- Cinco temas, seis destaques, densidade e movimento configuráveis — todos AA verificados.

## Themes

Aplicados no `<html>` (FE-Core): `data-theme`, `data-accent`, `data-density`, `data-motion="on|off"`, `data-hide-values`. Sem atributo = noite + esmeralda. `sistema` segue `prefers-color-scheme` (claro/noite) também só com CSS.

| Tema | `--bg` | `--panel-2` | `--panel-3` | `--text` | `--muted` | ganho / perda / atenção / ouro |
|---|---|---|---|---|---|---|
| noite (padrão) | #05080e | #0e1520 | #16202e | #f2f5f9 | #9ca9bc | #34d399 / #ff7d87 / #f5a524 / #e8c468 |
| esmeralda | #030c09 | #091a14 | #10281f | #eefaf4 | #95b8a8 | #3ee0a0 / #ff8189 / #f5a524 / #e9c86c |
| ouro | #0c0905 | #18130b | #241d12 | #fbf6ea | #b8aa8f | #45d49b / #ff8479 / #f59e2a / #f0cc6e |
| grafite | #09090b | #161619 | #202024 | #f4f4f5 | #a3a3ad | #34d399 / #fb7185 / #f5a524 / #e3c270 |
| claro | #f2f5f1 | #ffffff | #e9eee8 | #0c1511 | #55635b | #036c48 / #c0283a / #9a5800 / #865f00 |

| Destaque | escuro `--accent` / `--accent-strong` / `--on-accent` | claro `--accent` / `--accent-strong` / `--on-accent` | gráfico começa em |
|---|---|---|---|
| esmeralda (padrão) | #3ddc97 / #2fd08f / #03140d | #047857 / #047857 / #fff | esmeralda |
| indigo | #8f9bff / #5b67ea / #fff | #4450d4 / #4450d4 / #fff | azul |
| ouro | #e9c46a / #e6bb4f / #1b1304 | #7d5800 / #d9a834 / #1b1304 | ouro |
| violeta | #b9a2ff / #7b5cf0 / #fff | #6a3dd4 / #6a3dd4 / #fff | violeta |
| ciano | #4fd4e8 / #2bc3dc / #03161b | #0b6f8a / #0b6f8a / #fff | ciano |
| rosa | #ff90c1 / #c2336c / #fff | #b8175a / #b8175a / #fff | rosa |

Densidade `compacto`: `--space-3…8`, `--control-h` 42→36, `--btn-h` 40→34, `--btn-h-sm` 32→28, `--icon-btn` 34→30, `--row-h` 52→42, `--card-pad` 20→16, `--cell-pad-y` 12→8. Em ponteiro grosso os alvos continuam ≥ 44px.

## Colors

Tokens públicos (nomes estáveis; lista completa no topo de `tokens.css`): superfícies `--bg --panel --panel-2 --panel-3 --line --line-strong --glass --glass-strong --glass-border --glow`; texto `--text --text-soft --muted`; ação `--accent --accent-strong --accent-strong-hover --accent-soft --accent-line --accent-text --on-accent --focus-ring --accent-2`; sinais `--positive --positive-soft --danger --danger-soft --warning --warning-soft --gain --loss --gold --gold-soft --money-green --info`; superfícies de feedback `--positive-surface --danger-surface --warning-surface --info-surface` (+ `--*-text`); gradientes `--gradient-hero --gradient-brand --gradient-sheen`; gráficos `--chart-1…8 --chart-grid --chart-axis --chart-surface`; moedas `--currency-<code> --on-currency-<code>`. Os derivados (`-soft`, `-line`, `-surface`, `-text`, `--panel-hover`, `--track`…) são `color-mix(in srgb, …)` sobre os valores do tema — trocar tema/destaque troca tudo.

### Primary

- **Esmeralda de Ação** (`--accent`, padrão #3ddc97; forte #2fd08f com texto #03140d, 9,5:1): botão primário, foco, item ativo da navegação, links. O destaque é configurável; a regra é a mesma para qualquer um.

### Secondary

- **Verde-Dinheiro** (`--money-green` #2bd48f) e **Ganho** (`--gain` = `--positive` #34d399): malha do hero, saldo positivo, receitas, progresso.
- **Ouro** (`--gold` #e8c468): marca, metas atingidas, conquistas, reserva completa. Nunca para ação ou aviso.

### Tertiary

- **Âmbar** (`--warning` #f5a524): perto do limite, vence em breve, mês fechado.
- **Coral** (`--loss` = `--danger` #ff7d87): perda, estouro, erro, remoção.

### Neutral

Noite em três camadas (`--panel` sidebar/tabelas, `--panel-2` cartões/diálogos, `--panel-3` controles) e vidro (`--glass` = panel-2 a 78%). Texto `#f2f5f9`, suave `#cad3df`, silencioso `#9ca9bc` (≥ 6,5:1 em qualquer camada).

### Contrast

Verificado por script (`scratchpad/design/v12/themes.mjs`, recalcula exatamente as fórmulas `color-mix`): **570 pares por tema** (5 temas × 6 destaques; texto/suave/muted/destaque/ganho/perda/atenção/ouro sobre bg, panel, panel-2, panel-3, card-end, vidro e os piores pontos da malha do hero; on-accent sobre accent-strong e hover; foco ≥ 3:1; placeholder; borda de campo ≥ 3:1; textos de toast/banner sobre superfícies tingidas; hover de linha e cabeçalho de tabela) — **0 falhas**.

| Tema | texto/painel | muted/panel-3 | ganho | perda | atenção | ouro | par mais justo |
|---|---|---|---|---|---|---|---|
| noite | 16,7 | 6,9 | 8,5 | 6,7 | 8,0 | 9,8 | branco sobre violeta forte 4,53 |
| esmeralda | 16,8 | 7,2 | 9,2 | 6,5 | 7,6 | 9,6 | idem 4,53 |
| ouro | 17,1 | 7,3 | 8,8 | 7,0 | 7,8 | 10,8 | idem 4,53 |
| grafite | 16,4 | 6,5 | 8,4 | 6,0 | 8,0 | 9,4 | idem 4,53 |
| claro | 18,6 | 5,4 | 5,5 | 5,0 | 4,7 | 4,9 | destaque esmeralda na malha ouro 4,52 |

(valores de sinal medidos sobre `--panel-3`, a camada mais clara.) Moedas: glifo sobre preenchimento ≥ 4,5:1 nos 13 códigos (mais justo SOL 4,52).

### Named Rules

**The Money Has Two Metals Rule.** Esmeralda age e ganha; ouro celebra e assina. Não inverta, e não use ouro onde âmbar (atenção) é o sinal.

**The Accent Is Chosen Rule.** O destaque é do usuário: código usa `--accent*`, nunca um hex de destaque. Gráficos usam `--chart-*`, que já giram com o destaque.

**The Amber Before Coral Rule.** Âmbar pede decisão; coral é risco, erro ou destruição.

**The Zero Is Neutral Rule.** Zero e neutro usam a cor do texto; tom só por classe, sempre com sinal/ícone/texto (nunca só cor).

**The Glass Has No Blur Inside Rule.** Cartões, estatísticas, seletor de mês e diálogos não usam `backdrop-filter`, `transform` persistente nem `filter`: os popovers da biblioteca são `position: fixed` renderizados inline e seriam reposicionados pelo ancestral. Blur só na sidebar, doca, menu "Mais", tooltip de gráfico e toasts.

## Charts

Método `dataviz`: categorical em anel fixo **azul → esmeralda → violeta → laranja → ciano → ouro → rosa → lima** (cíclico). O destaque escolhe onde o anel começa (`--chart-1`); como toda rotação preserva os vizinhos e o par de volta foi validado, qualquer destaque passa. Validação (adjacente + par de volta, contra `--panel-2` e `--bg` de cada tema): escuro L 0,63–0,665, CVD ΔE pior 12,7 (deutan), visão normal pior 22,7, contraste ≥ 3:1; claro CVD 12,9, normal 21,5, ≥ 3:1.

| Slot (escuro / claro) | azul | esmeralda | violeta | laranja | ciano | ouro | rosa | lima |
|---|---|---|---|---|---|---|---|---|
| hex | #5d80ef / #405ec9 | #03af73 / #008b52 | #9a6cdf / #7444b4 | #da6c1e / #cc6004 | #00a5c1 / #008ba6 | #b68e05 / #a88000 | #d95c9a / #be4282 | #72a62a / #5f9205 |

**Séries financeiras com cor fixa (CR-10).** `seriesColor()` (`components/charts/seriesColors.ts`) é a única fonte das cores de série usadas no Painel, em Relatórios e em Projeções: receitas → `--gain`, despesas → `--loss`, investimentos → `--hue-blue`, resultado → `--text`, patrimônio → `--hue-emerald`, contas → `--hue-violet`. As séries semânticas usam matizes **fixos** (`--hue-*`, que seguem o tema mas não o destaque), porque `--chart-1…8` giram com o destaque e colidiriam com o verde de receitas. Dados categóricos sem significado (categorias, formas de pagamento) seguem `chartColor(i)`.

**Casos-limite (CR-03/09/11).** Uma fatia de 100% vira um anel fechado (dois arcos de 180°); histórico com um só ponto desenha marcador + valor e a nota "O histórico começa neste mês."; domínio sem variação tem um único tique; eixos de dinheiro nunca subdividem abaixo de R$ 1 e não repetem rótulos; barras horizontais limitam os tiques pela largura (≈ 72px por rótulo); sinal antes do símbolo ("-R$ 5 mil", como "-R$ 4.500,00").

Polaridade usa `--gain`/`--loss`; limite `--warning` tracejado (`.chart-ref-line`); ritmo `--muted` pontilhado (`.chart-pace-line`); projeção tracejada (`.is-projection`). Até 6 fatias na rosca + "Outras". Legendas e valores em tokens de texto (nunca na cor da série). Todo gráfico tem tooltip por teclado e `table.chart-table` oculta.

## Typography

Inter Variable (auto-hospedada via `@fontsource-variable/inter`) em tudo. Escala: `--text-3xs` 10 · `2xs` 11 · `xs` 12 · `sm` 13 · `md` 14 · `base` 16 · `lg` 18 · `xl` 22 · `2xl` 26 · `3xl` 30 · `--text-hero` clamp(34–52px). `--numeric` (`"tnum"`) em `.money`, `.num`, `.value`, `.stat-value`, `time`, inputs numéricos, ticker e gráficos.

- **Hero** (760, 34–52px, −0.045em, tabular): patrimônio em `.hero-value`; `.currency`/`.cents` a 50%.
- **Brand** (780, 30–44px): palavra "LMM Finance" da abertura.
- **Display** (760, 30px): `h1` da topbar (26px ≤ 980px, 22px ≤ 620px).
- **Metric** (760, 26px): `.value` de KPI. **Headline** (720, 22px): `h2` de cabeçalho e `.stat-value`. **Title** (700, 18px): `.section-title`, diálogos. **Body** 16px. **Data** 14px. **Meta** 13px. **Label** 12px/600. **Micro** 11px/650 maiúsculas +0.1em (grupos da navegação, cabeçalho de tabela).

**The Numbers Lead Rule.** Valores decisivos em peso forte e algarismos tabulares; explicações recuam em tamanho e cor. **The One Interface Voice Rule.** Uma família; hierarquia por escala e peso.

## Layout

Base 4px (`--space-1…8`). Sidebar de vidro de 256px; conteúdo até 1480px; topbar sticky (≥ 981px) que repinta o canvas atrás de si com máscara de fade (sem `backdrop-filter`). Grids `.grid.cards` 4 col, `.two`, `.three`; `.widget-grid` 3 → 2 (≤ 1200px) → 1 (≤ 760px) com `.span-2`/`.span-full`; `.report-grid` 2 → 1 (≤ 980px). Doca inferior ≤ 980px com `--dock-clearance`; a página nunca rola na horizontal a partir de 320px; `.data-table` vira cartões ≤ 620px.

## Elevation & Depth

Vidro + sombra ambiente com cor do tema (`--shadow-rgb`, intensidade `--shadow-a`: 0,5 escuro / 0,14 claro).

- **Card** (`--shadow-card`): realce interno de 1px no topo + sombra difusa deslocada.
- **Lift** (`--shadow-lift`): cartão clicável em hover (`.ui-card.is-interactive`), com anel `--accent-line`.
- **Float** (`--shadow-float`): doca, toasts, tooltip. **Guided**: tour. **Dialog** (`--shadow-dialog`).

## Shapes

`--radius-xs` 3px (amostras de legenda, marcadores), `--radius-sm` 8px (botões pequenos, ícones, marca), 10px campos, `--radius-md` 12px (botões, toasts, tabelas), `--radius-lg` 18px (cartões, cartão de crédito), `--radius-xl` 22px (hero, diálogos), pílula. Selos de banco/marca: 30% do tamanho; moedas: círculo.

## Motion

Tudo em `styles/motion.css`; tokens `--duration-fast` 120 · `--duration` 160 · `--duration-base` 220 · `--duration-slow` 320 · `--duration-page` 360; `--ease-out` (0.16,1,0.3,1), `--ease-out-brand` (0.22,1,0.36,1), `--ease-out-meet` (0.33,1,0.68,1), `--ease-in-out`; `--stagger` 45ms. **Marca e troca de página (MEL-48):** uma constante (`lib/brandMotion.ts`) espelhada pelos tokens `--motion-brand-intro` 1200 · `--motion-brand-min` 900 · `--motion-brand-max` 1600 · `--motion-brand-settle` 320 · `--motion-brand-leave` 180 · `--motion-brand-fade` 150 · `--motion-page` 300 (`--motion-page-out` 100 + `--motion-page-in` 260 com 40 de atraso) · `--motion-page-loader-delay` 400.

| Momento | Hook | Duração |
|---|---|---|
| Abertura da marca (MEL-48) — só ao abrir o app e ao concluir o setup | `.brand-intro[data-phase=meet→settle→leave]`: `brand-meet-left` (marca, −28vw→0) e `brand-meet-right` (palavra, +28vw→0, blur 6→0) em 440ms com `--ease-out-meet` (o percurso fica visível: 35% aos 100ms, 99% aos 400ms), `.logo-axis` desenha (120–460), `.logo-trend` desenha (280–700), `coin-pop` (600–900), halo; `brand-settle` voa até a marca do shell (FLIP da marca sobre a marca, `--settle-x/y/scale`), fade | ≥ 900ms (encontro ≥ 400 + voo 320 + saída 180), termina assim que os dados chegam, teto 1.600 (dados tardios: só fade; depois do teto, estado estático "Carregando…"). Esc/clique/toque pulam; dica "Toque para pular" em ponteiro grosso. `html[data-intro-phase]` esconde o lockup de destino até a saída (sem palavra dupla). Movimento reduzido: fade de 150ms, sem espera artificial |
| Troca de página (MEL-48) | Sem sobreposição. View Transition só do conteúdo (`::view-transition-old/new(root)`); sidebar, doca e marca mostram só o snapshot novo, sem animação (sem somar as duas imagens); fallback `.page-enter`. `.page-loader` (marca com o traço em loop) só se o chunk da página passar de 400ms | 100 saída / 260 entrada (≤ 300) |
| Troca de mês | `.is-switching` (esmaece e cruza) | 220ms |
| Toasts | `toast-in` / `toast-in-top` (celular) / `toast-out`, `.toast-progress` com `--toast-duration`, pausa em hover/foco/`.is-paused` | 320 / 220ms |
| Skeleton | `.skeleton`, `.skeleton-line` | brilho 1,6s |
| Barras/progresso | `.progress > span` | 700ms |
| Gráficos | `svg.chart-animate`: `.chart-line[pathLength="1"]` desenha, `.chart-bar-rect` cresce da base (`.is-horizontal` da esquerda), `.chart-slice` gira e entra, áreas/bandas/referências em fade | 560–900ms |
| Hero | `.hero-balance::before` malha esmeralda/ouro à deriva | 26s alternado |

Regras: containers animam com `fill-mode: backwards` (nunca `both`/`forwards`) para não deixar `transform` que capture popovers fixos. `prefers-reduced-motion: reduce` **e** `html[data-motion="off"]` zeram animações e transições; abertura e toasts viram fade de opacidade de 150ms; View Transitions desligadas. `.brand-intro.is-static` (animações desligadas na preferência) só faz fade.

## Components

Classes de contrato (CONTRACT §4 + spec §6) continuam válidas; novas marcações:

- **Toast** `.toast-region > .toast.(success|error|info)[.is-leaving|.is-paused] > (.toast-icon + .toast-body > p + .toast-actions > .btn.small.ghost) + .icon-btn + .toast-progress(> span)`. Canto inferior direito; topo no celular (safe-area), até 360px.
- **Hero** `.hero-balance > .hero-label + .hero-value(.count-up) + .hero-meta` (+ `.hero-aside` sparkline, `.hero-actions`). `.kpi-delta.(up|down|flat)` com seta desenhada.
- **Ticker** `.ticker > .ticker-item > (.ui-currency-icon? + .ticker-code + .ticker-value + .ticker-change.(up|down))`, pílula de vidro rolável com fade nas bordas.
- **Widgets** `.widget-grid > .widget.card(.span-2|.span-full)[.is-dragging|.is-drop-target|.is-switching] > .card-header(+ .widget-actions > .widget-handle) + .widget-body` (+ `.widget-footer`, `.forecast(.warning|.danger)`, `.timeline > .timeline-item(.is-overdue|.is-soon|.is-paid)`).
- **Gráficos** `figure.chart.chart-(area|bar|donut|sparkline) > .chart-plot > svg.chart-svg` + `.chart-tooltip` + `.donut-center` + `ul.chart-legend > li.legend-item > .legend-swatch(.line|.dashed)` + `table.chart-table` (oculta; `.is-visible` mostra). Cor de cada série por `--series` inline (paleta `--chart-1…8`).
- **Relatórios** `.report-toolbar`, `.report-custom-range`, `dl.stat-strip.report-kpis`, `.report-grid > .card(.span-2)`, `.report-footnote`.
- **Projeções** `.scenario-panel(.card)` + `.projection-results`; `.scenario-field`, `.range-field > label + input[type=range] (+ --fill) + output`, `.milestones`, `.milestone(.is-reached)`.
- **Mercado** `.market-status`, `.rate-change.(up|down|flat)`, `.converter(.card) > .converter-grid (+ .converter-swap) + output.converter-result + .converter-unit`, `.privacy-note`; genéricos `.market-grid > .market-card`, `.indicator-grid > .indicator`.
- **Logos** `.bank-logo(.size-sm|.size-lg|.size-xl) > img|svg`; os componentes `BrandBadge` (`.bank-logo.ui-brand-badge`, monograma com `--brand-bg`/`--brand-fg`), `CategoryIcon` (`.ui-category-icon`) e `CurrencyIcon` (`.ui-currency-icon[data-currency]`) vêm da biblioteca (`styles/ui/identity.css`); `.currency-chip`.
- **Cartão visual** `.visual-card.network-(visa|mastercard|elo|amex|hipercard|other)[style=--card-color][data-contrast] > .visual-card-top(.visual-card-issuer + .visual-card-network) + .visual-card-chip + .visual-card-number + .visual-card-bottom(.visual-card-name + .visual-card-meta)`. Tinta preta/branca automática por `lch(from --card-color …)`; `data-contrast` força. `.is-compact`.
- **Shell (v1.3)** `a.brand-home` (MEL-49: lockup da sidebar e do topo no celular é um link para `#/painel` via navegação do app, `aria-label="LMM Finance — ir para a Visão geral"`, hover discreto e foco visível) · `.topbar.is-scrolled` (CR-12: faixa de texto opaca, a máscara fica 16px abaixo; linha fina ao rolar) · `.command-palette-trigger > .kbd` ("Ctrl K"/"⌘ K" no desktop com ponteiro fino) · `.dashboard-kpis` (3–4 KPIs numa linha; 2×2 no celular) · `.amount-of` (valor forte + "de R$ …" numa segunda linha) · `.page-error` (falha de uma página fica no conteúdo). Títulos focados por programa (`h1[tabindex=-1]`) não desenham anel (CR-28).
- **Camadas (MEL-46)** Dialog, Drawer e paleta registram-se numa pilha única (`components/layerStack.ts`): Esc e Tab só agem na camada do topo; popovers tratam Esc na captura.
- **Diversos** `.badge.auto-debit`, `.badge.gold`, `.progress.gold|.done|.thin`, `.goal-card.is-achieved`, `.achievement`, `.month-close-bar(.is-closed)`, `.invoice-*`, `.reserve-calculation(.is-removed|.is-empty)`, `.segmented.(small|large|full)`, `.kbd`, `.topbar-brand` (lockup no celular).
- **Aparência** `.theme-picker > button.theme-swatch[aria-pressed][data-value]` (prévia desenhada por CSS) · `.accent-picker > button.accent-swatch[aria-pressed][data-value]` · `.pref-list > .pref-row > .pref-text + controle` · `.widget-toggle-list > .widget-toggle(.is-hidden|.is-dragging)` · `.appearance-preview`. Seleção marcada por forma (círculo com check vazado), não só cor.

### Logo

Marca v2: quadrado 9/32 com gradiente **esmeralda #1fcf8e → #7fd07a → ouro #ecc55e**, eixo em "L" (livro-caixa), linha ascendente e uma **moeda** na ponta, em tinta #05130d (9,4:1 no esmeralda, 11,5:1 no ouro). ≤ 20px usa a geometria de traço grosso do favicon, sem moeda. Paths com `pathLength=1` e classes `logo-axis`/`logo-trend`/`logo-coin` para a animação. `public/favicon.svg`, `favicon.ico` (16/32/48), `apple-touch-icon.png`, `icon-192/512.png` e `icon-maskable-512.png` regenerados a partir da mesma geometria; manifest/theme-color #05080e.

### Brand badges

Selos de bancos, corretoras e serviços são **monogramas estilizados nas cores de cada marca, não a arte oficial** (nem logotipos registrados). Instituições sem marca conhecida recebem um selo neutro (`.ui-brand-badge.is-generic`: `--panel-3` + glifo de banco/recorrência em `--muted`), nunca iniciais — "AL" ou "DI" pareceriam o logotipo de alguém (CR-29).

### Paleta dos ícones de categoria (CR-30)

`lib/icons.ts` sugere uma cor por grupo de ícone (a pessoa pode trocar no seletor de cor). São cores de **identificação de categoria escolhidas pelo usuário**, fora dos tokens de tema — por isso ficam registradas aqui e não em `--chart-*`: moradia #5b8def · alimentação #f08a4b · transporte #e0b341 · saúde #ef6b7b · educação #8f7cf6 · lazer #e56fc2 · compras #4fb7d6 · pets #c99a6b · serviços #6fa8ff · família #f29fb5 · finanças #9aa7bd · receitas #4bd5b5 · investimentos #57c785 · outros #a3aec0. O ícone de moto é um SVG próprio no mesmo traço do lucide (grade 24, traço 2 arredondado). A logo real só aparece quando a pessoa envia o próprio arquivo (`logo_data`). As bandeiras do cartão visual (Mastercard em dois círculos, Elo, Amex, Hipercard, Visa em texto) seguem a mesma regra: evocação tipográfica/geométrica, não arte oficial.

## Do's and Don'ts

### Do:

- **Do** usar só tokens (`--accent*`, `--chart-*`, `--gain/--loss`) — nenhum hex de tema em código de feature.
- **Do** colocar `tnum` em todo valor e alinhar números à direita.
- **Do** manter um primário por região e o ouro para conquistas.
- **Do** dar a toda animação um caminho sem movimento (`prefers-reduced-motion` e `data-motion=off`).
- **Do** acompanhar cor com sinal, seta desenhada, ícone ou texto.

### Don't:

- **Don't** pôr `backdrop-filter`, `transform` persistente, `filter` ou `will-change` em cartões, diálogos ou contêineres de página (quebra popovers fixos).
- **Don't** usar texto em gradiente, bordas laterais coloridas grossas, sombras duras deslocadas ou glifos Unicode como ícones.
- **Don't** usar ouro/âmbar/coral como decoração, nem repetir a cor de status como "série 4" sem legenda.
- **Don't** empilhar cabeçalhos iguais nem criar sobretítulos acima de títulos.
- **Don't** reproduzir logotipos oficiais de bancos/serviços.

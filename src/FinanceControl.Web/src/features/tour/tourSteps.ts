export interface TourStep {
  target: string;
  title: string;
  content: string;
  /** R4-TOUR-1: copy for touch devices (no keyboard shortcuts). */
  touchContent?: string;
  /** App chrome (dock "+", search, navigation), not page content: on phones these steps come after the page ones. */
  chrome?: boolean;
}

/** At most this many steps per tour (R1-TOUR-1: short enough to finish). */
export const TOUR_MAX_STEPS = 7;

/**
 * Candidate steps in display order; only those whose target is on screen are shown (the first `TOUR_MAX_STEPS`).
 * A target may list alternatives ("a, b"): the first one that is displayed wins (sidebar on desktop, topbar on phones).
 */
export const tourSteps: TourStep[] = [
  { target: ".tour-activation", title: "Primeiro passo", content: "Comece por aqui: defina renda e teto de gastos ou registre o primeiro lançamento do mês." },
  { target: ".tour-summary", title: "Resumo do mês", content: "Renda, gastos, quanto ainda cabe no teto de gastos e seu patrimônio. Tudo vale para o mês escolhido no topo: troque o mês para rever meses anteriores." },
  { target: ".quick-add, .quick-add-icon", title: "Registrar um lançamento", content: "Receitas, despesas e aportes entram por aqui, de qualquer página. O atalho do teclado aparece no próprio botão.", touchContent: "Toque no + para registrar receitas, despesas e aportes de qualquer página.", chrome: true },
  { target: ".command-palette-trigger", title: "Buscar e comandos", content: "Ctrl K (⌘ K no Mac) abre a busca: vá para qualquer página, crie registros ou encontre um lançamento sem tirar as mãos do teclado.", touchContent: "Toque na lupa para ir a qualquer página, criar um registro ou encontrar um lançamento.", chrome: true },
  { target: ".tour-plan", title: "Seu plano", content: "Quanto do limite de gastos fixos e do limite de lazer você já usou no mês, e se o investimento mínimo foi atingido." },
  { target: ".tour-checklist", title: "Próximos vencimentos", content: "Marque cada conta como paga: o pagamento vira uma despesa do mês e pode ser desfeito. Contas em débito automático são lançadas sozinhas." },
  { target: ".tour-goals", title: "Metas", content: "Acompanhe quanto falta para cada objetivo e registre aportes direto do painel." },
  { target: ".dashboard-customize", title: "Seu painel, do seu jeito", content: "Mostre, oculte e reordene os gráficos e listas do painel. A escolha fica salva nas suas preferências." },
  { target: ".tour-nav", title: "Navegação", content: "Os demais módulos ficam aqui. Cadastre contas, cartões, investimentos e categorias quando fizerem sentido.", chrome: true },
];

/** False when the element or an ancestor is hidden with display:none / visibility:hidden. */
function isDisplayed(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

/** First displayed element for the step's target (alternatives separated by commas), or null. */
export function findTarget(step: TourStep, root: ParentNode = document): Element | null {
  for (const element of Array.from(root.querySelectorAll(step.target))) if (isDisplayed(element)) return element;
  return null;
}

/** True when the element or an ancestor is fixed/sticky (dock, sticky topbar): scrolling the page does not move it. */
export function isPinned(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const { position } = window.getComputedStyle(node);
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

/**
 * Steps whose target currently exists and is displayed (at most `TOUR_MAX_STEPS`, picked in priority order).
 * R4-TOUR-1: with `byPosition` (phones) the page steps follow their position on the page, top to bottom, so the tour
 * only scrolls down; the app chrome steps come last (pinned ones — the dock "+" — need no scrolling at all).
 */
export function availableSteps(root: ParentNode = document, byPosition = false): TourStep[] {
  const picked = tourSteps.filter(step => findTarget(step, root) !== null).slice(0, TOUR_MAX_STEPS);
  if (!byPosition) return picked;
  const placed = picked.map(step => {
    const target = findTarget(step, root)!;
    return { step, chrome: Boolean(step.chrome) || isPinned(target), top: target.getBoundingClientRect().top };
  });
  const page = placed.filter(entry => !entry.chrome).sort((a, b) => a.top - b.top);
  return [...page, ...placed.filter(entry => entry.chrome)].map(entry => entry.step);
}

/** True on touch-first devices, where keyboard hints make no sense. */
export function isTouchDevice(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches;
}

/** The step's copy for this device. */
export function stepContent(step: TourStep, touch: boolean): string {
  return touch && step.touchContent ? step.touchContent : step.content;
}

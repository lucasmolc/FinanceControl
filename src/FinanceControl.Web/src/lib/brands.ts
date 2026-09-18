import { hslToHex } from "../components/ui/shared/color";
import { aliasMatches, normalizeSearchText } from "./icons";

/**
 * Brand catalog (MEL-33 banks/brokers + MEL-39 services/merchants). Rendered by `BrandBadge`/`BankLogo` as
 * STYLIZED MONOGRAMS in approximate brand colors — never the official logo artwork (users may upload the real
 * logo per record via `logo_data`). Ids are stable (`^[a-z0-9_-]{1,40}$`, stored in `brand` columns).
 * `fg` on `bg` meets WCAG AA (≥ 4.5:1) — enforced by lib/brands.test.ts.
 */
export type BrandKind = "bank" | "service";

export type BrandCategory = "banco" | "corretora" | "cripto" | "pagamentos" | "streaming" | "musica" | "compras" | "mobilidade" | "academia" | "software" | "jogos" | "telefonia" | "utilidades";

export interface BrandDefinition {
  id: string;
  name: string;
  kind: BrandKind;
  category: BrandCategory;
  /** Badge background (#rrggbb). */
  bg: string;
  /** Monogram color (#rrggbb), AA on `bg`. */
  fg: string;
  monogram: string;
  /** Detection aliases (accent/case-insensitive whole words; "=x" = whole text must be x). */
  aliases: string[];
  /** Category glyph id (lib/icons) a record of this brand inherits by default. */
  icon?: string;
}

export const BRAND_CATEGORIES: ReadonlyArray<{ id: BrandCategory; label: string }> = [
  { id: "banco", label: "Bancos" },
  { id: "corretora", label: "Corretoras" },
  { id: "cripto", label: "Cripto" },
  { id: "pagamentos", label: "Pagamentos e contas globais" },
  { id: "streaming", label: "Streaming" },
  { id: "musica", label: "Música" },
  { id: "compras", label: "Compras" },
  { id: "mobilidade", label: "Transporte e comida" },
  { id: "academia", label: "Academias" },
  { id: "software", label: "Software e nuvem" },
  { id: "jogos", label: "Jogos" },
  { id: "telefonia", label: "Telefonia" },
  { id: "utilidades", label: "Energia e água" },
];

type Row = [id: string, name: string, category: BrandCategory, bg: string, fg: string, monogram: string, aliases: string[], icon?: string];

const BANKS: Row[] = [
  ["nubank", "Nubank", "banco", "#820ad1", "#ffffff", "nu", ["nubank", "nu bank", "nu pagamentos", "roxinho", "=nu"]],
  ["itau", "Itaú", "banco", "#ec7000", "#002060", "itaú", ["itau", "itau unibanco", "unibanco", "personnalite", "iti"]],
  ["bradesco", "Bradesco", "banco", "#cc092f", "#ffffff", "B", ["bradesco", "banco next"]],
  ["bb", "Banco do Brasil", "banco", "#fcfc30", "#003da5", "BB", ["banco do brasil", "bb", "ourocard"]],
  ["caixa", "Caixa", "banco", "#005ca9", "#ffffff", "CX", ["caixa", "caixa economica", "caixa economica federal", "cef", "caixa tem"]],
  ["santander", "Santander", "banco", "#d80000", "#ffffff", "S", ["santander"]],
  ["inter", "Inter", "banco", "#ff7a00", "#1f0f00", "inter", ["inter", "banco inter", "bancointer"]],
  ["c6", "C6 Bank", "banco", "#242424", "#ffffff", "C6", ["c6", "c6 bank", "c6bank"]],
  ["btg", "BTG Pactual", "banco", "#0b2a4a", "#ffffff", "BTG", ["btg", "btg pactual"]],
  ["xp", "XP Investimentos", "corretora", "#111111", "#ffd400", "XP", ["xp", "xp investimentos", "xp inc"]],
  ["rico", "Rico", "corretora", "#ff5a00", "#1f0b00", "rico", ["rico", "rico investimentos"]],
  ["clear", "Clear", "corretora", "#00a3e0", "#00121a", "clear", ["clear", "clear corretora"]],
  ["nuinvest", "NuInvest", "corretora", "#820ad1", "#ffffff", "NI", ["nuinvest", "nu invest", "easynvest"]],
  ["modal", "Modal", "banco", "#0a2240", "#ffffff", "M", ["modal", "banco modal", "modalmais"]],
  ["picpay", "PicPay", "pagamentos", "#21c25e", "#04210f", "P", ["picpay", "pic pay"]],
  ["mercadopago", "Mercado Pago", "pagamentos", "#00b1ea", "#00161f", "MP", ["mercado pago", "mercadopago"]],
  ["pagbank", "PagBank", "pagamentos", "#1bb99a", "#031f19", "PB", ["pagbank", "pagseguro", "pag seguro"]],
  ["neon", "Neon", "banco", "#00e5ff", "#062d3c", "neon", ["neon", "banco neon"]],
  ["sicoob", "Sicoob", "banco", "#003641", "#7db61c", "S", ["sicoob"]],
  ["sicredi", "Sicredi", "banco", "#2f7a0c", "#ffffff", "S", ["sicredi"]],
  ["safra", "Safra", "banco", "#0e2240", "#c8a45c", "S", ["safra", "banco safra"]],
  ["wise", "Wise", "pagamentos", "#9fe870", "#163300", "W", ["wise", "transferwise"]],
  ["nomad", "Nomad", "pagamentos", "#ffd000", "#111111", "N", ["nomad"]],
  ["avenue", "Avenue", "corretora", "#0a0a23", "#ffffff", "A", ["avenue", "avenue securities"]],
  ["binance", "Binance", "cripto", "#f0b90b", "#1e2026", "B", ["binance"]],
  ["mercadobitcoin", "Mercado Bitcoin", "cripto", "#ff6b00", "#1f0d00", "MB", ["mercado bitcoin", "mercadobitcoin"]],
  ["genial", "Genial", "corretora", "#1b1464", "#ffffff", "G", ["genial", "genial investimentos"]],
  ["toro", "Toro", "corretora", "#00c28a", "#00261b", "T", ["toro", "toro investimentos"]],
  ["pan", "Banco Pan", "banco", "#0098da", "#00131c", "pan", ["banco pan", "pan"]],
  ["paypal", "PayPal", "pagamentos", "#003087", "#ffffff", "PP", ["paypal", "pay pal"]],
  ["revolut", "Revolut", "pagamentos", "#111111", "#ffffff", "R", ["revolut"]],
];

const SERVICES: Row[] = [
  // streaming
  ["netflix", "Netflix", "streaming", "#141414", "#ff3b44", "N", ["netflix"], "streaming"],
  ["primevideo", "Prime Video", "streaming", "#00a8e1", "#07131a", "PV", ["prime video", "primevideo", "amazon prime video", "amazon prime"], "streaming"],
  ["disneyplus", "Disney+", "streaming", "#0e1d5b", "#ffffff", "D+", ["disney", "disney+", "disney plus", "star+", "star plus"], "streaming"],
  ["max", "Max", "streaming", "#002be7", "#ffffff", "max", ["hbo max", "hbo", "hbomax", "=max"], "streaming"],
  ["globoplay", "Globoplay", "streaming", "#d9002d", "#ffffff", "g", ["globoplay", "globo play"], "streaming"],
  ["appletv", "Apple TV+", "streaming", "#000000", "#ffffff", "tv", ["apple tv", "apple tv+", "appletv"], "streaming"],
  ["paramount", "Paramount+", "streaming", "#0057e1", "#ffffff", "P+", ["paramount", "paramount+", "paramount plus"], "streaming"],
  ["crunchyroll", "Crunchyroll", "streaming", "#f47521", "#1f0c00", "CR", ["crunchyroll"], "streaming"],
  ["youtube", "YouTube Premium", "streaming", "#e00000", "#ffffff", "YT", ["youtube", "youtube premium", "yt premium"], "streaming"],
  // música
  ["spotify", "Spotify", "musica", "#1db954", "#04210f", "S", ["spotify"], "musica-streaming"],
  ["deezer", "Deezer", "musica", "#a238ff", "#ffffff", "dz", ["deezer"], "musica-streaming"],
  ["applemusic", "Apple Music", "musica", "#d91f35", "#ffffff", "♫", ["apple music"], "musica-streaming"],
  // compras
  ["amazon", "Amazon", "compras", "#232f3e", "#ff9900", "a", ["amazon", "amazon com br", "amazon.com.br"], "compras"],
  ["mercadolivre", "Mercado Livre", "compras", "#ffe600", "#2d3277", "ML", ["mercado livre", "mercadolivre", "meli"], "compras"],
  ["shopee", "Shopee", "compras", "#ee4d2d", "#1f0600", "S", ["shopee"], "compras"],
  ["aliexpress", "AliExpress", "compras", "#d42a04", "#ffffff", "AE", ["aliexpress", "ali express"], "compras"],
  ["magalu", "Magalu", "compras", "#0073e6", "#ffffff", "M", ["magalu", "magazine luiza"], "compras"],
  ["shein", "Shein", "compras", "#000000", "#ffffff", "SH", ["shein"], "roupas"],
  // transporte e comida
  ["uber", "Uber", "mobilidade", "#000000", "#ffffff", "U", ["uber", "uber trip", "uber eats"], "taxi"],
  ["99", "99", "mobilidade", "#ffdd00", "#111111", "99", ["99 app", "99app", "99 pop", "99pop", "99 taxi", "99taxis", "=99"], "taxi"],
  ["ifood", "iFood", "mobilidade", "#d9121f", "#ffffff", "if", ["ifood", "i food"], "delivery"],
  ["rappi", "Rappi", "mobilidade", "#ff441f", "#1f0500", "R", ["rappi"], "delivery"],
  // academias
  ["smartfit", "Smart Fit", "academia", "#ffb800", "#111111", "SF", ["smart fit", "smartfit"], "academia"],
  ["bluefit", "Bluefit", "academia", "#0033a0", "#ffffff", "BF", ["bluefit", "blue fit"], "academia"],
  ["wellhub", "Wellhub (Gympass)", "academia", "#d0304f", "#ffffff", "W", ["wellhub", "gympass"], "academia"],
  ["totalpass", "Totalpass", "academia", "#00b89c", "#00211c", "TP", ["totalpass", "total pass"], "academia"],
  // software e nuvem
  ["googleone", "Google One", "software", "#1a73e8", "#ffffff", "G1", ["google one", "googleone", "google storage"], "nuvem"],
  ["icloud", "iCloud", "software", "#1a6cc9", "#ffffff", "iC", ["icloud", "apple icloud", "apple com bill"], "nuvem"],
  ["microsoft365", "Microsoft 365", "software", "#c53a01", "#ffffff", "365", ["microsoft 365", "office 365", "microsoft", "office"], "software"],
  ["chatgpt", "ChatGPT", "software", "#10a37f", "#021e17", "GPT", ["chatgpt", "chat gpt", "openai"], "software"],
  ["claude", "Claude", "software", "#d97757", "#1f0e07", "C", ["claude", "claude ai", "anthropic"], "software"],
  ["adobe", "Adobe", "software", "#e00f00", "#ffffff", "Ad", ["adobe", "creative cloud", "photoshop", "lightroom"], "software"],
  ["canva", "Canva", "software", "#00c4cc", "#00282a", "C", ["canva"], "software"],
  ["notion", "Notion", "software", "#191919", "#ffffff", "N", ["notion"], "software"],
  ["github", "GitHub", "software", "#181717", "#ffffff", "GH", ["github", "git hub", "copilot"], "software"],
  // jogos
  ["xbox", "Xbox Game Pass", "jogos", "#107c10", "#ffffff", "X", ["xbox", "game pass", "gamepass", "xbox game pass"], "jogos"],
  ["playstation", "PlayStation Plus", "jogos", "#003791", "#ffffff", "PS", ["playstation", "playstation plus", "ps plus", "psn", "ps5"], "jogos"],
  ["steam", "Steam", "jogos", "#171a21", "#66c0f4", "St", ["steam", "valve"], "jogos"],
  ["nintendo", "Nintendo", "jogos", "#e60012", "#ffffff", "N", ["nintendo", "nintendo switch", "eshop"], "jogos"],
  // telefonia
  ["vivo", "Vivo", "telefonia", "#660099", "#ffffff", "V", ["vivo", "telefonica"], "celular"],
  ["claro", "Claro", "telefonia", "#da291c", "#ffffff", "C", ["claro", "net claro", "claro net"], "celular"],
  ["tim", "TIM", "telefonia", "#004691", "#ffffff", "TIM", ["tim"], "celular"],
  ["oi", "Oi", "telefonia", "#f7a600", "#1c1300", "oi", ["oi", "oi fibra"], "internet"],
  // energia e água
  ["enel", "Enel", "utilidades", "#0555fa", "#ffffff", "e", ["enel", "eletropaulo"], "energia"],
  ["cemig", "Cemig", "utilidades", "#00833e", "#ffffff", "C", ["cemig"], "energia"],
  ["light", "Light", "utilidades", "#ffcc00", "#1a1400", "L", ["light sa", "light energia", "=light"], "energia"],
  ["cpfl", "CPFL", "utilidades", "#0071bc", "#ffffff", "CP", ["cpfl", "cpfl energia"], "energia"],
  ["sabesp", "Sabesp", "utilidades", "#005baa", "#ffffff", "Sb", ["sabesp"], "agua"],
  ["copasa", "Copasa", "utilidades", "#00539f", "#ffffff", "Cp", ["copasa"], "agua"],
  ["sanepar", "Sanepar", "utilidades", "#0068b4", "#ffffff", "Sn", ["sanepar"], "agua"],
];

export const BRANDS: ReadonlyArray<BrandDefinition> = [
  ...BANKS.map(row => toDefinition(row, "bank")),
  ...SERVICES.map(row => toDefinition(row, "service")),
];

function toDefinition([id, name, category, bg, fg, monogram, aliases, icon]: Row, kind: BrandKind): BrandDefinition {
  return { id, name, kind, category, bg, fg, monogram, aliases, ...(icon ? { icon } : {}) };
}

const byId = new Map(BRANDS.map(brand => [brand.id, brand]));

/** Catalog entry by id (undefined for unknown/blank ids). */
export function brandById(id: string | null | undefined): BrandDefinition | undefined {
  return id ? byId.get(id) : undefined;
}

/** Banks, brokers and payment accounts (MEL-33). */
export const BANK_BRANDS: ReadonlyArray<BrandDefinition> = BRANDS.filter(brand => brand.kind === "bank");
/** Services and merchants (MEL-39). */
export const SERVICE_BRANDS: ReadonlyArray<BrandDefinition> = BRANDS.filter(brand => brand.kind === "service");

/**
 * Detects a brand in free text ("Pagamento Nubank" → nubank, "SMART FIT MENSAL" → smartfit).
 * The longest matching alias wins; `kind` restricts the search. Returns null when nothing matches.
 */
export function detectBrand(text: string | null | undefined, kind?: BrandKind): BrandDefinition | null {
  const normalized = normalizeSearchText(text);
  if (!normalized) return null;
  let best: { brand: BrandDefinition; length: number } | null = null;
  for (const brand of BRANDS) {
    if (kind && brand.kind !== kind) continue;
    for (const alias of brand.aliases) {
      if (!aliasMatches(normalized, alias)) continue;
      const length = normalizeSearchText(alias.replace(/^=/, "")).length;
      if (!best || length > best.length) best = { brand, length };
    }
  }
  return best?.brand ?? null;
}

/**
 * CR-26: category names a brand's spending usually belongs to, by the brand's glyph (most specific first).
 * Only used to pick among the user's OWN categories — a suggestion never creates a category.
 */
const CATEGORY_HINTS: Readonly<Record<string, readonly string[]>> = {
  streaming: ["Streaming", "Assinaturas", "Entretenimento", "Lazer"],
  "musica-streaming": ["Música", "Streaming", "Assinaturas", "Entretenimento", "Lazer"],
  compras: ["Compras", "Compras online", "Casa"],
  roupas: ["Roupas", "Vestuário", "Compras"],
  taxi: ["Transporte", "Mobilidade", "Aplicativos de transporte"],
  delivery: ["Delivery", "Alimentação", "Restaurantes", "Comida"],
  academia: ["Academia", "Esporte", "Esportes", "Saúde", "Bem-estar"],
  nuvem: ["Assinaturas", "Software", "Tecnologia", "Serviços digitais"],
  software: ["Software", "Assinaturas", "Tecnologia", "Serviços digitais", "Trabalho"],
  jogos: ["Jogos", "Games", "Lazer", "Entretenimento", "Assinaturas"],
  celular: ["Celular", "Telefone", "Telefonia", "Internet", "Contas da casa", "Contas", "Moradia"],
  internet: ["Internet", "Telefone", "Telefonia", "Contas da casa", "Contas", "Moradia"],
  energia: ["Energia", "Luz", "Contas da casa", "Contas", "Moradia", "Casa"],
  agua: ["Água", "Saneamento", "Contas da casa", "Contas", "Moradia", "Casa"],
};

/** Category names suggested for a brand (CR-26); empty for banks and unknown ids. */
export function brandCategoryHints(id: string | null | undefined): readonly string[] {
  const brand = brandById(id);
  return brand?.icon ? CATEGORY_HINTS[brand.icon] ?? [] : [];
}

export interface CategoryLike { id: number; name: string; kind: string; icon?: string | null; }

/**
 * Picks the user's category for a brand (CR-26): a category of `kind` whose glyph is the brand's glyph, else the first
 * hint whose name equals a category name, else a category name containing a hint as a whole word. Null when none fits.
 */
export function suggestCategoryForBrand<C extends CategoryLike>(id: string | null | undefined, categories: readonly C[], kind = "expense"): C | null {
  const brand = brandById(id);
  if (!brand) return null;
  const candidates = categories.filter(category => category.kind === kind);
  if (!candidates.length) return null;
  const byIcon = brand.icon ? candidates.find(category => category.icon === brand.icon) : undefined;
  if (byIcon) return byIcon;
  const hints = brandCategoryHints(brand.id).map(hint => normalizeSearchText(hint));
  const names = candidates.map(category => ({ category, name: normalizeSearchText(category.name) }));
  for (const hint of hints) {
    const exact = names.find(entry => entry.name === hint);
    if (exact) return exact.category;
  }
  for (const hint of hints) {
    const partial = names.find(entry => aliasMatches(entry.name, hint));
    if (partial) return partial.category;
  }
  return null;
}

/** Deterministic fallback badge for unknown brands: initials on a hue derived from the text (white text, AA). */
export function fallbackBrand(text: string | null | undefined): { bg: string; fg: string; monogram: string } {
  const normalized = normalizeSearchText(text);
  let hash = 0;
  for (const char of normalized) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  const words = normalized.replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);
  const monogram = !words.length ? "?" : words.length === 1 ? words[0]!.slice(0, 2).toUpperCase() : words.slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return { bg: hslToHex(hue, 45, 30), fg: "#ffffff", monogram };
}

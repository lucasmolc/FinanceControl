import type { LucideIcon } from "lucide-react";
import {
  createLucideIcon,
  AppWindow, Apple, Armchair, Baby, Bandage, Banknote, BanknoteArrowDown, BanknoteArrowUp, Bath, Bed, BedDouble, Beer, Bike, Bitcoin, Bone, BookOpen, Brain, Briefcase, Building2,
  Bus, CakeSlice, Calculator, Car, CarTaxiFront, Cat, ChartCandlestick, ChartLine, ChartPie, CircleDollarSign, CircleEllipsis, CircleParking, Clapperboard, Cloud, Coffee, Coins,
  CreditCard, Croissant, Dog, Droplets, Dumbbell, Eye, FileText, Flame, Flower2, Footprints, Fuel, Gamepad2, Gavel, Gem, Gift, Glasses, GraduationCap, Guitar,
  Hammer, HandCoins, HandHeart, HandPlatter, Handshake, HeartPulse, Hospital, House, Landmark, Laptop, Lightbulb, Music, Package, PartyPopper, PawPrint, Pencil, Percent, PiggyBank,
  Pill, Pizza, Plane, Popcorn, Receipt, Repeat, Route, Router, Sandwich, Scale, School, Scissors, Shield, ShieldCheck, ShieldPlus, Shirt, ShoppingBag, ShoppingCart,
  Smartphone, Sofa, Sparkles, SprayCan, Stethoscope, Store, Syringe, Tag, TentTree, TestTube, Ticket, TrainFront, TrendingUp, Trophy, Truck, Tv, Undo2, Users, Utensils,
  UtensilsCrossed, Vault, Wallet, WashingMachine, Wifi, Wine, Wrench, Zap
} from "lucide-react";

/**
 * Motorcycle (MEL-46): lucide 0.542 has no moto glyph, so it is authored here on the same 24px grid, 2px round stroke —
 * two wheels, the frame running from the rear hub over the tank, the fork down to the front hub and the handlebar.
 */
const Motorcycle = createLucideIcon("motorcycle", [
  ["circle", { cx: "5", cy: "17", r: "3", key: "rear" }],
  ["circle", { cx: "19", cy: "17", r: "3", key: "front" }],
  ["path", { d: "M5 17h5l3-5h4", key: "frame" }],
  ["path", { d: "M7 12h5", key: "seat" }],
  ["path", { d: "m15.5 7 3.5 10", key: "fork" }],
  ["path", { d: "M14 7h3", key: "bar" }],
]);

/**
 * Category glyph catalog (MEL-39). Ids are stable (stored in `categories.icon`, `bills.icon`, `subscriptions.icon`);
 * labels are pt-BR; `aliases` feed `detectIcon` (accent/case-insensitive, whole words/phrases).
 * Glyphs come from the installed `lucide-react`.
 */
export type IconGroupId = "moradia" | "alimentacao" | "transporte" | "saude" | "educacao" | "lazer" | "compras" | "pets" | "servicos" | "familia" | "financas" | "receitas" | "investimentos" | "outros";

export type IconKind = "expense" | "income" | "investment";

export interface IconDefinition {
  id: string;
  label: string;
  group: IconGroupId;
  icon: LucideIcon;
  aliases: string[];
  /** Suggested default color (#rrggbb) for a category using this glyph (the group color). */
  color: string;
  kinds: IconKind[];
}

export const ICON_GROUPS: ReadonlyArray<{ id: IconGroupId; label: string; color: string }> = [
  { id: "moradia", label: "Moradia", color: "#5b8def" },
  { id: "alimentacao", label: "Alimentação", color: "#f08a4b" },
  { id: "transporte", label: "Transporte", color: "#e0b341" },
  { id: "saude", label: "Saúde e bem-estar", color: "#ef6b7b" },
  { id: "educacao", label: "Educação", color: "#8f7cf6" },
  { id: "lazer", label: "Lazer e viagens", color: "#e56fc2" },
  { id: "compras", label: "Compras", color: "#4fb7d6" },
  { id: "pets", label: "Pets", color: "#c99a6b" },
  { id: "servicos", label: "Serviços e assinaturas", color: "#6fa8ff" },
  { id: "familia", label: "Família", color: "#f29fb5" },
  { id: "financas", label: "Finanças e impostos", color: "#9aa7bd" },
  { id: "receitas", label: "Receitas", color: "#4bd5b5" },
  { id: "investimentos", label: "Investimentos", color: "#57c785" },
  { id: "outros", label: "Outros", color: "#a3aec0" },
];

const E: IconKind[] = ["expense"];
const I: IconKind[] = ["income"];
const V: IconKind[] = ["investment"];
const ALL: IconKind[] = ["expense", "income", "investment"];

type Row = [id: string, label: string, icon: LucideIcon, aliases: string[], kinds?: IconKind[]];

const ROWS: Record<IconGroupId, Row[]> = {
  moradia: [
    ["moradia", "Moradia", House, ["casa", "moradia", "lar", "habitacao"]],
    ["aluguel", "Aluguel", House, ["aluguel", "locacao", "imobiliaria", "quintoandar", "quinto andar"]],
    ["condominio", "Condomínio", Building2, ["condominio", "taxa condominial", "sindico"]],
    ["energia", "Energia elétrica", Zap, ["energia", "luz", "conta de luz", "eletricidade", "energia eletrica"]],
    ["agua", "Água e esgoto", Droplets, ["agua", "esgoto", "saneamento", "conta de agua"]],
    ["gas", "Gás", Flame, ["gas", "botijao", "gas encanado", "comgas", "ultragaz", "liquigas"]],
    ["internet", "Internet", Wifi, ["internet", "banda larga", "fibra", "wi fi", "wifi", "provedor"]],
    ["telefone", "Telefone fixo", Router, ["telefone", "telefone fixo", "linha fixa"]],
    ["iptu", "IPTU", Landmark, ["iptu"]],
    ["manutencao-casa", "Manutenção da casa", Hammer, ["reforma", "manutencao da casa", "pedreiro", "encanador", "eletricista", "conserto"]],
    ["moveis", "Móveis e decoração", Sofa, ["moveis", "decoracao", "sofa", "colchao", "tok stok", "tokstok"]],
    ["limpeza", "Limpeza", SprayCan, ["limpeza", "diarista", "faxina", "produtos de limpeza"]],
    ["jardim", "Jardim e plantas", Flower2, ["jardim", "plantas", "jardinagem", "floricultura"]],
  ],
  alimentacao: [
    ["alimentacao", "Alimentação", Utensils, ["alimentacao", "comida", "refeicao", "vale refeicao", "vale alimentacao"]],
    ["mercado", "Mercado", ShoppingCart, ["mercado", "supermercado", "sacolao", "feira", "atacadao", "assai", "carrefour", "pao de acucar", "zaffari", "big bompreco"]],
    ["restaurante", "Restaurante", UtensilsCrossed, ["restaurante", "almoco", "jantar", "churrascaria", "self service", "rodizio"]],
    ["delivery", "Delivery", HandPlatter, ["delivery", "entrega de comida", "tele entrega"]],
    ["cafe", "Café", Coffee, ["cafe", "cafeteria", "starbucks", "cafezinho"]],
    ["padaria", "Padaria", Croissant, ["padaria", "pao", "confeitaria"]],
    ["lanches", "Lanches", Sandwich, ["lanche", "lanches", "lanchonete", "hamburguer", "burger", "mcdonalds", "mc donalds", "burger king", "subway"]],
    ["pizza", "Pizza", Pizza, ["pizza", "pizzaria"]],
    ["doces", "Doces e sobremesas", CakeSlice, ["doces", "sobremesa", "sorvete", "chocolate", "bolo", "cacau show"]],
    ["hortifruti", "Hortifrúti", Apple, ["hortifruti", "frutas", "verduras", "legumes"]],
  ],
  transporte: [
    ["transporte", "Transporte", Route, ["transporte", "locomocao", "deslocamento"]],
    ["combustivel", "Combustível", Fuel, ["combustivel", "gasolina", "etanol", "alcool", "diesel", "posto", "abastecimento", "ipiranga", "petrobras", "br mania"]],
    ["taxi", "Uber e táxi", CarTaxiFront, ["taxi", "corrida", "aplicativo de transporte", "cabify", "indrive"]],
    ["onibus", "Ônibus", Bus, ["onibus", "passagem de onibus", "bilhete unico", "vale transporte", "rodoviaria"]],
    ["metro", "Metrô e trem", TrainFront, ["metro", "trem", "cptm", "vlt"]],
    ["estacionamento", "Estacionamento", CircleParking, ["estacionamento", "zona azul", "valet", "estapar"]],
    ["pedagio", "Pedágio", Ticket, ["pedagio", "sem parar", "conectcar", "veloe", "tag de pedagio"]],
    ["manutencao-veiculo", "Manutenção do veículo", Wrench, ["oficina", "mecanico", "revisao", "pneu", "troca de oleo", "funilaria", "lava rapido", "lavagem"]],
    ["moto", "Moto", Motorcycle, ["moto", "motocicleta", "motoboy", "scooter", "capacete"]],
    ["bicicleta", "Bicicleta e patinete", Bike, ["bicicleta", "bike", "patinete", "ciclismo"]],
    ["carro", "Carro", Car, ["carro", "veiculo", "automovel", "financiamento do carro"]],
    ["ipva", "IPVA e licenciamento", Landmark, ["ipva", "licenciamento", "detran", "multa de transito"]],
    ["seguro-auto", "Seguro do carro", Shield, ["seguro auto", "seguro do carro", "seguro veicular"]],
    ["passagem-aerea", "Passagens aéreas", Plane, ["passagem aerea", "passagens aereas", "latam", "azul linhas aereas", "gol linhas aereas", "voo"]],
  ],
  saude: [
    ["saude", "Saúde", HeartPulse, ["saude", "medico"]],
    ["farmacia", "Farmácia", Pill, ["farmacia", "remedio", "remedios", "medicamento", "drogaria", "droga raia", "drogasil", "pague menos", "panvel"]],
    ["plano-saude", "Plano de saúde", ShieldPlus, ["plano de saude", "convenio medico", "unimed", "amil", "sulamerica", "bradesco saude", "hapvida", "notredame"]],
    ["consulta", "Consultas", Stethoscope, ["consulta", "consultas", "clinica", "pediatra", "dermatologista"]],
    ["exames", "Exames", TestTube, ["exame", "exames", "laboratorio", "fleury", "dasa"]],
    ["dentista", "Dentista", Sparkles, ["dentista", "odontologia", "ortodontia", "aparelho dental"]],
    ["terapia", "Terapia", Brain, ["terapia", "psicologo", "psicologa", "psiquiatra"]],
    ["academia", "Academia", Dumbbell, ["academia", "musculacao", "crossfit", "pilates", "personal trainer", "treino", "natacao", "yoga"]],
    ["hospital", "Hospital e emergência", Hospital, ["hospital", "pronto socorro", "emergencia", "internacao"]],
    ["vacinas", "Vacinas", Syringe, ["vacina", "vacinas", "vacinacao"]],
    ["otica", "Ótica", Glasses, ["otica", "oculos", "lentes de contato"]],
    ["cuidados", "Cuidados pessoais", Bath, ["higiene", "cuidados pessoais", "perfumaria"]],
    ["curativos", "Primeiros socorros", Bandage, ["curativo", "primeiros socorros"]],
  ],
  educacao: [
    ["educacao", "Educação", GraduationCap, ["educacao", "faculdade", "universidade", "mensalidade escolar", "pos graduacao", "mba"]],
    ["cursos", "Cursos", Laptop, ["curso", "cursos", "udemy", "alura", "coursera", "idiomas", "ingles"]],
    ["livros", "Livros", BookOpen, ["livro", "livros", "livraria", "kindle", "ebook"]],
    ["escola", "Escola", School, ["escola", "colegio", "creche", "matricula"]],
    ["material-escolar", "Material escolar", Pencil, ["material escolar", "papelaria", "uniforme escolar"]],
  ],
  lazer: [
    ["lazer", "Lazer", PartyPopper, ["lazer", "diversao", "passeio", "entretenimento"]],
    ["cinema", "Cinema", Clapperboard, ["cinema", "filme", "cinemark", "cinepolis"]],
    ["viagem", "Viagem", Plane, ["viagem", "viagens", "ferias", "turismo", "decolar", "cvc"]],
    ["hospedagem", "Hospedagem", BedDouble, ["hotel", "hospedagem", "pousada", "airbnb", "booking", "hostel"]],
    ["jogos", "Jogos", Gamepad2, ["jogo", "jogos", "games", "videogame"]],
    ["shows", "Shows e eventos", Ticket, ["show", "shows", "evento", "ingresso", "ingressos", "sympla", "ticketmaster", "teatro", "festival"]],
    ["bares", "Bares e baladas", Beer, ["bar", "bares", "balada", "cerveja", "chopp", "happy hour", "boate"]],
    ["bebidas", "Bebidas", Wine, ["vinho", "bebidas", "adega"]],
    ["esportes", "Esportes", Trophy, ["esporte", "esportes", "futebol", "campeonato", "clube", "socio torcedor"]],
    ["musica", "Música e instrumentos", Guitar, ["instrumento musical", "aula de musica"]],
    ["hobbies", "Hobbies", Popcorn, ["hobby", "hobbies", "colecao"]],
    ["camping", "Camping e natureza", TentTree, ["camping", "trilha", "acampamento"]],
  ],
  compras: [
    ["compras", "Compras", ShoppingBag, ["compras", "loja", "shopping"]],
    ["roupas", "Roupas", Shirt, ["roupa", "roupas", "vestuario", "renner", "riachuelo", "c&a", "zara", "hering"]],
    ["calcados", "Calçados", Footprints, ["calcado", "calcados", "tenis", "sapato", "centauro", "netshoes"]],
    ["eletronicos", "Eletrônicos", Smartphone, ["eletronico", "eletronicos", "notebook", "computador", "kabum", "fast shop"]],
    ["casa-compras", "Casa e utilidades", Armchair, ["utilidades domesticas", "eletrodomestico", "cama mesa e banho", "leroy merlin", "casas bahia"]],
    ["presentes", "Presentes", Gift, ["presente", "presentes", "aniversario", "natal", "lembranca"]],
    ["beleza", "Beleza", Sparkles, ["beleza", "cosmeticos", "maquiagem", "boticario", "natura", "sephora", "salao de beleza"]],
    ["joias", "Joias e acessórios", Gem, ["joia", "joias", "relogio", "acessorios", "bijuteria"]],
    ["loja", "Lojas e varejo", Store, ["varejo", "loja de departamento", "americanas"]],
    ["encomendas", "Encomendas e frete", Package, ["frete", "correios", "encomenda", "sedex"]],
  ],
  pets: [
    ["pets", "Pets", PawPrint, ["pet", "pets", "animal de estimacao", "petshop", "pet shop", "petz", "cobasi"]],
    ["cachorro", "Cachorro", Dog, ["cachorro", "cao", "dog walker", "adestrador"]],
    ["gato", "Gato", Cat, ["gato", "areia de gato"]],
    ["racao", "Ração e petiscos", Bone, ["racao", "petisco", "petiscos"]],
    ["veterinario", "Veterinário", Stethoscope, ["veterinario", "veterinaria", "clinica veterinaria", "banho e tosa"]],
  ],
  servicos: [
    ["servicos", "Serviços", Handshake, ["servico", "servicos", "prestador"]],
    ["streaming", "Streaming", Tv, ["streaming", "tv por assinatura", "tv a cabo", "sky"]],
    ["musica-streaming", "Música por assinatura", Music, ["musica", "streaming de musica"]],
    ["software", "Software e apps", AppWindow, ["software", "aplicativo", "app", "licenca", "saas"]],
    ["nuvem", "Nuvem e armazenamento", Cloud, ["nuvem", "armazenamento", "cloud", "hospedagem de site", "dominio"]],
    ["celular", "Celular e telefonia", Smartphone, ["celular", "plano de celular", "recarga", "telefonia", "chip"]],
    ["assinaturas", "Assinaturas", Repeat, ["assinatura", "assinaturas", "mensalidade", "clube de assinatura"]],
    ["lavanderia", "Lavanderia", WashingMachine, ["lavanderia", "lavar roupa"]],
    ["cabeleireiro", "Cabeleireiro e barbearia", Scissors, ["cabeleireiro", "barbearia", "barbeiro", "corte de cabelo", "manicure"]],
    ["juridico", "Serviços jurídicos", Gavel, ["advogado", "juridico", "cartorio", "despachante"]],
    ["contabilidade", "Contabilidade", Calculator, ["contador", "contabilidade", "mei", "das"]],
    ["mudanca", "Mudança e fretes", Truck, ["mudanca", "carreto", "transportadora"]],
  ],
  familia: [
    ["familia", "Família", Users, ["familia", "parentes"]],
    ["filhos", "Filhos", Baby, ["filho", "filhos", "fralda", "fraldas", "bebe", "baba", "mesada"]],
    ["pensao", "Pensão", HandHeart, ["pensao alimenticia", "pensao"]],
    ["festas", "Festas e comemorações", PartyPopper, ["festa", "casamento", "cha de bebe", "formatura"]],
  ],
  financas: [
    ["impostos", "Impostos", Landmark, ["imposto", "impostos", "receita federal", "darf", "irpf", "imposto de renda", "iss"]],
    ["tarifas", "Tarifas bancárias", Receipt, ["tarifa", "tarifas", "anuidade", "cesta de servicos", "taxa bancaria", "ted"]],
    ["juros", "Juros e multas", Percent, ["juros", "multa", "encargos", "iof", "rotativo", "cheque especial", "mora"]],
    ["seguros", "Seguros", ShieldCheck, ["seguro", "seguros", "seguro de vida", "seguro residencial", "porto seguro"]],
    ["fatura", "Fatura do cartão", CreditCard, ["fatura", "cartao de credito", "pagamento de fatura"]],
    ["emprestimo", "Empréstimos e financiamentos", BanknoteArrowDown, ["emprestimo", "financiamento", "consignado", "credito pessoal"]],
    ["doacoes", "Doações", HandHeart, ["doacao", "doacoes", "dizimo", "oferta", "caridade", "vakinha"]],
    ["documentos", "Documentos e taxas", FileText, ["documento", "documentos", "passaporte", "certidao", "taxa"]],
    ["saque", "Saques", Banknote, ["saque", "caixa eletronico"]],
    ["ajuste", "Ajustes e acertos", Scale, ["ajuste", "acerto", "correcao"], ALL],
  ],
  receitas: [
    ["salario", "Salário", Wallet, ["salario", "holerite", "contracheque", "folha de pagamento", "adiantamento salarial"], I],
    ["freelas", "Freelas e bicos", Briefcase, ["freela", "freelas", "freelance", "bico", "servico prestado", "consultoria"], I],
    ["decimo-terceiro", "13º salário", CircleDollarSign, ["13o", "13 salario", "13o salario", "decimo terceiro"], I],
    ["ferias-renda", "Férias recebidas", Coins, ["ferias recebidas", "terco de ferias"], I],
    ["bonus", "Bônus e PLR", Trophy, ["bonus", "plr", "participacao nos lucros", "premio", "comissao"], I],
    ["reembolso", "Reembolso", Undo2, ["reembolso", "estorno", "cashback", "devolucao", "ressarcimento"], I],
    ["presentes-recebidos", "Presentes recebidos", Gift, ["presente recebido", "presentes recebidos", "mesada recebida"], I],
    ["aluguel-recebido", "Aluguel recebido", House, ["aluguel recebido", "renda de aluguel"], I],
    ["vendas", "Vendas", Tag, ["venda", "vendas", "olx", "enjoei"], I],
    ["beneficios", "Benefícios", HandCoins, ["beneficio", "inss", "aposentadoria recebida", "bolsa", "auxilio", "fgts", "seguro desemprego"], I],
    ["transferencia-recebida", "Transferência recebida", BanknoteArrowUp, ["pix recebido", "transferencia recebida"], I],
  ],
  investimentos: [
    ["investimentos", "Investimentos", TrendingUp, ["investimento", "investimentos", "aporte", "aplicacao"], V],
    ["reserva", "Reserva de emergência", PiggyBank, ["reserva", "reserva de emergencia", "poupanca", "caixinha", "cofrinho"], V],
    ["renda-fixa", "Renda fixa", Vault, ["renda fixa", "cdb", "lci", "lca", "tesouro", "tesouro direto", "debenture", "cri", "cra"], V],
    ["acoes", "Ações", ChartCandlestick, ["acoes", "acao", "bolsa de valores", "b3", "home broker", "etf"], V],
    ["fundos", "Fundos", ChartPie, ["fundo", "fundos", "fii", "fundo imobiliario", "multimercado"], V],
    ["cripto", "Criptomoedas", Bitcoin, ["cripto", "criptomoeda", "criptomoedas", "bitcoin", "btc", "ethereum", "usdt"], V],
    ["previdencia", "Previdência", ChartLine, ["previdencia", "pgbl", "vgbl", "aposentadoria"], V],
    ["rendimentos", "Rendimentos e dividendos", Coins, ["rendimento", "rendimentos", "dividendo", "dividendos", "juros sobre capital", "jcp", "proventos"], ["income", "investment"]],
  ],
  outros: [
    ["outros", "Outros", CircleEllipsis, ["outros", "diversos", "geral", "variados"], ALL],
    ["etiqueta", "Etiqueta", Tag, ["etiqueta"], ALL],
    ["imprevistos", "Imprevistos", Lightbulb, ["imprevisto", "imprevistos"]],
    ["pessoal", "Gastos pessoais", Eye, ["gastos pessoais"]],
    ["bem-estar", "Descanso e bem-estar", Bed, ["spa", "massagem", "descanso"]],
  ],
};

export const ICONS: ReadonlyArray<IconDefinition> = (Object.keys(ROWS) as IconGroupId[]).flatMap(group => {
  const color = ICON_GROUPS.find(entry => entry.id === group)!.color;
  return ROWS[group].map(([id, label, icon, aliases, kinds]) => ({ id, label, group, icon, aliases, color, kinds: kinds ?? E }));
});

const byId = new Map(ICONS.map(definition => [definition.id, definition]));

const DEFAULT_ICON_ID = "outros";

/** Catalog entry by id (undefined for unknown ids). */
export function iconById(id: string | null | undefined): IconDefinition | undefined {
  return id ? byId.get(id) : undefined;
}

/** Catalog entry by id, falling back to "outros". */
export function resolveIcon(id: string | null | undefined): IconDefinition {
  return iconById(id) ?? byId.get(DEFAULT_ICON_ID)!;
}

/** Lowercase, accent-free text with punctuation turned into spaces ("Disney+" → "disney+", "Café" → "cafe"). */
export function normalizeSearchText(text: string | null | undefined): string {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9&+ ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Whole-word/phrase match of an alias inside already-normalized text. Aliases starting with "=" must equal the whole text. */
export function aliasMatches(normalizedText: string, alias: string): boolean {
  if (alias.startsWith("=")) return normalizedText === normalizeSearchText(alias.slice(1));
  const needle = normalizeSearchText(alias);
  if (!needle) return false;
  return ` ${normalizedText} `.includes(` ${needle} `);
}

/**
 * Suggests a category glyph id for free text ("Conta de luz" → "energia", "Academia do bairro" → "academia").
 * The longest matching alias wins; `kind` restricts to glyphs suited to that kind. Returns null when nothing matches.
 */
export function detectIcon(text: string | null | undefined, kind?: IconKind): string | null {
  const normalized = normalizeSearchText(text);
  if (!normalized) return null;
  let best: { id: string; length: number } | null = null;
  for (const definition of ICONS) {
    if (kind && !definition.kinds.includes(kind)) continue;
    for (const alias of [definition.label, ...definition.aliases]) {
      if (!aliasMatches(normalized, alias)) continue;
      const length = normalizeSearchText(alias).length;
      if (!best || length > best.length) best = { id: definition.id, length };
    }
  }
  return best?.id ?? null;
}

/** Catalog entries matching a query (label, group label, aliases), in catalog order. */
export function searchIcons(query: string, kind?: IconKind): IconDefinition[] {
  const needle = normalizeSearchText(query);
  return ICONS.filter(definition => {
    if (kind && !definition.kinds.includes(kind)) return false;
    if (!needle) return true;
    const group = iconGroupLabel(definition.group);
    return [definition.label, group, ...definition.aliases].some(text => normalizeSearchText(text).includes(needle));
  });
}

/** pt-BR label of a group id. */
function iconGroupLabel(group: IconGroupId): string {
  return ICON_GROUPS.find(entry => entry.id === group)?.label ?? group;
}

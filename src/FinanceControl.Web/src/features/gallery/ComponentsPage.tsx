import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Copy, Download, FilePlus2, LayoutDashboard, Pencil, Plus, Receipt, Save, Settings, Trash2, Wallet } from "lucide-react";
import type { PageProps } from "../../types";
import { BRANDS, BANK_BRANDS, SERVICE_BRANDS } from "../../lib/brands";
import { currencies } from "../../lib/currencies";
import { ICON_GROUPS, ICONS } from "../../lib/icons";
import { Accordion } from "../../components/ui/Accordion";
import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import { Badge, Tag } from "../../components/ui/Badge";
import { BankLogo } from "../../components/ui/BankLogo";
import { BrandBadge } from "../../components/ui/BrandBadge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CategoryIcon } from "../../components/ui/CategoryIcon";
import { Checkbox } from "../../components/ui/Checkbox";
import { ColorPicker } from "../../components/ui/ColorPicker";
import { Combobox } from "../../components/ui/Combobox";
import { CommandPalette, type Command } from "../../components/ui/CommandPalette";
import { CurrencyIcon } from "../../components/ui/CurrencyIcon";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { DatePicker } from "../../components/ui/DatePicker";
import { Drawer } from "../../components/ui/Drawer";
import { FileUpload } from "../../components/ui/FileUpload";
import { IconButton } from "../../components/ui/IconButton";
import { IconPicker } from "../../components/ui/IconPicker";
import { DropdownMenu } from "../../components/ui/Menu";
import { MonthPicker } from "../../components/ui/MonthPicker";
import { Pagination } from "../../components/ui/Pagination";
import { Popover } from "../../components/ui/Popover";
import { Progress } from "../../components/ui/Progress";
import { RadioCards } from "../../components/ui/RadioCards";
import { SearchInput } from "../../components/ui/SearchInput";
import { Segmented } from "../../components/ui/Segmented";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { RangeField, Slider } from "../../components/ui/Slider";
import { KpiDelta, Stat } from "../../components/ui/Stat";
import { Stepper } from "../../components/ui/Stepper";
import { Switch } from "../../components/ui/Switch";
import { Tabs } from "../../components/ui/Tabs";
import { Tooltip } from "../../components/ui/Tooltip";
import { Field } from "../../components/ui";

const THEMES = [["noite", "Noite"], ["esmeralda", "Esmeralda"], ["ouro", "Ouro"], ["grafite", "Grafite"], ["claro", "Claro"]] as const;
const ACCENTS = [["indigo", "Índigo"], ["esmeralda", "Esmeralda"], ["ouro", "Ouro"], ["violeta", "Violeta"], ["ciano", "Ciano"], ["rosa", "Rosa"]] as const;

interface DemoRow { id: number; date: string; description: string; category: string; icon: string; amount: number; brand?: string }

const DEMO_ROWS: DemoRow[] = Array.from({ length: 240 }, (_, index) => {
  const samples: Array<Omit<DemoRow, "id" | "date" | "amount">> = [
    { description: "Mercado do bairro", category: "Mercado", icon: "mercado" },
    { description: "Netflix", category: "Streaming", icon: "streaming", brand: "netflix" },
    { description: "Smart Fit", category: "Academia", icon: "academia", brand: "smartfit" },
    { description: "Conta de luz", category: "Energia elétrica", icon: "energia", brand: "enel" },
    { description: "iFood", category: "Delivery", icon: "delivery", brand: "ifood" },
    { description: "Posto Ipiranga", category: "Combustível", icon: "combustivel" },
  ];
  const sample = samples[index % samples.length]!;
  return { id: index + 1, date: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`, amount: 1990 + ((index * 7919) % 48000), ...sample };
});

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return <section className="ui-gallery-section" aria-labelledby={`g-${id}`}>
    <h2 id={`g-${id}`} className="section-title">{title}</h2>
    {description && <p className="muted ui-gallery-note">{description}</p>}
    <div className="ui-gallery-body">{children}</div>
  </section>;
}

function Demo({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <div className={`ui-gallery-demo${wide ? " is-wide" : ""}`}>
    <p className="ui-gallery-label">{label}</p>
    <div className="ui-gallery-stage">{children}</div>
  </div>;
}

/** Dev-only gallery (#/componentes, MEL-42): every ui component, variant and state in the current theme. */
export function ComponentsPage({ notify }: Partial<PageProps>) {
  const root = typeof document === "undefined" ? null : document.documentElement;
  const [theme, setTheme] = useState(() => root?.dataset.theme ?? "noite");
  const [accent, setAccent] = useState(() => root?.dataset.accent ?? "esmeralda");
  const [motionOn, setMotionOn] = useState(() => root?.dataset.motion !== "off");

  useEffect(() => {
    if (!root) return;
    const previous = { theme: root.dataset.theme, accent: root.dataset.accent, motion: root.dataset.motion };
    return () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete root.dataset[key];
        else root.dataset[key] = value;
      }
    };
  }, [root]);
  useEffect(() => { if (root) root.dataset.theme = theme; }, [root, theme]);
  useEffect(() => { if (root) root.dataset.accent = accent; }, [root, accent]);
  useEffect(() => { if (root) root.dataset.motion = motionOn ? "on" : "off"; }, [root, motionOn]);

  const say = (message: string) => notify?.(message);

  // Inputs
  const [category, setCategory] = useState("mercado");
  const [account, setAccount] = useState("");
  const [brand, setBrand] = useState<string | null>("nubank");
  const [services, setServices] = useState<string[]>(["netflix", "spotify"]);
  const [date, setDate] = useState("2026-09-18");
  const [month, setMonth] = useState("2026-09");
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [kind, setKind] = useState("expense");
  const [period, setPeriod] = useState("12");
  const [cdi, setCdi] = useState(110);
  const [months, setMonths] = useState(6);
  const [color, setColor] = useState("#2fbf8f");
  const [icon, setIcon] = useState<string | null>("academia");
  const [logo, setLogo] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("resumo");
  const [page, setPage] = useState(3);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Array<string | number>>([]);

  const categoryOptions = useMemo(() => ICON_GROUPS.slice(0, 5).map(group => ({
    label: group.label,
    options: ICONS.filter(item => item.group === group.id).map(item => ({ value: item.id, label: item.label, icon: <CategoryIcon icon={item.id} size="sm" /> })),
  })), []);
  const bankOptions = useMemo(() => BANK_BRANDS.map(item => ({ value: item.id, label: item.name, icon: <BrandBadge brand={item.id} size="sm" decorative />, keywords: item.aliases })), []);
  const serviceOptions = useMemo(() => SERVICE_BRANDS.map(item => ({ value: item.id, label: item.name, icon: <BrandBadge brand={item.id} size="sm" decorative />, keywords: item.aliases })), []);
  const currencyOptions = useMemo(() => [
    { label: "Moedas", options: currencies.filter(item => item.kind === "fiat").map(item => ({ value: item.code, label: `${item.code} · ${item.name}`, icon: <CurrencyIcon code={item.code} decorative /> })) },
    { label: "Cripto", options: currencies.filter(item => item.kind === "crypto").map(item => ({ value: item.code, label: `${item.code} · ${item.name}`, icon: <CurrencyIcon code={item.code} decorative /> })) },
  ], []);
  const [currency, setCurrency] = useState("BRL");

  const commands: Command[] = [
    { id: "go-dashboard", group: "Ir para", label: "Painel", icon: LayoutDashboard, shortcut: ["G", "P"], run: () => say("Ir para Painel") },
    { id: "go-transactions", group: "Ir para", label: "Lançamentos", icon: Receipt, shortcut: ["G", "L"], keywords: ["transações", "gastos"], run: () => say("Ir para Lançamentos") },
    { id: "go-settings", group: "Ir para", label: "Configurações", icon: Settings, run: () => say("Ir para Configurações") },
    { id: "new-transaction", group: "Criar", label: "Novo lançamento", icon: FilePlus2, shortcut: ["N"], run: () => say("Novo lançamento") },
    { id: "new-account", group: "Criar", label: "Nova conta bancária", icon: Wallet, run: () => say("Nova conta bancária") },
    { id: "backup", group: "Ações", label: "Baixar backup", icon: Download, disabled: true, description: "Indisponível na galeria", run: () => undefined },
  ];

  const columns: DataTableColumn<DemoRow>[] = [
    { id: "date", header: "Data", sortValue: row => row.date, cell: row => row.date.split("-").reverse().join("/") },
    { id: "description", header: "Descrição", sortValue: row => row.description, cell: row => <span className="ui-gallery-inline">{row.brand ? <BrandBadge brand={row.brand} size="sm" decorative /> : <CategoryIcon icon={row.icon} size="sm" />}<b>{row.description}</b></span> },
    { id: "category", header: "Categoria", sortValue: row => row.category, cell: row => row.category },
    { id: "amount", header: "Valor", align: "right", sortValue: row => row.amount, cell: row => <span className="money">{money.format(-row.amount / 100)}</span> },
    { id: "actions", header: "", actions: true, cell: row => <DropdownMenu label={`Ações de ${row.description}`} size="sm" items={[
      { label: "Editar", icon: Pencil, onSelect: () => say(`Editar ${row.description}`) },
      { label: "Duplicar", icon: Copy, onSelect: () => say(`Duplicar ${row.description}`) },
      { type: "separator" },
      { label: "Remover", icon: Trash2, tone: "danger", onSelect: () => say(`Remover ${row.description}`) },
    ]} /> },
  ];

  return <div className="ui-gallery">
    <p className="muted ui-gallery-intro">Biblioteca de interface (MEL-42): variantes, tamanhos e estados no tema atual. Visível só em desenvolvimento.</p>

    <div className="ui-gallery-toolbar card" role="group" aria-label="Pré-visualização">
      <div className="field"><span className="ui-gallery-label" id="g-theme">Tema</span><Segmented aria-labelledby="g-theme" size="sm" value={theme} onChange={setTheme} options={THEMES.map(([value, label]) => ({ value, label }))} /></div>
      <div className="field"><span className="ui-gallery-label" id="g-accent">Destaque</span><Segmented aria-labelledby="g-accent" size="sm" value={accent} onChange={setAccent} options={ACCENTS.map(([value, label]) => ({ value, label }))} /></div>
      <Switch label="Animações" checked={motionOn} onChange={setMotionOn} />
    </div>

    <Section id="actions" title="Botões e ações">
      <Demo label="Button · variantes">
        <Button variant="primary" icon={Plus}>Novo lançamento</Button>
        <Button>Secundário</Button>
        <Button variant="ghost">Fantasma</Button>
        <Button variant="danger" icon={Trash2}>Remover</Button>
        <Button variant="link">Link</Button>
      </Demo>
      <Demo label="Button · tamanhos e estados">
        <Button size="sm">Pequeno</Button>
        <Button size="md">Médio</Button>
        <Button size="lg" variant="primary" icon={Save}>Grande</Button>
        <Button loading variant="primary">Salvando</Button>
        <Button disabled>Desativado</Button>
      </Demo>
      <Demo label="IconButton + Tooltip">
        <Tooltip content="Editar Nubank"><IconButton label="Editar Nubank" icon={Pencil} tooltip="" /></Tooltip>
        <IconButton label="Remover" icon={Trash2} tone="danger" />
        <IconButton label="Notificações" icon={Bell} variant="solid" size="lg" />
        <IconButton label="Fixar" icon={Bell} variant="outline" size="sm" pressed />
        <IconButton label="Carregando" icon={Bell} loading />
      </Demo>
      <Demo label="Menu / DropdownMenu">
        <DropdownMenu label="Ações de Nubank" items={[
          { label: "Editar", icon: Pencil, shortcut: "E", onSelect: () => say("Editar") },
          { label: "Duplicar", icon: Copy, onSelect: () => say("Duplicar") },
          { label: "Arquivar", disabled: true, disabledReason: "Mês fechado", onSelect: () => undefined },
          { type: "separator" },
          { label: "Remover", icon: Trash2, tone: "danger", onSelect: () => say("Remover") },
        ]} />
        <DropdownMenu label="Exportar" trigger={<Button icon={Download}>Exportar</Button>} placement="bottom-start" items={[
          { type: "label", label: "Formato" },
          { label: "CSV", onSelect: () => say("CSV") },
          { label: "Backup JSON", onSelect: () => say("JSON") },
        ]} />
      </Demo>
      <Demo label="CommandPalette (Ctrl+K no app)"><Button icon={LayoutDashboard} onClick={() => setPaletteOpen(true)}>Abrir paleta</Button></Demo>
      <Demo label="Drawer / Sheet"><Button onClick={() => setDrawerOpen(true)}>Abrir painel</Button></Demo>
      <Demo label="Popover">
        <Popover label="Filtros" title="Filtros rápidos" trigger={<Button variant="ghost">Filtros</Button>}>
          {close => <div className="stack">
            <Checkbox label="Só despesas" defaultChecked />
            <Checkbox label="Com cartão" />
            <Button size="sm" variant="primary" onClick={close}>Aplicar</Button>
          </div>}
        </Popover>
      </Demo>
    </Section>

    <Section id="inputs" title="Entrada de dados">
      <Demo label="Select · grupos e ícones">
        <Field label="Categoria"><Select options={categoryOptions} value={category} onChange={setCategory} /></Field>
        <Field label="Conta" hint="Com opção vazia"><Select options={bankOptions} value={account} onChange={setAccount} emptyLabel="Sem conta" /></Field>
        <Field label="Moeda"><Select options={currencyOptions} value={currency} onChange={setCurrency} size="sm" /></Field>
        <Field label="Desativado"><Select options={bankOptions} value="itau" disabled /></Field>
        <Field label="Com erro" error="Escolha uma categoria."><Select options={categoryOptions} value="" placeholder="Selecione a categoria" /></Field>
      </Demo>
      <Demo label="Combobox · busca, simples e múltipla">
        <Field label="Banco"><Combobox options={bankOptions} value={brand} onChange={value => setBrand(value)} placeholder="Buscar banco…" /></Field>
        <Field label="Serviços"><Combobox multiple options={serviceOptions} value={services} onChange={setServices} placeholder="Adicionar serviço…" /></Field>
      </Demo>
      <Demo label="DatePicker e MonthPicker">
        <Field label="Data" hint={`ISO: ${date || "—"}`}><DatePicker value={date} onChange={setDate} /></Field>
        <Field label="Vencimento (mín. hoje)"><DatePicker value="" onChange={() => undefined} min="2026-09-18" size="sm" /></Field>
        <Field label="Competência"><MonthPicker value={month} onChange={setMonth} /></Field>
        <div className="field"><span className="ui-gallery-label">Com setas</span><MonthPicker value={month} onChange={setMonth} stepper /></div>
      </Demo>
      <Demo label="Switch, Checkbox">
        <Switch label="Débito automático" description="Lançado automaticamente no vencimento." checked={switchOn} onChange={setSwitchOn} />
        <Switch label="Pequeno" size="sm" defaultChecked />
        <Switch label="Desativado" disabled />
        <Checkbox label="Recorrente" description="Repete todo mês." checked={checked} onChange={setChecked} />
        <Checkbox label="Parcial" indeterminate />
        <Checkbox label="Desativado" disabled />
      </Demo>
      <Demo label="RadioCards" wide>
        <RadioCards aria-label="Tipo" value={kind} onChange={setKind} columns={3} options={[
          { value: "expense", label: "Despesa", description: "Saída de dinheiro", icon: <CategoryIcon icon="compras" /> },
          { value: "income", label: "Receita", description: "Entrada de dinheiro", icon: <CategoryIcon icon="salario" /> },
          { value: "investment", label: "Investimento", description: "Aporte", icon: <CategoryIcon icon="investimentos" />, disabled: true },
        ]} />
      </Demo>
      <Demo label="Segmented">
        <Segmented aria-label="Período" value={period} onChange={setPeriod} options={[{ value: "6", label: "6 meses" }, { value: "12", label: "12 meses" }, { value: "24", label: "24 meses" }, { value: "36", label: "36 meses", disabled: true }]} />
        <Segmented aria-label="Período grande" size="lg" value={period} onChange={setPeriod} options={[{ value: "6", label: "6m" }, { value: "12", label: "12m" }]} />
      </Demo>
      <Demo label="Slider / RangeField">
        <RangeField label="Rentabilidade" unit="% do CDI" min={50} max={150} step={5} value={cdi} onChange={setCdi} hint="Arraste ou digite." />
        <RangeField label="Meses de reserva" min={1} max={24} value={months} onChange={setMonths} format={value => `${value} meses`} />
        <Slider aria-label="Volume" value={cdi} onChange={setCdi} min={50} max={150} size="sm" />
      </Demo>
      <Demo label="ColorPicker">
        <ColorPicker aria-label="Cor da categoria" value={color} onChange={setColor} />
        <ColorPicker aria-label="Cor opcional" value="" onChange={() => undefined} allowNone allowCustom={false} swatches={[{ value: "#820ad1", name: "Roxo" }, { value: "#ec7000", name: "Laranja" }]} />
      </Demo>
      <Demo label="IconPicker">
        <Field label="Ícone"><IconPicker value={icon} onChange={setIcon} color={color} /></Field>
        <Field label="Ícone de receita"><IconPicker value={null} onChange={setIcon} kind="income" /></Field>
      </Demo>
      <Demo label="FileUpload">
        <FileUpload label="Logo oficial" value={logo} onChange={setLogo} />
        <FileUpload label="Backup" accept={["application/json", ".json", ".db"]} acceptLabel="JSON ou DB" maxBytes={20 * 1024 * 1024} readAs="file" preview={false} onFile={file => say(`Arquivo: ${file.name}`)} />
      </Demo>
      <Demo label="SearchInput">
        <SearchInput aria-label="Buscar lançamentos" value={search} onChange={setSearch} placeholder="Buscar lançamentos…" />
        <SearchInput aria-label="Busca pequena" size="sm" value={search} onChange={setSearch} />
      </Demo>
    </Section>

    <Section id="navigation" title="Navegação">
      <Demo label="Tabs · linha" wide>
        <Tabs aria-label="Relatório" value={tab} onChange={setTab} tabs={[
          { id: "resumo", label: "Resumo", content: <p className="muted">Resumo do período.</p> },
          { id: "categorias", label: "Categorias", badge: 12, content: <p className="muted">Gastos por categoria.</p> },
          { id: "patrimonio", label: "Patrimônio", content: <p className="muted">Evolução do patrimônio.</p> },
          { id: "bloqueada", label: "Bloqueada", disabled: true, content: null },
        ]} />
      </Demo>
      <Demo label="Tabs · pílulas (ativação manual)" wide>
        <Tabs aria-label="Visão" variant="pills" size="sm" activation="manual" tabs={[{ id: "a", label: "Mensal", content: <p className="muted">Mensal</p> }, { id: "b", label: "Anual", content: <p className="muted">Anual</p> }]} />
      </Demo>
      <Demo label="Pagination" wide><Pagination page={page} pageCount={20} total={987} pageSize={50} onChange={setPage} /></Demo>
      <Demo label="Stepper" wide>
        <Stepper current={1} onStepClick={index => say(`Etapa ${index + 1}`)} steps={[{ id: "a", label: "Renda", description: "Salário líquido" }, { id: "b", label: "Contas", description: "Bancos e cartões" }, { id: "c", label: "Metas", optional: true }, { id: "d", label: "Pronto" }]} />
      </Demo>
    </Section>

    <Section id="feedback" title="Feedback">
      <Demo label="Alert" wide>
        <Alert tone="info" title="Dica">Use Ctrl+K para abrir a paleta de comandos.</Alert>
        <Alert tone="success" title="Backup concluído" />
        <Alert tone="warning" title="Mês fechado" action={<Button size="sm">Reabrir mês</Button>}>Os lançamentos de agosto não podem ser editados.</Alert>
        <Alert tone="danger" title="Não foi possível salvar" onDismiss={() => say("Aviso fechado")}>Verifique a conexão com o servidor local.</Alert>
      </Demo>
      <Demo label="Progress">
        <Progress label="Orçamento de mercado" showLabel value={62} tone="auto" />
        <Progress label="Quase no limite" showLabel value={92} tone="auto" size="sm" />
        <Progress label="Estourado" showLabel value={120} tone="auto" valueText="120% (R$ 240,00 acima)" />
        <Progress label="Carregando" indeterminate />
      </Demo>
      <Demo label="Skeleton">
        <Skeleton label="Carregando lançamentos…" lines={3} />
        <Skeleton variant="circle" />
        <Skeleton variant="rect" width={160} />
      </Demo>
      <Demo label="Accordion" wide>
        <Accordion defaultValue={["a"]} items={[
          { id: "a", title: "Moradia", meta: "R$ 2.450,00", content: <p>Aluguel, condomínio e energia.</p> },
          { id: "b", title: "Alimentação", meta: "R$ 1.320,00", content: <p>Mercado e delivery.</p> },
          { id: "c", title: "Bloqueado", disabled: true, content: null },
        ]} />
      </Demo>
    </Section>

    <Section id="data" title="Dados">
      <Demo label="Card · variantes" wide>
        <div className="ui-gallery-grid">
          <Card title="Padrão" description="Superfície base" actions={<IconButton label="Editar card" icon={Pencil} size="sm" />}>Conteúdo</Card>
          <Card variant="kpi" title="Saldo do mês"><Stat label="Receitas" value={money.format(8000)} delta={{ value: 0.042, context: "em relação ao mês anterior" }} /></Card>
          <Card variant="outline" title="Contorno" tone="warning">Com borda de alerta</Card>
          <Card variant="credit" color="#820ad1" title="Nubank Ultravioleta" description="•••• 4821"><p className="muted">Fatura: {money.format(1830.45)}</p></Card>
        </div>
      </Demo>
      <Demo label="Stat / KpiDelta">
        <Stat label="Gastos do mês" value={money.format(4210.9)} delta={{ value: 0.12, invert: true }} hint="vs. agosto" />
        <Stat label="Patrimônio" value={money.format(152340)} tone="positive" delta={{ value: -0.018 }} size="lg" />
        <Stat label="Carregando" value="—" loading />
        <KpiDelta value={0} /><KpiDelta value={null} />
      </Demo>
      <Demo label="Badge / Tag">
        <Badge>Neutro</Badge><Badge tone="positive" dot>Pago</Badge><Badge tone="negative">Atrasado</Badge><Badge tone="warning">Vence hoje</Badge>
        <Badge tone="accent" variant="solid">Novo</Badge><Badge tone="info" size="sm">Info</Badge><Badge variant="outline" size="lg">Contorno</Badge>
        <Tag color="#2fbf8f">Mercado</Tag><Tag onRemove={() => say("Tag removida")}>Removível</Tag><Tag selected>Selecionada</Tag>
      </Demo>
      <Demo label="Avatar">
        <Avatar name="Lucas Mol" /><Avatar name="Ana Souza" size="lg" /><Avatar name="Conta Conjunta" shape="rounded" size="sm" />
      </Demo>
      <Demo label="DataTable · ordenação, colunas, seleção, lote, janela (240 linhas)" wide>
        <DataTable caption="Lançamentos de exemplo" rows={DEMO_ROWS} columns={columns} rowKey={row => row.id} rowLabel={row => row.description}
          selectable selected={selected} onSelectionChange={setSelected} columnsConfigurable virtualize={{ height: 420 }} defaultSort={{ column: "date", direction: "desc" }}
          toolbar={<span className="muted">{DEMO_ROWS.length} lançamentos</span>}
          bulkActions={(rows, clear) => <><Button size="sm" onClick={() => say(`Categorizar ${rows.length}`)}>Categorizar</Button><Button size="sm" variant="danger" icon={Trash2} onClick={() => { say(`Remover ${rows.length}`); clear(); }}>Remover</Button></>} />
      </Demo>
      <Demo label="DataTable · paginada e vazia" wide>
        <DataTable caption="Paginada" rows={DEMO_ROWS.slice(0, 45)} columns={columns.slice(0, 4)} rowKey={row => row.id} pageSize={10} density="compact" />
        <DataTable caption="Vazia" rows={[] as DemoRow[]} columns={columns.slice(0, 4)} rowKey={row => row.id} empty="Nenhum lançamento neste mês." />
      </Demo>
    </Section>

    <Section id="identity" title="Ícones, marcas e moedas" description={`${ICONS.length} ícones de categoria em ${ICON_GROUPS.length} grupos · ${BRANDS.length} marcas (${BANK_BRANDS.length} bancos, ${SERVICE_BRANDS.length} serviços) · ${currencies.length} moedas. Monogramas estilizados, não a arte oficial.`}>
      <Demo label="CurrencyIcon (16, 20, 32 px)" wide>
        <div className="ui-gallery-swatches">{currencies.map(item => <span key={item.code} className="ui-gallery-inline"><CurrencyIcon code={item.code} size={16} decorative /><CurrencyIcon code={item.code} decorative /><CurrencyIcon code={item.code} size={32} /><small>{item.code}</small></span>)}
          <span className="ui-gallery-inline"><CurrencyIcon code="XYZ" size={32} /><small>Desconhecida</small></span></div>
      </Demo>
      <Demo label="BankLogo / BrandBadge · bancos" wide>
        <div className="ui-gallery-swatches">{BANK_BRANDS.map(item => <span key={item.id} className="ui-gallery-inline"><BankLogo brand={item.id} /><small>{item.name}</small></span>)}
          <span className="ui-gallery-inline"><BankLogo institution="Cooperativa Local" /><small>Fallback</small></span>
          <span className="ui-gallery-inline"><BankLogo institution="Banco Inter S.A." size="sm" /><small>Detectado</small></span></div>
      </Demo>
      <Demo label="BrandBadge · serviços e lojas" wide>
        <div className="ui-gallery-swatches">{SERVICE_BRANDS.map(item => <span key={item.id} className="ui-gallery-inline"><BrandBadge brand={item.id} shape="circle" /><small>{item.name}</small></span>)}</div>
      </Demo>
      <Demo label="CategoryIcon · catálogo" wide>
        {ICON_GROUPS.map(group => <div key={group.id} className="ui-gallery-group">
          <p className="ui-gallery-label">{group.label}</p>
          <div className="ui-gallery-swatches">{ICONS.filter(item => item.group === group.id).map(item => <span key={item.id} className="ui-gallery-inline" title={item.id}><CategoryIcon icon={item.id} /><small>{item.label}</small></span>)}</div>
        </div>)}
      </Demo>
    </Section>

    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Detalhes do lançamento" description="Mercado do bairro · 18/09/2026"
      footer={<><Button variant="ghost" onClick={() => setDrawerOpen(false)}>Fechar</Button><Button variant="primary" icon={Save} onClick={() => { say("Salvo"); setDrawerOpen(false); }}>Salvar</Button></>}>
      <div className="stack">
        <Field label="Descrição"><input defaultValue="Mercado do bairro" /></Field>
        <Field label="Categoria"><Select options={categoryOptions} value={category} onChange={setCategory} /></Field>
        <Field label="Data"><DatePicker value={date} onChange={setDate} /></Field>
      </div>
    </Drawer>
  </div>;
}

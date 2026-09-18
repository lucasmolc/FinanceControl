import { useId, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Field, MoneyInput } from "../../components/ui";
import { BrandBadge } from "../../components/ui/BrandBadge";
import { Checkbox } from "../../components/ui/Checkbox";
import { ColorPicker } from "../../components/ui/ColorPicker";
import { DEFAULT_SWATCHES } from "../../components/ui/ColorPicker/swatches";
import { Combobox } from "../../components/ui/Combobox";
import { CurrencyIcon } from "../../components/ui/CurrencyIcon";
import { DatePicker } from "../../components/ui/DatePicker";
import { FileUpload } from "../../components/ui/FileUpload";
import { IconPicker } from "../../components/ui/IconPicker";
import { RadioCards } from "../../components/ui/RadioCards";
import { Segmented } from "../../components/ui/Segmented";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import type { SelectOption, SelectOptionGroup } from "../../components/ui/shared/options";
import { BRAND_CATEGORIES, BRANDS, brandById, detectBrand, type BrandKind } from "../../lib/brands";
import { currencies, currencyLabel } from "../../lib/currencies";
import { detectIcon, iconById, type IconKind } from "../../lib/icons";
import { isValidLogoData, LOGO_INVALID, LOGO_MAX_BYTES, LOGO_TYPES } from "../../lib/logo";
import type { FieldsProps } from "./types";
import { checked, text } from "./formUtils";
import { categoryIcon } from "./optionIcons";
import { useCategorySuggestion } from "./useSuggestions";

/** Options of a select, optionally grouped. */
export interface OptionGroup { label: string; options: [string, string][]; }

/**
 * Shared props. Required fields get `aria-required`; optional ones show "(opcional)" in the label (MEL-06).
 * `optional` overrides the default (text/money/date/textarea: optional unless `required`; select: optional when it offers a blank choice).
 */
interface BaseProps { f: FieldsProps; name: string; label: string; hint?: string; optional?: boolean; }

const value = (f: FieldsProps, name: string) => text(f.form, name);

/** Hidden input carrying a control value, so API errors map to the field (`[name=…]`, RecordModal). */
const Hidden = ({ name, current }: { name: string; current: string }) => <input type="hidden" name={name} value={current} />;

/** Visible label for grouped controls (radio groups, pickers) that `<label for>` cannot name. */
function GroupLabel({ id, label, optional }: { id: string; label: string; optional: boolean }) {
  return <span className="field-label" id={id}>{label}{optional && <> <span className="field-optional">(opcional)</span></>}</span>;
}

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (!error && !hint) return null;
  return <p id={id} className={error ? "field-error" : "field-hint"}>{error || hint}</p>;
}

/** `autoFocus` marks the field the dialog focuses first (`data-autofocus`, CR-15: Descrição instead of the prefilled date). */
export function TextField({ f, name, label, hint, maxLength, placeholder, required = false, optional, autoComplete = "off", autoFocus = false }: BaseProps & { maxLength?: number; placeholder?: string; required?: boolean; autoComplete?: string; autoFocus?: boolean }) {
  return <Field label={label} hint={hint} error={f.errors[name]} optional={optional ?? !required}>
    <input name={name} type="text" required={required} maxLength={maxLength} placeholder={placeholder} autoComplete={autoComplete} data-autofocus={autoFocus || undefined} value={value(f, name)} onChange={event => f.set(name, event.target.value)} />
  </Field>;
}

export function TextAreaField({ f, name, label, hint, maxLength = 500, placeholder, rows = 3, optional = true }: BaseProps & { maxLength?: number; placeholder?: string; rows?: number }) {
  return <Field label={label} hint={hint} error={f.errors[name]} optional={optional}>
    <textarea name={name} rows={rows} maxLength={maxLength} placeholder={placeholder} value={value(f, name)} onChange={event => f.set(name, event.target.value)} />
  </Field>;
}

/** Money text field; `currency` (MEL-26) sets the prefix symbol and accepted decimals. */
export function MoneyField({ f, name, label, hint, allowNegative = false, required = false, optional, placeholder, currency }: BaseProps & { allowNegative?: boolean; required?: boolean; placeholder?: string; currency?: string }) {
  return <Field label={label} hint={hint} error={f.errors[name]} optional={optional ?? !required}>
    <MoneyInput name={name} required={required} allowNegative={allowNegative} placeholder={placeholder} currency={currency} value={value(f, name)} onChange={next => f.set(name, next)} />
  </Field>;
}

/** Day of month 1–31: keeps the typed text (never snaps back to a default). */
export function DayField({ f, name, label, hint, required = true, optional }: BaseProps & { required?: boolean }) {
  return <Field label={label} hint={hint} error={f.errors[name]} optional={optional ?? !required}>
    <input name={name} type="number" inputMode="numeric" min={1} max={31} step={1} required={required} value={value(f, name)} onChange={event => f.set(name, event.target.value)} />
  </Field>;
}

/** pt-BR date field (DatePicker, MEL-42): types "dd/mm/aaaa" or picks in the calendar; the form keeps ISO. */
export function DateField({ f, name, label, hint, required = false, optional, min, max }: BaseProps & { required?: boolean; min?: string; max?: string }) {
  return <Field label={label} hint={hint} error={f.errors[name]} optional={optional ?? !required}>
    <DatePicker name={name} required={required} min={min} max={max} value={value(f, name)} onChange={next => f.set(name, next)} />
  </Field>;
}

const toOption = (icon?: (value: string) => ReactNode, disabled?: string[]) => ([option, optionLabel]: [string, string]): SelectOption =>
  ({ value: option, label: optionLabel, icon: icon?.(option), disabled: disabled?.includes(option) || undefined });

/**
 * Select (components/ui, MEL-42) over `[value, label]` options or groups; `icon(value)` adds an option icon.
 * `emptyLabel` adds a blank first option. A stored value missing from the options (inactive/removed record, unknown code)
 * is kept as `missingLabel`; `missingDisabled` lists it disabled (e.g. a removed account, MEL-16).
 * `disabledOptions` stay listed but cannot be chosen (e.g. a transfer without another account).
 */
export function SelectField({ f, name, label, hint, options = [], groups, emptyLabel, missingLabel, missingDisabled = false, onChange, required = false, optional, disabledOptions, disabled = false, icon, placeholder }: BaseProps & { options?: [string, string][]; groups?: OptionGroup[]; emptyLabel?: string; missingLabel?: string; missingDisabled?: boolean; onChange?: (next: string) => void; required?: boolean; disabledOptions?: string[]; disabled?: boolean; icon?: (value: string) => ReactNode; placeholder?: string }) {
  const current = value(f, name);
  const all = [...options, ...(groups ?? []).flatMap(group => group.options)];
  const missing = current !== "" && !all.some(([option]) => option === current);
  const make = toOption(icon, disabledOptions);
  const input: Array<SelectOption | SelectOptionGroup> = [
    ...(missing ? [{ value: current, label: missingLabel ?? current, disabled: missingDisabled || undefined, icon: icon?.(current) }] : []),
    ...options.map(make),
    ...(groups ?? []).map(group => ({ label: group.label, options: group.options.map(make) })),
  ];
  return <Field label={label} hint={hint} error={f.errors[name]} optional={optional ?? (emptyLabel !== undefined && !required)}>
    <Select name={name} required={required} disabled={disabled} options={input} emptyLabel={emptyLabel} placeholder={placeholder ?? "Selecione…"} value={current}
      onChange={next => (onChange ? onChange(next) : f.set(name, next))} />
  </Field>;
}

/**
 * Kind choice as a segmented control (2–3 short options) or radio cards (with descriptions), MEL-42.
 * Labelled by the visible label (aria-labelledby); `disabledOptions` stay visible.
 */
export function ChoiceField({ f, name, label, hint, options, onChange, disabledOptions, variant = "segmented", descriptions, icons, columns = 2 }: BaseProps & { options: [string, string][]; onChange?: (next: string) => void; disabledOptions?: string[]; variant?: "segmented" | "cards"; descriptions?: Record<string, string>; icons?: Record<string, ReactNode>; columns?: 1 | 2 | 3 | 4 }) {
  const labelId = useId();
  const messageId = `${labelId}-message`;
  const current = value(f, name) || options[0]?.[0] || "";
  const error = f.errors[name];
  const change = (next: string) => (onChange ? onChange(next) : f.set(name, next));
  return <div className={`field choice-field${error ? " field-invalid" : ""}`}>
    <GroupLabel id={labelId} label={label} optional={false} />
    {variant === "cards"
      ? <RadioCards name={name} aria-labelledby={labelId} aria-describedby={error || hint ? messageId : undefined} value={current} onChange={change} columns={columns} size="sm"
        options={options.map(([option, optionLabel]) => ({ value: option, label: optionLabel, description: descriptions?.[option], icon: icons?.[option], disabled: disabledOptions?.includes(option) }))} />
      : <>
        <Segmented aria-labelledby={labelId} value={current} onChange={change} fullWidth
          options={options.map(([option, optionLabel]) => ({ value: option, label: optionLabel, disabled: disabledOptions?.includes(option) }))} />
        <Hidden name={name} current={current} />
      </>}
    <FieldMessage id={messageId} error={error} hint={hint} />
  </div>;
}

/** Currency select (MEL-26/36): catalog grouped as "Moedas" / "Cripto", each option with its CurrencyIcon. `disabled` keeps it visible but fixed. */
export function CurrencyField({ f, name = "currency", label = "Moeda", hint, onChange, disabled = false }: Omit<BaseProps, "name" | "label"> & { name?: string; label?: string; onChange?: (next: string) => void; disabled?: boolean }) {
  const groups: OptionGroup[] = [
    { label: "Moedas", options: currencies.filter(currency => currency.kind === "fiat").map((currency): [string, string] => [currency.code, currencyLabel(currency.code)]) },
    { label: "Cripto", options: currencies.filter(currency => currency.kind === "crypto").map((currency): [string, string] => [currency.code, currencyLabel(currency.code)]) },
  ];
  return <SelectField f={f} name={name} label={label} hint={hint} groups={groups} onChange={onChange} disabled={disabled} optional={false} icon={code => <CurrencyIcon code={code} size={18} decorative />} />;
}

/** "Sugerido …" line under a brand/icon field: explains an automatic choice or offers to go back to it (MEL-33/39). */
function SuggestionNote({ touched, suggestion, current, label, onAccept }: { touched: boolean; suggestion: string | null; current: string; label: string; onAccept: () => void }) {
  if (!suggestion) return null;
  if (!touched && current === suggestion) return <p className="field-suggestion"><Sparkles size={13} aria-hidden="true" />Sugerido pelo nome; você pode trocar.</p>;
  if (touched && current !== suggestion) return <p className="field-suggestion">
    <Sparkles size={13} aria-hidden="true" />
    <button type="button" className="btn small ghost" onClick={onAccept}>Usar sugestão: {label}</button>
  </p>;
  return null;
}

/**
 * Brand picker (MEL-33/39): searchable combobox with the brand badges, grouped by catalog category; `kind` limits to banks
 * or services. `source` is the text the brand is detected from (name/institution/description) — the suggestion is applied
 * automatically until the user picks one (`<name>_touched`), and can be restored afterwards. Unknown stored ids stay listed.
 */
export function BrandField({ f, name = "brand", label = "Marca", hint, kind, onChange, source }: Omit<BaseProps, "name" | "label"> & { name?: string; label?: string; kind?: BrandKind; onChange?: (next: string) => void; source?: string }) {
  const current = value(f, name);
  const touchedKey = `${name}_touched`;
  const touched = checked(f.form, touchedKey);
  const options: Array<SelectOption | SelectOptionGroup> = BRAND_CATEGORIES
    .map(category => ({
      label: category.label,
      options: BRANDS.filter(brand => brand.category === category.id && (!kind || brand.kind === kind))
        .map(brand => ({ value: brand.id, label: brand.name, keywords: brand.aliases.map(alias => alias.replace(/^=/, "")), icon: <BrandBadge brand={brand.id} size={20} decorative /> })),
    }))
    .filter(group => group.options.length > 0);
  const unknown = current !== "" && !brandById(current);
  const input = unknown ? [{ value: current, label: current, icon: <BrandBadge name={current} size={20} decorative /> }, ...options] : options;
  const suggestion = source !== undefined ? detectBrand(source, kind)?.id ?? null : null;
  const pick = (next: string) => {
    if (onChange) { onChange(next); return; }
    f.set(name, next);
    f.set(touchedKey, true);
  };
  return <div className="field-group">
    <Field label={label} hint={hint} error={f.errors[name]} optional>
      <Combobox name={name} options={input} value={current || null} placeholder="Buscar marca…" emptyMessage="Nenhuma marca encontrada."
        onChange={next => pick(next ?? "")} />
    </Field>
    <SuggestionNote touched={touched} suggestion={suggestion} current={current} label={brandById(suggestion)?.name ?? ""}
      onAccept={() => { f.set(name, suggestion ?? ""); f.set(touchedKey, false); }} />
  </div>;
}

/**
 * Category glyph picker (MEL-39) with search and groups; `kind` limits to glyphs suited to that kind. Suggested from
 * `source` (or the chosen `brand`'s glyph) until the user picks one; "Usar sugestão" restores the automatic choice.
 */
export function IconField({ f, name = "icon", label = "Ícone", hint, kind, onChange, source, brand, color }: Omit<BaseProps, "name" | "label"> & { name?: string; label?: string; kind?: IconKind; onChange?: (next: string) => void; source?: string; brand?: string; color?: string }) {
  const current = value(f, name);
  const touchedKey = `${name}_touched`;
  const touched = checked(f.form, touchedKey);
  const suggestion = source !== undefined ? brandById(brand)?.icon ?? detectIcon(source, kind) ?? null : null;
  return <div className="field-group">
    <Field label={label} hint={hint} error={f.errors[name]} optional>
      <IconPicker value={current || null} kind={kind} color={color || null} placeholder="Automático"
        onChange={next => { if (onChange) onChange(next); else { f.set(name, next); f.set(touchedKey, true); } }} />
    </Field>
    <Hidden name={name} current={current} />
    <SuggestionNote touched={touched} suggestion={suggestion} current={current} label={iconById(suggestion)?.label ?? ""}
      onAccept={() => { f.set(name, suggestion ?? ""); f.set(touchedKey, false); }} />
  </div>;
}

/**
 * Category select with the CR-26 suggestion: the brand's matching category is filled automatically while untouched
 * (create mode), explained with "Sugerida pelo serviço", and offered as "Usar sugestão" when the current value differs.
 */
export function CategoryField({ f, name = "category_id", label = "Categoria", hint, kind, brand, emptyLabel = "Sem categoria" }: Omit<BaseProps, "name" | "label"> & { name?: string; label?: string; kind: string; brand: string; emptyLabel?: string }) {
  const suggestion = useCategorySuggestion(f, brand, kind, name);
  const current = value(f, name);
  const auto = checked(f.form, `${name}_auto`);
  const options = f.ctx.state.categories.filter(category => category.kind === kind).map((category): [string, string] => [String(category.id), category.name]);
  const choose = (next: string) => { f.set(name, next); f.set(`${name}_touched`, true); f.set(`${name}_auto`, false); };
  const suggested = suggestion ? String(suggestion.id) : null;
  // R4-SET-1: with the 70-20-10 plan active, say when this expense will not count in the plan (no category / no bucket).
  const planActive = kind === "expense" && typeof f.ctx.state.settings.plan_fixed_pct === "number";
  const chosen = current ? f.ctx.state.categories.find(category => String(category.id) === current) : undefined;
  const planHint = !planActive ? undefined
    : !current ? "Sem categoria, este gasto não entra no plano 70-20-10."
      : chosen && !chosen.bucket ? `${chosen.name} não tem balde no plano 70-20-10; o gasto fica fora das somas do plano.` : undefined;
  return <div className="field-group">
    <SelectField f={f} name={name} label={label} hint={hint ?? planHint} options={options} emptyLabel={emptyLabel} missingLabel={String(f.form[`${name.replace(/_id$/, "")}_name`] ?? "Categoria atual")}
      icon={categoryIcon(f.ctx.state)} onChange={choose} />
    {suggested && auto && current === suggested && <p className="field-suggestion"><Sparkles size={13} aria-hidden="true" />Sugerida pelo serviço; você pode trocar.</p>}
    {suggested && !auto && current !== suggested && <p className="field-suggestion">
      <Sparkles size={13} aria-hidden="true" />
      <button type="button" className="btn small ghost" onClick={() => { f.set(name, suggested); f.set(`${name}_touched`, true); f.set(`${name}_auto`, false); }}>Usar sugestão: {suggestion!.name}</button>
    </p>}
  </div>;
}

/** R1-REC-5: one row of 12 choices ("Sem cor" + 11 hues); the rest of the palette stays reachable through "Personalizada". */
const FORM_SWATCHES = DEFAULT_SWATCHES.filter(swatch => !["#57c785", "#c8a45c", "#820ad1", "#2b3445", "#111827"].includes(swatch.value));

/** Color (#rrggbb): swatches + custom hex behind "Personalizada" (open when the value is not a swatch); blank = automatic ("Sem cor"). */
export function ColorField({ f, name = "color", label = "Cor", hint, swatches = FORM_SWATCHES }: Omit<BaseProps, "name" | "label"> & { name?: string; label?: string; swatches?: { value: string; name: string }[] }) {
  const current = value(f, name).toLowerCase();
  const labelId = useId();
  const messageId = `${labelId}-message`;
  const error = f.errors[name];
  const custom = current !== "" && !swatches.some(swatch => swatch.value.toLowerCase() === current);
  const [showCustom, setShowCustom] = useState(custom);
  return <div className={`field color-field${error ? " field-invalid" : ""}`}>
    <GroupLabel id={labelId} label={label} optional />
    <ColorPicker aria-labelledby={labelId} aria-describedby={error || hint ? messageId : undefined} value={current} allowNone allowCustom={showCustom || custom || Boolean(error)} swatches={swatches} onChange={next => f.set(name, next.toLowerCase())} />
    {!(showCustom || custom || error) && <button type="button" className="btn small ghost color-custom-toggle" onClick={() => setShowCustom(true)}>Personalizada…</button>}
    <Hidden name={name} current={current} />
    <FieldMessage id={messageId} error={error} hint={hint} />
  </div>;
}

/** Optional logo upload (MEL-33): PNG/JPG/WEBP/SVG ≤ 150 KB, stored as a data URL; drag and drop, preview and remove. */
export function LogoField({ f, name = "logo_data", label = "Logo", hint = "Sem logo, usamos o selo da marca." }: Omit<BaseProps, "name" | "label"> & { name?: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const current = value(f, name);
  const message = error ?? f.errors[name];
  return <div className={`field logo-field${message ? " field-invalid" : ""}`}>
    <FileUpload value={current || null} accept={[...LOGO_TYPES]} maxBytes={LOGO_MAX_BYTES} acceptLabel="PNG, JPG, WEBP ou SVG"
      label={<>{label} <span className="field-optional">(opcional)</span></>}
      hint={<>Arraste até aqui ou escolha um arquivo. {LOGO_INVALID} {hint}</>}
      onError={() => setError(null)}
      onChange={dataUrl => {
        if (dataUrl === null) { setError(null); f.set(name, ""); return; }
        if (!isValidLogoData(dataUrl)) { setError(LOGO_INVALID); return; }
        setError(null);
        f.set(name, dataUrl);
      }} />
    <Hidden name={name} current={current ? "set" : ""} />
    {message && <p className="field-error" role="alert">{message}</p>}
  </div>;
}

export function CheckboxField({ f, name, label, hint }: Omit<BaseProps, "optional">) {
  const checkedValue = checked(f.form, name);
  return <div className="field">
    <Checkbox name={name} checked={checkedValue} label={label} description={hint} onChange={next => f.set(name, next)} />
  </div>;
}

/** On/off setting (e.g. "Débito automático", MEL-29) as a switch with its description. */
export function SwitchField({ f, name, label, hint }: Omit<BaseProps, "optional">) {
  const checkedValue = checked(f.form, name);
  return <div className="field switch-field">
    <Switch name={name} checked={checkedValue} label={label} description={hint} onChange={next => f.set(name, next)} />
  </div>;
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-grid">{children}</div>;
}

/** Read-only context line shown above a movement form (e.g. current balance). */
export function FormContextNote({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

/**
 * "Mais detalhes" (CR-15, R1-REC-2): optional fields folded under the essentials. It opens by itself when `filled` (something
 * was set) or when one of `keys` has an error; `summary` lists what is set, `placeholder` what is inside when nothing is.
 */
export function MoreDetails({ f, keys, filled, summary, placeholder, children }: { f: FieldsProps; keys: readonly string[]; filled: boolean; summary: string; placeholder: string; children: ReactNode }) {
  const [open, setOpen] = useState(filled);
  const invalid = keys.some(key => Boolean(f.errors[key]));
  return <details className="form-more" open={open || invalid} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <span className="form-more-title">Mais detalhes</span>
      <span className="form-more-summary muted">{summary || placeholder}</span>
    </summary>
    <div className="stack form-more-body">{children}</div>
  </details>;
}

import { fireEvent, within } from "@testing-library/react";

// Test helpers for the components/ui form controls (MEL-42): Select/Combobox listboxes, Segmented/RadioCards groups,
// DatePicker text and the hidden inputs that carry the form values.

type Matcher = string | RegExp;

function listboxOf(control: HTMLElement): HTMLElement {
  const id = control.getAttribute("aria-controls");
  const list = id ? document.getElementById(id) : null;
  if (!list) throw new Error(`Lista de opções não abriu para ${control.id}`);
  return list;
}

/** Opens a Select (button combobox) or Combobox (input) and returns its listbox. */
export function openOptions(control: HTMLElement): HTMLElement {
  if (control.getAttribute("aria-expanded") !== "true") fireEvent.click(control);
  return listboxOf(control);
}

/** Visible labels of the options of a Select/Combobox (closes it again). */
export function optionLabels(scope: HTMLElement, label: Matcher): string[] {
  const control = within(scope).getByLabelText(label);
  const list = openOptions(control);
  const labels = within(list).getAllByRole("option").map(option => option.querySelector(".ui-option-label")?.textContent ?? option.textContent ?? "");
  fireEvent.keyDown(control, { key: "Escape" });
  return labels;
}

/** The option element (for aria-disabled/aria-selected checks); leaves the list open. */
export function findOption(scope: HTMLElement, label: Matcher, option: Matcher): HTMLElement {
  const control = within(scope).getByLabelText(label);
  return within(openOptions(control)).getByRole("option", { name: option });
}

/**
 * Chooses `option` (visible label) in the control labelled `label`: Select/Combobox options, Segmented/RadioCards radios,
 * or a Switch/Checkbox when `option` is omitted.
 */
export function pick(scope: HTMLElement, label: Matcher, option?: Matcher): void {
  const control = within(scope).getByLabelText(label);
  const role = control.getAttribute("role");
  if (option === undefined) { fireEvent.click(control); return; }
  if (role === "radiogroup") { fireEvent.click(within(control).getByRole("radio", { name: option })); return; }
  if (role === "combobox" && control.tagName === "INPUT") {
    fireEvent.change(control, { target: { value: typeof option === "string" ? option : "" } });
    fireEvent.click(within(listboxOf(control)).getByRole("option", { name: option }));
    return;
  }
  if (role === "combobox") { fireEvent.click(within(openOptions(control)).getByRole("option", { name: option })); return; }
  throw new Error(`Controle sem opções: ${String(label)}`);
}

/** Value of the hidden input named `name` (Select, Segmented, Combobox, pickers). */
export function hiddenValue(scope: HTMLElement, name: string): string | undefined {
  return scope.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;
}

/** Types a date in a DatePicker ("2026-09-02" → "02/09/2026"). */
export function typeDate(scope: HTMLElement, label: Matcher, iso: string): void {
  const [year, month, day] = iso.split("-");
  fireEvent.change(within(scope).getByLabelText(label), { target: { value: `${day}/${month}/${year}` } });
}

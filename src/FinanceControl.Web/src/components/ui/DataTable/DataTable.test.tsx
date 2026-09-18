// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataTable, type DataTableColumn } from "./DataTable";

afterEach(cleanup);

interface Row { id: number; name: string; amount: number }

const ROWS: Row[] = [
  { id: 1, name: "Mercado", amount: 300 },
  { id: 2, name: "Água", amount: 90 },
  { id: 3, name: "Netflix", amount: 55 },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { id: "name", header: "Descrição", sortValue: row => row.name, cell: row => row.name },
  { id: "amount", header: "Valor", align: "right", sortValue: row => row.amount, cell: row => String(row.amount) },
  { id: "note", header: "Obs.", cell: () => "—", defaultHidden: true },
  { id: "actions", header: "", actions: true, cell: row => <button type="button">Editar {row.name}</button> },
];

describe("DataTable", () => {
  it("contrato .data-table: rótulos móveis, .num e td.actions", () => {
    render(<DataTable caption="Gastos" rows={ROWS} columns={COLUMNS} rowKey={row => row.id} />);
    const table = screen.getByRole("table", { name: "Gastos" });
    expect(table.className).toContain("data-table");
    const cells = table.querySelectorAll("tbody tr:first-child td");
    expect(cells[0]!.getAttribute("data-label")).toBe("Descrição");
    expect(cells[1]!.className).toContain("num");
    expect(cells[2]!.className).toContain("actions");
    expect(cells[2]!.hasAttribute("data-label")).toBe(false);
  });

  it("ordena pelo cabeçalho com aria-sort (pt-BR, asc/desc)", () => {
    render(<DataTable caption="Gastos" rows={ROWS} columns={COLUMNS} rowKey={row => row.id} />);
    const header = screen.getByRole("button", { name: "Descrição" });
    fireEvent.click(header);
    expect(screen.getByRole("columnheader", { name: "Descrição" }).getAttribute("aria-sort")).toBe("ascending");
    expect(Array.from(document.querySelectorAll("tbody tr td:first-child")).map(td => td.textContent)).toEqual(["Água", "Mercado", "Netflix"]);
    fireEvent.click(screen.getByRole("button", { name: "Valor" }));
    fireEvent.click(screen.getByRole("button", { name: "Valor" }));
    expect(screen.getByRole("columnheader", { name: "Valor" }).getAttribute("aria-sort")).toBe("descending");
    expect(Array.from(document.querySelectorAll("tbody tr td:first-child")).map(td => td.textContent)).toEqual(["Mercado", "Água", "Netflix"]);
  });

  it("seleção com 'Selecionar todos' e barra de ações em lote", () => {
    function Harness() {
      const [selected, setSelected] = useState<Array<string | number>>([]);
      return <DataTable caption="Gastos" rows={ROWS} columns={COLUMNS} rowKey={row => row.id} rowLabel={row => row.name} selectable selected={selected} onSelectionChange={setSelected}
        bulkActions={(rows, clear) => <button type="button" onClick={clear}>Remover {rows.length}</button>} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar Água" }));
    const bar = screen.getByRole("region", { name: "Ações em lote" });
    expect(bar.textContent).toContain("1 selecionado");
    expect((screen.getByRole("checkbox", { name: "Selecionar todos" }) as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    expect(screen.getByRole("button", { name: "Remover 3" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover 3" }));
    expect(screen.queryByRole("region", { name: "Ações em lote" })).toBeNull();
  });

  it("colunas configuráveis e paginação", () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, name: `Item ${index + 1}`, amount: index }));
    render(<DataTable caption="Itens" rows={many} columns={COLUMNS} rowKey={row => row.id} pageSize={10} columnsConfigurable />);
    expect(screen.queryByRole("columnheader", { name: "Obs." })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Colunas" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Obs." }));
    expect(screen.getByRole("columnheader", { name: "Obs." })).toBeTruthy();
    expect(document.querySelectorAll("tbody tr").length).toBe(10);
    fireEvent.click(screen.getByRole("button", { name: "Página 3" }));
    expect(document.querySelectorAll("tbody tr").length).toBe(5);
    expect(screen.getByText("Mostrando 21–25 de 25")).toBeTruthy();
  });

  it("agrupa linhas consecutivas com cabeçalho por grupo só enquanto ordenada pela coluna do grupo", () => {
    const rows = [{ id: 1, name: "B", amount: 1 }, { id: 2, name: "B", amount: 2 }, { id: 3, name: "A", amount: 3 }];
    render(<DataTable caption="Grupos" rows={rows} columns={COLUMNS.slice(0, 2)} rowKey={row => row.id} defaultSort={{ column: "name", direction: "desc" }}
      groups={{ key: row => row.name, header: (key, items) => <span>Grupo {key} · {items.length}</span>, columns: ["name"] }} />);
    const table = screen.getByRole("table", { name: "Grupos" });
    expect(table.querySelectorAll("tbody.ui-group")).toHaveLength(2);
    expect(within(table).getByRole("rowheader", { name: "Grupo B · 2" })).toBeTruthy();
    expect(within(table).getByRole("rowheader", { name: "Grupo A · 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Valor" }));
    expect(table.querySelectorAll("tbody.ui-group")).toHaveLength(0);
    expect(within(table).queryByRole("rowheader")).toBeNull();
  });

  it("no celular, com `compact`, vira lista densa: título, linha secundária, valor e ações", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("max-width"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      render(<DataTable caption="Gastos" rows={ROWS} columns={COLUMNS} rowKey={row => row.id} rowLabel={row => row.name} selectable
        compact={{ title: row => row.name, meta: row => ["05/09", row.amount > 100 ? "Casa" : null], amount: row => `R$ ${row.amount}`, actions: row => <button type="button">Ações de {row.name}</button> }} />);
      expect(screen.queryByRole("table")).toBeNull();
      const list = screen.getByRole("list", { name: "Gastos" });
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      expect(items[0]!.querySelector(".ui-compact-title")!.textContent).toBe("Mercado");
      expect(items[0]!.querySelector(".ui-compact-meta")!.textContent).toBe("05/09 · Casa");
      expect(items[1]!.querySelector(".ui-compact-meta")!.textContent).toBe("05/09");
      expect(items[0]!.querySelector(".ui-compact-amount")!.textContent).toBe("R$ 300");
      expect(within(items[2]!).getByRole("button", { name: "Ações de Netflix" })).toBeTruthy();
      // Phones: checkboxes appear only after "Selecionar", so rows keep their width.
      expect(within(items[1]!).queryByRole("checkbox")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));
      fireEvent.click(within(list.querySelectorAll("li")[1] as HTMLElement).getByRole("checkbox", { name: "Selecionar Água" }));
      expect(screen.getByRole("region", { name: "Ações em lote" }).textContent).toContain("1 selecionado");
    } finally {
      window.matchMedia = original;
    }
  });

  it("janela renderiza só as linhas visíveis em listas longas", () => {
    const many = Array.from({ length: 500 }, (_, index) => ({ id: index + 1, name: `Item ${index + 1}`, amount: index }));
    render(<DataTable caption="Longa" rows={many} columns={COLUMNS.slice(0, 2)} rowKey={row => row.id} virtualize={{ rowHeight: 40, height: 400 }} />);
    const rendered = document.querySelectorAll("tbody tr:not(.ui-spacer)").length;
    expect(rendered).toBeLessThan(40);
    expect(screen.getByRole("table").getAttribute("aria-rowcount")).toBe("501");
    const wrap = document.querySelector(".table-wrap")!;
    Object.defineProperty(wrap, "scrollTop", { value: 4000, configurable: true });
    fireEvent.scroll(wrap);
    expect(screen.getByText("Item 101")).toBeTruthy();
    expect(screen.queryByText("Item 1")).toBeNull();
  });
});

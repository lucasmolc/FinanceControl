// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";
import { pageItems } from "./pageItems";

afterEach(cleanup);

describe("Pagination", () => {
  it("itens com reticências", () => {
    expect(pageItems(6, 20, 1)).toEqual([1, "gap", 5, 6, 7, "gap", 20]);
    expect(pageItems(1, 5, 1)).toEqual([1, 2, "gap", 5]);
    expect(pageItems(3, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it("navegação acessível com página atual e resumo", () => {
    const onChange = vi.fn();
    render(<Pagination page={1} pageCount={4} total={180} pageSize={50} onChange={onChange} />);
    expect(screen.getByRole("navigation", { name: "Paginação" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Página 1" }).getAttribute("aria-current")).toBe("page");
    expect((screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(screen.getByText("Mostrando 1–50 de 180")).toBeTruthy();
  });
});

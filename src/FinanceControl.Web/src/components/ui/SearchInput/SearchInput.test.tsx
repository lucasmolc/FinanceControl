// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "./SearchInput";

afterEach(cleanup);

function Harness({ onOuterKey }: { onOuterKey: (key: string) => void }) {
  const [value, setValue] = useState("");
  return <div onKeyDown={event => onOuterKey(event.key)}><SearchInput aria-label="Buscar" value={value} onChange={setValue} /></div>;
}

describe("SearchInput", () => {
  it("limpa pelo botão e por Esc (sem propagar enquanto há texto)", () => {
    const outer = vi.fn();
    render(<Harness onOuterKey={outer} />);
    const box = screen.getByRole("searchbox", { name: "Buscar" }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "mercado" } });
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(box.value).toBe("");
    fireEvent.change(box, { target: { value: "ifood" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.value).toBe("");
    expect(outer).not.toHaveBeenCalledWith("Escape");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(outer).toHaveBeenCalledWith("Escape");
  });
});

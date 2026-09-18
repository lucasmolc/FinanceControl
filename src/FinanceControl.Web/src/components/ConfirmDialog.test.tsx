// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ConfirmProvider } from "./ConfirmDialog";
import { useConfirm } from "./useConfirm";

function Harness() {
  const confirm = useConfirm();
  const [result, setResult] = useState("pendente");
  return <div className="shell">
    <button onClick={() => void confirm({ title: "Remover \"Aluguel\"?", message: "O registro continua no histórico.", confirmLabel: "Remover", tone: "danger" }).then(value => setResult(String(value)))}>Abrir</button>
    <output>{result}</output>
  </div>;
}

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("resolve true ao confirmar e restaura o foco", async () => {
    render(<ConfirmProvider><Harness /></ConfirmProvider>);
    const opener = screen.getByRole("button", { name: "Abrir" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("alertdialog", { name: "Remover \"Aluguel\"?" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" })));
    expect(document.querySelector(".shell")?.closest("[inert]")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(screen.getByText("true")).toBeTruthy());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.querySelector(".shell")?.closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("resolve false com Escape ou Cancelar", async () => {
    render(<ConfirmProvider><Harness /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.getByText("false")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByText("false")).toBeTruthy();
  });
});

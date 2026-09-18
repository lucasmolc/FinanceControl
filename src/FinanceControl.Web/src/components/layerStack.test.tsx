// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog } from "./Dialog";
import { hasOpenLayer } from "./layerStack";
import { CommandPalette } from "./ui/CommandPalette";
import { Drawer } from "./ui/Drawer";

afterEach(cleanup);

function Stack({ top }: { top: "drawer" | "palette" }) {
  const [dialog, setDialog] = useState(true);
  const [layer, setLayer] = useState(true);
  return <div id="root-content">
    {dialog && <Dialog title="Editar lançamento" onClose={() => setDialog(false)}><input aria-label="Descrição" /></Dialog>}
    {top === "drawer"
      ? <Drawer open={layer} onClose={() => setLayer(false)} title="Histórico"><button type="button">Item</button></Drawer>
      : <CommandPalette open={layer} onClose={() => setLayer(false)} commands={[{ id: "a", label: "Painel", run: () => undefined }]} />}
  </div>;
}

describe("MEL-46 · pilha única de camadas (Esc)", () => {
  it.each(["drawer", "palette"] as const)("Esc em %s aberto sobre um Dialog fecha só a camada de cima", top => {
    render(<Stack top={top} />);
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Editar lançamento" })).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasOpenLayer()).toBe(false);
  });
});

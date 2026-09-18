// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileUpload } from "./FileUpload";

afterEach(cleanup);

const input = () => document.querySelector<HTMLInputElement>("input[type=file]")!;

describe("FileUpload", () => {
  it("rejeita formato e tamanho com mensagens pt-BR", () => {
    const onChange = vi.fn();
    render(<FileUpload label="Logo" onChange={onChange} maxBytes={10} />);
    fireEvent.change(input(), { target: { files: [new File(["abc"], "nota.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toContain("Formato não suportado. Use uma imagem PNG, JPG, WEBP ou SVG");
    fireEvent.change(input(), { target: { files: [new File(["0123456789ABC"], "logo.png", { type: "image/png" })] } });
    expect(screen.getByRole("alert").textContent).toContain("Arquivo maior que");
    expect(onChange).not.toHaveBeenCalled();
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });

  it("lê imagem válida como data URL (também por arrastar e soltar)", async () => {
    const onChange = vi.fn();
    render(<FileUpload label="Logo" onChange={onChange} />);
    const file = new File(["png"], "logo.png", { type: "image/png" });
    fireEvent.drop(document.querySelector(".ui-dropzone")!, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(String(onChange.mock.calls[0]![0])).toMatch(/^data:image\/png;base64,/);
  });

  it("modo arquivo entrega o File sem ler", () => {
    const onFile = vi.fn();
    const onChange = vi.fn();
    render(<FileUpload label="Backup" accept={[".json"]} acceptLabel="JSON" readAs="file" onFile={onFile} onChange={onChange} />);
    fireEvent.change(input(), { target: { files: [new File(["{}"], "backup.json", { type: "application/json" })] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Trocar" })).toBeTruthy();
    expect(screen.getByText("backup.json")).toBeTruthy();
  });
});

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

afterEach(cleanup);

describe("Avatar", () => {
  it("iniciais com nome acessível e cor determinística", () => {
    render(<><Avatar name="Lucas Mol" /><Avatar name="Lucas Mol" size="lg" /></>);
    const [a, b] = screen.getAllByRole("img", { name: "Lucas Mol" });
    expect(a!.textContent).toBe("LM");
    expect(a!.style.getPropertyValue("--avatar-bg")).toBe(b!.style.getPropertyValue("--avatar-bg"));
    expect(b!.style.width).toBe("48px");
  });
});

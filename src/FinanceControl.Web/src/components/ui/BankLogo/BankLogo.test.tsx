// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BankLogo } from "./BankLogo";

afterEach(cleanup);

describe("BankLogo", () => {
  it("detecta o banco pela instituição (36 px por padrão) e ignora serviços", () => {
    const { container } = render(<><BankLogo institution="Banco Inter S.A." /><BankLogo institution="Netflix" /></>);
    const inter = screen.getByRole("img", { name: "Inter" });
    expect(inter.style.width).toBe("36px");
    expect((container.querySelectorAll(".bank-logo")[1] as HTMLElement).dataset.brand).toBe("outro");
  });
});

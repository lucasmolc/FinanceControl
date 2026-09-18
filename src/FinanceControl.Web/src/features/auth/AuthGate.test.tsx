// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "../../api/client";
import { AuthGate } from "./AuthGate";
import { validateCredentials } from "./authModel";
import { useSession } from "./sessionContext";

type Route = (url: string, init?: RequestInit) => { status: number; body?: unknown };

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const serve = (route: Route) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => { const { status, body } = route(url, init); return reply(status, body); });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const unauthorized = { status: 401, body: { title: "Sua sessão expirou ou não foi iniciada. Entre novamente.", status: 401 } };

function Protected() {
  const session = useSession();
  return <p>Painel de {session?.user.username}</p>;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AuthGate", () => {
  it("mostra o login sem sessão e libera o app depois de entrar", async () => {
    const fetchMock = serve((url, init) => {
      if (url === "/api/auth/me") return unauthorized;
      if (url === "/api/auth/login" && init?.method === "POST") return { status: 200, body: { id: 1, username: "ana" } };
      return { status: 404 };
    });
    render(<AuthGate><Protected /></AuthGate>);

    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
    expect(screen.queryByText(/Painel de/)).toBeNull();

    type("Usuário", "Ana");
    type("Senha", "segredo-123");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Painel de ana")).toBeTruthy();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/auth/login")!;
    expect(JSON.parse(String(init?.body))).toEqual({ username: "Ana", password: "segredo-123" });
    expect((init?.headers as Record<string, string>)["X-Requested-With"]).toBe("FinanceControl");
  });

  it("mostra o erro do servidor no login sem revelar qual campo errou", async () => {
    serve(url => url === "/api/auth/me" ? unauthorized : { status: 401, body: { title: "Usuário ou senha inválidos.", status: 401 } });
    render(<AuthGate><Protected /></AuthGate>);
    await screen.findByRole("heading", { name: "Entrar" });

    type("Usuário", "ana");
    type("Senha", "errada-123");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Usuário ou senha inválidos.");
    expect(screen.queryByText(/Painel de/)).toBeNull();
  });

  it("cria conta, confere a confirmação da senha e mostra erros por campo vindos do servidor", async () => {
    const fetchMock = serve(url => url === "/api/auth/me" ? unauthorized
      : { status: 400, body: { title: "Dados inválidos.", status: 400, errors: { username: ["Este nome de usuário já está em uso."] } } });
    render(<AuthGate><Protected /></AuthGate>);
    fireEvent.click(await screen.findByRole("button", { name: "Criar conta" }));
    expect(screen.getByRole("heading", { name: "Criar conta" })).toBeTruthy();

    type("Usuário", "ana");
    type("Senha", "segredo-123");
    type("Confirmar senha", "outra-senha");
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText("As senhas não conferem.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/auth/register")).toBe(false);

    type("Confirmar senha", "segredo-123");
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText("Este nome de usuário já está em uso.")).toBeTruthy();
  });

  it("encerra a sessão quando qualquer requisição recebe 401 e ao sair", async () => {
    let signedIn = true;
    serve((url, init) => {
      if (url === "/api/auth/me") return { status: 200, body: { id: 2, username: "bia" } };
      if (url === "/api/auth/logout" && init?.method === "POST") return { status: 204 };
      return signedIn ? { status: 200, body: {} } : unauthorized;
    });
    const ended = vi.fn();
    function Logout() {
      const session = useSession();
      return <button type="button" onClick={() => void session?.logout()}>Sair</button>;
    }
    render(<AuthGate onSessionEnded={ended}><Protected /><Logout /></AuthGate>);
    await screen.findByText("Painel de bia");

    signedIn = false;
    await expect(api.state()).rejects.toMatchObject({ status: 401 });
    expect(ended).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(ended).toHaveBeenCalledTimes(2));
  });

  it("oferece tentar de novo quando o servidor não responde", async () => {
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return reply(200, { id: 1, username: "ana" });
    }));
    render(<AuthGate><Protected /></AuthGate>);
    expect(await screen.findByRole("heading", { name: "Servidor indisponível" })).toBeTruthy();

    online = true;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Painel de ana")).toBeTruthy();
  });
});

describe("validateCredentials", () => {
  it("espelha as regras do servidor no cadastro e só exige preenchimento no login", () => {
    expect(validateCredentials("register", { username: "ab", password: "curta", confirm: "" })).toEqual({
      username: "Use de 3 a 32 caracteres entre letras minúsculas, números, ponto, - e _.",
      password: "A senha deve ter entre 8 e 128 caracteres.",
    });
    expect(validateCredentials("register", { username: " Ana.Silva ", password: "segredo-123", confirm: "segredo-123" })).toEqual({});
    expect(validateCredentials("login", { username: "ab", password: "x", confirm: "" })).toEqual({});
    expect(validateCredentials("login", { username: " ", password: "", confirm: "" })).toEqual({ username: "Campo obrigatório.", password: "Campo obrigatório." });
  });
});

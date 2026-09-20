import { useState, type FormEvent } from "react";
import { ApiError, errorMessage } from "../../api/client";
import { auth, type SessionUser } from "../../api/auth";
import { Logo } from "../../components/Logo";
import { Field } from "../../components/ui";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { validateCredentials, type AuthMode, type CredentialErrors } from "./authModel";

/** Login and open sign-up (a new account starts empty; each user sees only their own data). */
export function LoginPage({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";

  const switchMode = () => {
    setMode(registering ? "login" : "register");
    setErrors({});
    setFormError(null);
    setPassword("");
    setConfirm("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateCredentials(mode, { username, password, confirm });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const credentials = { username: username.trim(), password };
      onSignedIn(registering ? await auth.register(credentials) : await auth.login(credentials));
    } catch (reason) {
      const fields = reason instanceof ApiError ? reason.fields : {};
      if (fields.username || fields.password) setErrors({ username: fields.username, password: fields.password });
      else setFormError(errorMessage(reason));
      setBusy(false);
    }
  };

  return <main className="auth-screen">
    <section className="card auth-card" aria-labelledby="auth-title">
      <Logo size={36} />
      <div className="auth-heading">
        <h1 id="auth-title">{registering ? "Criar conta" : "Entrar"}</h1>
        <p className="muted">{registering ? "A conta nova começa vazia. Cada usuário vê apenas os próprios dados." : "Entre para ver as suas finanças."}</p>
      </div>
      <form onSubmit={event => void submit(event)} noValidate>
        <Field label="Usuário" error={errors.username} hint={registering ? "3 a 32 caracteres: letras minúsculas, números, ponto, - e _." : undefined} required>
          <input name="username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
        </Field>
        <Field label="Senha" error={errors.password} hint={registering ? "Mínimo de 8 caracteres." : undefined} required>
          <input name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={registering ? "new-password" : "current-password"} />
        </Field>
        {registering && <Field label="Confirmar senha" error={errors.confirm} required>
          <input name="confirm" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" />
        </Field>}
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Button type="submit" variant="primary" fullWidth loading={busy}>{registering ? "Criar conta" : "Entrar"}</Button>
      </form>
      <p className="auth-switch">
        {registering ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
        <Button variant="link" onClick={switchMode}>{registering ? "Entrar" : "Criar conta"}</Button>
      </p>
    </section>
    {/* Versão do sistema: discreta, abaixo do cartão, para identificar o que está instalado. */}
    <p className="auth-version">Versão {__APP_VERSION__}</p>
  </main>;
}

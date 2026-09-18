// Client-side mirror of the server rules (AccountService): instant feedback; the server stays the authority.
export type AuthMode = "login" | "register";
export interface CredentialErrors { username?: string; password?: string; confirm?: string; }

const REQUIRED = "Campo obrigatório.";
const USERNAME = /^[a-z0-9._-]{3,32}$/;

export function validateCredentials(mode: AuthMode, values: { username: string; password: string; confirm: string }): CredentialErrors {
  const errors: CredentialErrors = {};
  const username = values.username.trim().toLowerCase();
  if (!username) errors.username = REQUIRED;
  else if (mode === "register" && !USERNAME.test(username)) errors.username = "Use de 3 a 32 caracteres entre letras minúsculas, números, ponto, - e _.";
  if (!values.password) errors.password = REQUIRED;
  else if (mode === "register" && (values.password.length < 8 || values.password.length > 128)) errors.password = "A senha deve ter entre 8 e 128 caracteres.";
  if (mode === "register" && !errors.password && values.confirm !== values.password) errors.confirm = "As senhas não conferem.";
  return errors;
}

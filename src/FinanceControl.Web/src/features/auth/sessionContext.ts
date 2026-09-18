import { createContext, useContext } from "react";
import type { SessionUser } from "../../api/auth";

export interface Session {
  user: SessionUser;
  /** Ends the session on the server and returns to the login screen. */
  logout: () => Promise<void>;
}

/** Null outside the auth gate (isolated page tests): session-only UI such as the account section is hidden. */
export const SessionContext = createContext<Session | null>(null);

export const useSession = (): Session | null => useContext(SessionContext);

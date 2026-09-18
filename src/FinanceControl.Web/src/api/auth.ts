/** Session endpoints: open sign-up, login, logout and the current user. */
import { json, request } from "./client";

export interface SessionUser { id: number; username: string; }
export interface Credentials { username: string; password: string; }

export const auth = {
  me: () => request<SessionUser>("/api/auth/me"),
  login: (credentials: Credentials) => request<SessionUser>("/api/auth/login", json("POST", credentials)),
  register: (credentials: Credentials) => request<SessionUser>("/api/auth/register", json("POST", credentials)),
  logout: () => request<void>("/api/auth/logout", json("POST")),
};

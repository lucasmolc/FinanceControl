import { useCallback, useEffect, useRef, useState } from "react";
import { pageFromHash, paramsFromHash, routeFor } from "../components/navigation";
import { resetPageScroll, runViewTransition } from "../lib/viewTransition";
import type { PageId, RouteParams } from "../types";

/** Blocks page changes while a page has unsaved changes (MEL-10). */
export interface RouteGuard {
  isBlocked: () => boolean;
  /** Resolves true to discard the changes and leave. */
  confirmLeave: () => Promise<boolean>;
}

export type Navigate = (page: PageId, params?: RouteParams) => void;

interface RouteState { page: PageId; params: RouteParams; }

const sameParams = (left: RouteParams, right: RouteParams) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Current page and hash query params from `location.hash` (`#/painel`, `#/lancamentos?categoria=3`, ...) and a navigate
 * function that updates the hash. Page changes run inside a view transition when supported (MEL-37).
 * With a `guard`, in-app navigation to another page asks first, and back/forward hash changes are reverted until confirmed.
 * Query-only changes on the same page never ask.
 */
export function useHashRoute(guard?: RouteGuard): [PageId, Navigate, RouteParams] {
  const [route, setRoute] = useState<RouteState>(() => ({ page: pageFromHash(window.location.hash), params: paramsFromHash(window.location.hash) }));
  const routeRef = useRef(route);
  const guardRef = useRef(guard);
  /** Route of an in-app navigation already confirmed: its hashchange is not asked again. */
  const allowedRef = useRef<string | null>(null);

  useEffect(() => { guardRef.current = guard; }, [guard]);

  useEffect(() => {
    const commit = (next: RouteState) => {
      const pageChanged = next.page !== routeRef.current.page;
      routeRef.current = next;
      // Decision 6: a page change always starts at the top (the focus moves to the new h1 without scrolling).
      if (pageChanged) runViewTransition(() => { setRoute(next); resetPageScroll(); });
      else setRoute(next);
    };
    const onHashChange = () => {
      const hash = window.location.hash;
      const next = { page: pageFromHash(hash), params: paramsFromHash(hash) };
      const allowed = allowedRef.current === hash;
      allowedRef.current = null;
      const current = routeRef.current;
      if (next.page === current.page) {
        if (!sameParams(next.params, current.params)) commit(next);
        return;
      }
      const activeGuard = guardRef.current;
      if (allowed || !activeGuard?.isBlocked()) { commit(next); return; }
      // Back/forward (or a typed URL) while editing: put the current route back and ask.
      window.history.replaceState(window.history.state, "", routeFor(current.page, current.params));
      void activeGuard.confirmLeave().then(leave => {
        if (!leave) return;
        window.history.replaceState(window.history.state, "", hash);
        commit(next);
      });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback<Navigate>((next, params) => {
    const target = routeFor(next, params);
    if (window.location.hash === target) return;
    void (async () => {
      const activeGuard = guardRef.current;
      if (next !== routeRef.current.page && activeGuard?.isBlocked() && !await activeGuard.confirmLeave()) return;
      allowedRef.current = target;
      window.location.hash = target;
    })();
  }, []);

  return [route.page, navigate, route.params];
}

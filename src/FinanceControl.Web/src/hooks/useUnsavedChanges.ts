import { useContext, useEffect, useState } from "react";
import { UnsavedChangesContext } from "../components/unsavedChanges";

/** Marks the calling page as having unsaved changes while `dirty`; navigation then asks "Descartar alterações não salvas?". */
export function useUnsavedChanges(dirty: boolean): void {
  const registry = useContext(UnsavedChangesContext);
  const [token] = useState(() => Symbol("unsaved-changes"));
  useEffect(() => {
    if (!registry) return;
    registry.set(token, dirty);
    return () => registry.set(token, false);
  }, [registry, token, dirty]);
}

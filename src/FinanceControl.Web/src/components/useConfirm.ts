import { useContext } from "react";
import { ConfirmContext, type ConfirmFn } from "./confirmContext";

/** Returns `confirm(options) => Promise<boolean>`; requires a `ConfirmProvider` above. Replaces window.confirm. */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm precisa estar dentro de ConfirmProvider.");
  return confirm;
}

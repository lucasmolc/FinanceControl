import { useContext } from "react";
import { ToastContext, type ToastApi } from "../components/toastContext";

/** `{ toast, dismiss }` from the nearest ToastProvider (MEL-28). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast precisa estar dentro de ToastProvider.");
  return api;
}

import { Eye, EyeOff } from "lucide-react";
import { errorMessage } from "../api/client";
import { usePreferences } from "../hooks/usePreferences";
import { useToast } from "../hooks/useToast";

/** Topbar eye button: privacy mode on/off (MEL-30 "ocultar valores"); optimistic, persisted in ui_preferences. */
export function HideValuesToggle() {
  const { preferences, update } = usePreferences();
  const { toast } = useToast();
  const hidden = preferences.hide_values;
  const toggle = () => {
    update({ hide_values: !hidden }).catch(reason => toast({ tone: "error", message: errorMessage(reason, "Não foi possível salvar a preferência.") }));
  };
  return <button type="button" className="icon-btn hide-values-toggle" aria-pressed={hidden} aria-label="Ocultar valores"
    title={hidden ? "Mostrar valores" : "Ocultar valores"} onClick={toggle}>
    {hidden ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
  </button>;
}

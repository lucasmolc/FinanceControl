import { useId, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { Field } from "../../components/ui";
import { Select } from "../../components/ui/Select";
import { noneLabel, type ReassignChoice, type ReassignModule } from "./reassign";

export interface ReassignDialogProps {
  module: ReassignModule;
  label: string;
  /** e.g. "Usada em 3 lançamentos, 1 conta e 2 assinaturas." */
  linksMessage: string;
  targets: [string, string][];
  /** `null` = cancelled. */
  onResolve: (choice: ReassignChoice | null) => void;
}

const KEEP = "keep";
const NONE = "none";

/** Removal confirmation for a category/card with links: shows the counts and offers "Mover vínculos para" (MEL-09). */
export function ReassignDialog({ module, label, linksMessage, targets, onResolve }: ReassignDialogProps) {
  const messageId = useId();
  const [target, setTarget] = useState(KEEP);
  const cards = module === "cards";

  const confirm = () => {
    if (target === KEEP) { onResolve({ move: false }); return; }
    if (target === NONE) { onResolve({ move: true, targetId: null, targetName: noneLabel(module) }); return; }
    const name = targets.find(([value]) => value === target)?.[1] ?? "";
    onResolve({ move: true, targetId: Number(target), targetName: name });
  };

  return <Dialog
    role="alertdialog"
    title={`Remover "${label}"?`}
    describedBy={messageId}
    onClose={() => onResolve(null)}
    footer={<>
      <button type="button" className="btn ghost" onClick={() => onResolve(null)}>Cancelar</button>
      <button type="button" className="btn danger" onClick={confirm}>Remover</button>
    </>}
  >
    <div id={messageId} className="stack">
      <p><b>{linksMessage}</b></p>
      <p className="muted">{cards ? "O cartão" : "A categoria"} sai das listas; os registros vinculados continuam existindo. Você pode mover os vínculos agora ou mantê-los, marcados como "(removido)".</p>
    </div>
    <Field label="Mover vínculos para" hint="Desfazer a remoção restaura o registro, mas os vínculos movidos continuam no destino escolhido.">
      <Select value={target} onChange={setTarget} options={[
        { value: KEEP, label: "Não mover (manter vínculos)" },
        { value: NONE, label: noneLabel(module) },
        ...targets.map(([value, name]) => ({ value, label: name })),
      ]} />
    </Field>
  </Dialog>;
}

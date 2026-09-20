import { useState } from "react";
import { CircleHelp, Lightbulb } from "lucide-react";
import { Drawer } from "../../components/ui/Drawer";
import type { PageId } from "../../types";
import { helpFor } from "./pageHelp";

export interface HelpButtonProps {
  page: PageId;
  /** Nome da tela, usado no título e no rótulo do botão. */
  label: string;
}

/**
 * Ajuda da tela atual: um botão discreto no topo que abre o que cada função faz e a melhor forma de usá-la.
 * O conteúdo vem de `pageHelp`; telas sem texto de ajuda simplesmente não mostram o botão.
 */
export function HelpButton({ page, label }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const help = helpFor(page);
  if (!help) return null;

  return <>
    <button type="button" className="icon-btn help-trigger" aria-label={`Ajuda desta tela: ${label}`} title={`Como usar ${label}`}
      aria-expanded={open} onClick={() => setOpen(true)}>
      <CircleHelp size={18} aria-hidden="true" />
    </button>
    <Drawer open={open} title={`Como usar · ${label}`} description={help.intro} size="md" onClose={() => setOpen(false)}
      footer={<button type="button" className="btn" onClick={() => setOpen(false)}>Fechar</button>}>
      <div className="stack help-panel">
        <dl className="help-topics">
          {help.topics.map(topic => <div key={topic.title} className="help-topic">
            <dt>{topic.title}</dt>
            <dd className="muted">{topic.body}</dd>
          </div>)}
        </dl>
        {help.watch && help.watch.length > 0 && <div className="help-watch" role="note">
          <p className="help-watch-title"><Lightbulb size={15} aria-hidden="true" /> Fique de olho</p>
          <ul className="list">{help.watch.map(item => <li key={item}>{item}</li>)}</ul>
        </div>}
      </div>
    </Drawer>
  </>;
}

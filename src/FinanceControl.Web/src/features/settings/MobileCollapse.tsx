import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useMediaQuery } from "../dashboard/useMediaQuery";
import { SETTINGS_OPEN_SECTION } from "./settingsModel";

/** Same breakpoint as the phone settings index (pills above the sections). */
const PHONE_QUERY = "(max-width: 980px)";

/**
 * R4-CFG-1: on phones a secondary settings section shows only its header and a one-line toggle, so the page stays
 * short; the settings index (or `open`, e.g. while restoring) opens it. Desktop always shows the content.
 * The content stays mounted while closed (`hidden`), so its state (file picker, busy) survives.
 */
export function MobileCollapse({ section, summary, open: forceOpen = false, children }: { section: string; summary: string; open?: boolean; children: ReactNode }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  useEffect(() => {
    const onOpen = (event: Event) => { if ((event as CustomEvent<string>).detail === section) setOpen(true); };
    window.addEventListener(SETTINGS_OPEN_SECTION, onOpen);
    return () => window.removeEventListener(SETTINGS_OPEN_SECTION, onOpen);
  }, [section]);

  if (!phone) return <>{children}</>;
  const expanded = open || forceOpen;
  return <>
    <button type="button" className="btn row settings-collapse-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setOpen(!expanded)}>
      <span>{expanded ? "Recolher" : summary}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    <div id={bodyId} className="settings-collapse-body" hidden={!expanded}>{children}</div>
  </>;
}

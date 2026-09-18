import { BankLogo } from "../../components/ui/BankLogo";
import type { CSSProperties } from "react";
import { brandById } from "../../lib/brands";
import { cardNetworkLabels, labelFor } from "../../lib/labels";
import { cardColor, cardInk } from "./cardInk";

export interface VisualCardProps {
  name: string;
  brand?: string | null;
  network?: string | null;
  color?: string | null;
  dueDay?: number | null;
  closingDay?: number | null;
  compact?: boolean;
  /** Last digits (CR-21) shown as "•••• 1234"; without them the number line is left out instead of a fake one. */
  lastDigits?: string | null;
}


const NETWORKS = new Set(["visa", "mastercard", "elo", "amex", "hipercard"]);

/**
 * Credit card drawn as a card (MEL-35): issuer badge, network mark, chip, name and due day on `--card-color`.
 * The ink (white or near-black) is computed in code (`cardInk`) so every text passes AA on any chosen color; the
 * surface is nudged darker/lighter only when no ink could pass. Network marks are typographic evocations, not artwork.
 */
export function VisualCard({ name, brand, network, color, dueDay, closingDay, compact = false, lastDigits }: VisualCardProps) {
  const ink = cardInk(cardColor(color, brand));
  const digits = lastDigits && /^\d{2,4}$/.test(lastDigits) ? lastDigits : null;
  const issuer = brandById(brand);
  const networkId = network && NETWORKS.has(network) ? network : "other";
  const networkLabel = network ? labelFor(cardNetworkLabels, network, "") : "";
  // Plain `.visual-card` markup (DESIGN.md contract): the ui Card "credit" variant forces white ink in the components
  // layer, which would defeat the contrast computed here.
  return <div className={`visual-card network-${networkId}${compact ? " is-compact" : ""}`} data-contrast={ink.contrast} style={{ "--card-color": ink.surface } as CSSProperties}>
    <div className="visual-card-top">
      <span className="visual-card-issuer">
        {issuer && <BankLogo brand={issuer.id} size={compact ? 22 : 28} decorative />}
        <span>{issuer?.name ?? "Cartão de crédito"}</span>
      </span>
      {networkLabel && <span className="visual-card-network">{networkLabel}</span>}
    </div>
    <span className="visual-card-chip" aria-hidden="true" />
    {digits && <span className="visual-card-number">•••• {digits}</span>}
    <div className="visual-card-bottom">
      <span className="visual-card-name">{name}</span>
      {dueDay ? <span className="visual-card-meta"><small>{closingDay ? `Fecha dia ${closingDay}` : "Vence"}</small><b>{closingDay ? `Vence dia ${dueDay}` : `dia ${dueDay}`}</b></span> : null}
    </div>
  </div>;
}

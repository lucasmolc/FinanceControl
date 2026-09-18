import { forwardRef } from "react";
import { BrandBadge, type BrandBadgeProps } from "../BrandBadge/BrandBadge";

export interface BankLogoProps extends Omit<BrandBadgeProps, "name" | "kind"> {
  /** Institution text ("Nubank", "Banco Inter"): detects the brand when `brand` is empty. */
  institution?: string | null;
}

/** Bank/broker badge (MEL-33): `BrandBadge` restricted to bank brands; default 36 px. */
export const BankLogo = forwardRef<HTMLSpanElement, BankLogoProps>(function BankLogo({ institution, size = 36, ...rest }, ref) {
  return <BrandBadge ref={ref} name={institution} kind="bank" size={size} {...rest} />;
});

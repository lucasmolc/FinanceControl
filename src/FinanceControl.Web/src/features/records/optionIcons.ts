import { createElement, type ReactNode } from "react";
import { CreditCard, GraduationCap, Plane, ShieldCheck, ShoppingBag, Sunset, Target, type LucideIcon } from "lucide-react";
import { BankLogo } from "../../components/ui/BankLogo";
import { CategoryIcon } from "../../components/ui/CategoryIcon";
import type { FinanceState } from "../../types";
import { findById } from "./formUtils";

// Option icons for SelectField (MEL-42): bank logos, category glyphs and card chips next to each option.
// Built with createElement so this stays a plain module (react-refresh: component files export components only).

/** Bank logo of an account id (options of account selects). */
export const accountIcon = (state: FinanceState) => (id: string): ReactNode => {
  const account = findById(state.bank_accounts, id);
  return createElement(BankLogo, { institution: account?.institution ?? null, brand: account?.brand ?? null, logo: account?.logo_data ?? null, size: 20, decorative: true });
};

/** Category glyph of a category id (options of category selects). */
export const categoryIcon = (state: FinanceState) => (id: string): ReactNode => {
  const category = findById(state.categories, id);
  return createElement(CategoryIcon, { icon: category?.icon ?? null, color: category?.color ?? null, name: category?.name ?? null, kind: category?.kind, size: 20 });
};

/** Issuer badge (or a card glyph) of a card id (options of card selects). */
export const cardIcon = (state: FinanceState) => (id: string): ReactNode => {
  const card = findById(state.cards, id);
  return card?.brand
    ? createElement(BankLogo, { brand: card.brand, institution: card.name, size: 20, decorative: true })
    : createElement(CreditCard, { size: 16, "aria-hidden": true });
};

const GOAL_TYPE_ICONS: Record<string, LucideIcon> = { emergency: ShieldCheck, travel: Plane, purchase: ShoppingBag, education: GraduationCap, retirement: Sunset, custom: Target };

/** Glyph of a goal type (options of the goal type select and goal cards). */
export const goalTypeIcon = (type: string): ReactNode => createElement(GOAL_TYPE_ICONS[type] ?? Target, { size: 16, "aria-hidden": true });

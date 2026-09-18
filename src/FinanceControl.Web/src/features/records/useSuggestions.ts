import { useEffect, useRef } from "react";
import { detectBrand, suggestCategoryForBrand, type BrandKind } from "../../lib/brands";
import { detectIcon, type IconKind } from "../../lib/icons";
import type { Category } from "../../types";
import { checked, text } from "./formUtils";
import type { FieldsProps } from "./types";

export interface SuggestionOptions {
  /** Brand catalog to detect from (false: no brand field). */
  brand?: BrandKind | false;
  /** Glyph kind to detect (false: no icon field). */
  icon?: IconKind | false;
  brandKey?: string;
  iconKey?: string;
}

/**
 * MEL-33/39: suggests `brand` and `icon` from free text (name/description/institution) while the user has not picked
 * them (`<key>_touched`). A detected brand's default glyph wins over text detection for the icon.
 */
export function useBrandIconSuggestions(f: FieldsProps, source: string, { brand = false, icon = false, brandKey = "brand", iconKey = "icon" }: SuggestionOptions): void {
  const setRef = useRef(f.set);
  useEffect(() => { setRef.current = f.set; });
  const brandTouched = checked(f.form, `${brandKey}_touched`);
  const iconTouched = checked(f.form, `${iconKey}_touched`);
  const currentBrand = text(f.form, brandKey);
  const currentIcon = text(f.form, iconKey);

  useEffect(() => {
    const detectedBrand = brand ? detectBrand(source, brand) : null;
    if (brand && !brandTouched) {
      const next = detectedBrand?.id ?? "";
      if (next !== currentBrand) setRef.current(brandKey, next);
    }
    if (icon && !iconTouched) {
      const next = detectedBrand?.icon ?? detectIcon(source, icon) ?? "";
      if (next !== currentIcon) setRef.current(iconKey, next);
    }
  }, [source, brand, icon, brandKey, iconKey, brandTouched, iconTouched, currentBrand, currentIcon]);
}

/**
 * CR-26: the user's category that fits the detected brand (Netflix → "Assinaturas"). In create mode it fills an empty,
 * untouched category (`<key>_touched`) and follows the brand while the value is still automatic (`<key>_auto`); it never
 * overrides a choice. Returns the suggestion so the field can offer "Usar sugestão" in edit mode.
 */
export function useCategorySuggestion(f: FieldsProps, brandId: string, kind: string, key = "category_id"): Category | null {
  const setRef = useRef(f.set);
  useEffect(() => { setRef.current = f.set; });
  const suggestion = suggestCategoryForBrand(brandId, f.ctx.state.categories, kind);
  const next = suggestion ? String(suggestion.id) : "";
  const touched = checked(f.form, `${key}_touched`);
  const auto = checked(f.form, `${key}_auto`);
  const current = text(f.form, key);
  const create = f.ctx.mode === "create";

  useEffect(() => {
    if (!create || touched) return;
    if (current !== "" && !auto) return;
    if (next === current) return;
    setRef.current(key, next);
    setRef.current(`${key}_auto`, next !== "");
  }, [create, touched, auto, current, next, key]);

  return suggestion;
}

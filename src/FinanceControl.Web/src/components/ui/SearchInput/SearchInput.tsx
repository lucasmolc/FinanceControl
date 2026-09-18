import { forwardRef, useRef, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { mergeRefs } from "../shared/refs";

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "onChange" | "value"> {
  value: string;
  onChange: (text: string) => void;
  /** Called after "Limpar busca" / Esc (default: onChange("")). */
  onClear?: () => void;
  size?: Size;
}

/** Search field with icon and clear button; Esc clears (and only then lets the key reach dialogs). */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput({ value, onChange, onClear, size = "md", className, placeholder = "Buscar…", onKeyDown, ...rest }, ref) {
  const inner = useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange("");
    onClear?.();
    inner.current?.focus();
  };
  return <div className={cx("ui-search ui-control", sizeClass(size), className)}>
    <Search className="ui-search-icon" size={size === "sm" ? 14 : 16} aria-hidden="true" />
    <input
      ref={mergeRefs(ref, inner)}
      type="search"
      className="ui-search-input"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Escape" && value) { event.preventDefault(); event.stopPropagation(); clear(); }
      }}
      {...rest}
    />
    {value && <button type="button" className="ui-search-clear" aria-label="Limpar busca" onClick={clear}><X size={14} aria-hidden="true" /></button>}
  </div>;
});

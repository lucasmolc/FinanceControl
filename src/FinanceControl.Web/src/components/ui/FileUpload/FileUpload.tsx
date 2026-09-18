import { forwardRef, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { mergeRefs } from "../shared/refs";

export interface FileUploadProps {
  /** Current data URL (image logos) or null. */
  value?: string | null;
  /** Receives the file read as a data URL (or null when removed). Not called when `readAs="file"`. */
  onChange?: (dataUrl: string | null, file: File | null) => void;
  /** Receives the raw File (e.g. a backup to upload). */
  onFile?: (file: File) => void;
  /** "dataUrl" (default) reads the file; "file" only validates and hands over the File. */
  readAs?: "dataUrl" | "file";
  /** Accepted MIME types (default PNG/JPG/WEBP/SVG). */
  accept?: string[];
  /** Max size in bytes (default 150 KB). */
  maxBytes?: number;
  /** pt-BR list shown in messages, e.g. "PNG, JPG, WEBP ou SVG". */
  acceptLabel?: string;
  label?: ReactNode;
  hint?: ReactNode;
  /** Image preview of `value` (default true for images). */
  preview?: boolean;
  /** Called with the pt-BR validation message (also shown inline). */
  onError?: (message: string) => void;
  size?: Size;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * File picker with drag and drop (MEL-42): validates type and size client-side with pt-BR messages
 * ("Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB."), previews images and hands back a data URL (or the File).
 */
export const FileUpload = forwardRef<HTMLInputElement, FileUploadProps>(function FileUpload({ value = null, onChange, onFile, readAs = "dataUrl", accept = IMAGE_TYPES, maxBytes = 150 * 1024, acceptLabel = "PNG, JPG, WEBP ou SVG", label = "Enviar arquivo", hint, preview = true, onError, size = "md", disabled = false, id, className, ...aria }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isImage = accept.every(type => type.startsWith("image/"));
  const limitMessage = isImage ? `Use uma imagem ${acceptLabel} de até ${kb(maxBytes)}.` : `Use um arquivo ${acceptLabel} de até ${kb(maxBytes)}.`;

  const fail = (message: string) => { setError(message); onError?.(message); };

  const accepts = (file: File) => {
    if (!accept.length) return true;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    return accept.some(type => type === file.type || (type.startsWith(".") && type.slice(1) === extension) || (type.endsWith("/*") && file.type.startsWith(type.slice(0, -1))));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!accepts(file)) { fail(`Formato não suportado. ${limitMessage}`); return; }
    if (file.size > maxBytes) { fail(`Arquivo maior que ${kb(maxBytes)}. ${limitMessage}`); return; }
    setError(null);
    setFileName(file.name);
    onFile?.(file);
    if (readAs === "file") return;
    setBusy(true);
    try { onChange?.(await readDataUrl(file), file); }
    catch { fail("Não foi possível ler o arquivo."); }
    finally { setBusy(false); }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) void handleFile(event.dataTransfer.files?.[0]);
  };

  const remove = () => {
    setFileName(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onChange?.(null, null);
  };

  const describedBy = [aria["aria-describedby"], hintId, error ? errorId : undefined].filter(Boolean).join(" ");
  const showPreview = preview && value && value.startsWith("data:image/");

  return <div className={cx("ui-file-upload", sizeClass(size), dragging && "is-dragging", error && "is-invalid", disabled && "is-disabled", className)}>
    <div className="ui-dropzone" onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      {showPreview
        ? <img className="ui-file-preview" src={value} alt="Pré-visualização" />
        : <span className="ui-file-glyph" aria-hidden="true">{fileName ? <FileText size={22} /> : <Upload size={22} />}</span>}
      <div className="ui-file-text">
        <label htmlFor={inputId} className="ui-file-label">{label}</label>
        <p id={hintId} className="field-hint">{hint ?? <>Arraste até aqui ou escolha um arquivo. {limitMessage}</>}</p>
        {fileName && !error && <p className="ui-file-name" aria-live="polite">{busy ? "Lendo arquivo…" : fileName}</p>}
      </div>
      <div className="ui-file-actions">
        <button type="button" className="btn small" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>{value || fileName ? "Trocar" : "Escolher arquivo"}</button>
        {(value || fileName) && <button type="button" className="icon-btn danger" aria-label="Remover arquivo" disabled={disabled || busy} onClick={remove}><Trash2 size={16} aria-hidden="true" /></button>}
      </div>
      <input ref={mergeRefs(ref, inputRef)} id={inputId} type="file" className="sr-only" tabIndex={-1} accept={accept.join(",")} disabled={disabled} aria-describedby={describedBy}
        aria-invalid={error ? true : undefined} onChange={event => void handleFile(event.target.files?.[0])} />
    </div>
    {error && <p id={errorId} className="field-error" role="alert">{error}</p>}
  </div>;
});

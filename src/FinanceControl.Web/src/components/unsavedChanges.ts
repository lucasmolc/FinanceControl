import { createContext } from "react";

/** Pages with unsaved edits register here; App asks before internal navigation (MEL-10). */
export interface UnsavedChangesRegistry { set: (token: symbol, dirty: boolean) => void; }

export const UnsavedChangesContext = createContext<UnsavedChangesRegistry | null>(null);

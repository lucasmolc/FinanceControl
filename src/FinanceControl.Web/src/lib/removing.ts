import type { RecordModule, RemovingRecord } from "../types";

/** True while `module`/`id` is being removed (row disabled with "Removendo…", MEL-07). */
export const isRemoving = (removing: RemovingRecord | null | undefined, module: RecordModule, id: number): boolean =>
  removing?.module === module && removing.id === id;

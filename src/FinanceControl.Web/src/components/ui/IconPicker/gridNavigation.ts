/**
 * Keyboard movement in the IconPicker's grouped grid (MEL-46). Every group starts a new row of `columns` cells, so a
 * flat "index ± columns" drifts between groups. ↑/↓ instead keep the visual column: the next/previous row of the same
 * group, or the first/last row of the neighbouring group, clamped to that row's length. ←/→ walk the flat order.
 * `sizes` = number of items per group, in order. Returns the new flat index.
 */
export function gridMove(sizes: number[], index: number, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight", columns: number): number {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= 0) return 0;
  const current = Math.max(0, Math.min(total - 1, index));
  if (key === "ArrowRight") return Math.min(total - 1, current + 1);
  if (key === "ArrowLeft") return Math.max(0, current - 1);

  // Locate the group, row and column of the current cell.
  const starts: number[] = [];
  sizes.reduce((start, size) => { starts.push(start); return start + size; }, 0);
  let group = sizes.findIndex((size, position) => current < (starts[position] ?? 0) + size);
  if (group < 0) group = sizes.length - 1;
  const offset = current - (starts[group] ?? 0);
  const row = Math.floor(offset / columns);
  const column = offset % columns;
  const rows = (size: number) => Math.ceil(size / columns);
  const cell = (targetGroup: number, targetRow: number) => {
    const size = sizes[targetGroup] ?? 0;
    const rowStart = targetRow * columns;
    const rowLength = Math.min(columns, size - rowStart);
    return (starts[targetGroup] ?? 0) + rowStart + Math.min(column, rowLength - 1);
  };

  if (key === "ArrowDown") {
    if (row + 1 < rows(sizes[group] ?? 0)) return cell(group, row + 1);
    for (let next = group + 1; next < sizes.length; next += 1) if ((sizes[next] ?? 0) > 0) return cell(next, 0);
    return current;
  }
  if (row > 0) return cell(group, row - 1);
  for (let previous = group - 1; previous >= 0; previous -= 1) {
    const size = sizes[previous] ?? 0;
    if (size > 0) return cell(previous, rows(size) - 1);
  }
  return current;
}

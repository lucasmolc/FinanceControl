/** Page list with ellipsis: 1 … 4 5 [6] 7 8 … 20. */
export function pageItems(page: number, pageCount: number, siblings: number): Array<number | "gap"> {
  const pages = new Set<number>([1, pageCount]);
  for (let offset = -siblings; offset <= siblings; offset += 1) pages.add(page + offset);
  const sorted = [...pages].filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous === 2) out.push(previous + 1);
    else if (previous !== undefined && value - previous > 2) out.push("gap");
    out.push(value);
  });
  return out;
}

/** Toast text after POST /api/auto-debits/run created `count` expenses (MEL-29). */
export const autoDebitMessage = (count: number): string =>
  count === 1 ? "1 débito automático lançado." : `${count} débitos automáticos lançados.`;

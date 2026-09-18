/** R1 decision 4: why save buttons are disabled while the local server is unreachable. */
export const OFFLINE_REASON = "Sem conexão com o servidor local.";

/** First blocking reason: offline wins over the others (e.g. a closed month); undefined when the action is allowed. */
export function blockedReason(offline: boolean | undefined, ...reasons: Array<string | undefined>): string | undefined {
  if (offline) return OFFLINE_REASON;
  return reasons.find(reason => Boolean(reason));
}

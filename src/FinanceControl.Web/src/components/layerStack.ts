/**
 * The one stack of modal layers (MEL-46): Dialog, Drawer and CommandPalette register here when they open, innermost
 * last. Only the top layer reacts to Escape and Tab, so Esc in a Drawer or palette opened over a Dialog closes just
 * that layer. Popovers (useDismiss) sit above every layer: they handle Escape in the capture phase and stop it.
 * Non-modal surfaces that also close on Escape (the dock "Mais" panel) ignore it while any layer is open.
 */
const layers: symbol[] = [];

/** Registers a new top layer; call the returned function when it closes. */
export function pushLayer(name = "layer"): { token: symbol; remove: () => void } {
  const token = Symbol(name);
  layers.push(token);
  return {
    token,
    remove: () => {
      const index = layers.indexOf(token);
      if (index >= 0) layers.splice(index, 1);
    },
  };
}

/** True when `token` is the innermost open layer. */
export const isTopLayer = (token: symbol): boolean => layers[layers.length - 1] === token;

/** True while any modal layer is open. */
export const hasOpenLayer = (): boolean => layers.length > 0;

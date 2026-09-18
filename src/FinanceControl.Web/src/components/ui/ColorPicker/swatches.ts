export interface ColorSwatch {
  value: string;
  /** pt-BR name announced by screen readers. */
  name: string;
}

/** Default palette (categories, cards, accounts). */
export const DEFAULT_SWATCHES: ColorSwatch[] = [
  { value: "#7c8cff", name: "Índigo" }, { value: "#4f8df5", name: "Azul" }, { value: "#22b8cf", name: "Ciano" }, { value: "#2fbf8f", name: "Esmeralda" },
  { value: "#57c785", name: "Verde" }, { value: "#a3d65c", name: "Lima" }, { value: "#f2c94c", name: "Amarelo" }, { value: "#c8a45c", name: "Dourado" },
  { value: "#f08a4b", name: "Laranja" }, { value: "#ff7b88", name: "Coral" }, { value: "#e56fc2", name: "Rosa" }, { value: "#9b7cf6", name: "Violeta" },
  { value: "#820ad1", name: "Roxo" }, { value: "#9aa7bd", name: "Cinza" }, { value: "#2b3445", name: "Grafite" }, { value: "#111827", name: "Preto" },
];


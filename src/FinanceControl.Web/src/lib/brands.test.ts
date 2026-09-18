import { describe, expect, it } from "vitest";
import { contrastRatio } from "../components/ui/shared/color";
import { BANK_BRANDS, BRANDS, brandById, brandCategoryHints, detectBrand, fallbackBrand, SERVICE_BRANDS, suggestCategoryForBrand } from "./brands";
import { iconById } from "./icons";

describe("MEL-33/39 · catálogo de marcas", () => {
  it("tem ids únicos no formato aceito pela API e cores #rrggbb", () => {
    const ids = BRANDS.map(brand => brand.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const brand of BRANDS) {
      expect(brand.id).toMatch(/^[a-z0-9_-]{1,40}$/);
      expect(brand.bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(brand.fg).toMatch(/^#[0-9a-f]{6}$/);
      expect(brand.monogram.length).toBeGreaterThan(0);
    }
  });

  it("monograma tem contraste AA (≥ 4,5:1) sobre o selo", () => {
    const failing = BRANDS.filter(brand => contrastRatio(brand.bg, brand.fg) < 4.5).map(brand => `${brand.id} ${contrastRatio(brand.bg, brand.fg).toFixed(2)}`);
    expect(failing).toEqual([]);
  });

  it("inclui os 31 bancos da especificação §5 e os serviços da MEL-39", () => {
    expect(BANK_BRANDS.map(brand => brand.id)).toEqual(expect.arrayContaining(["nubank", "itau", "bradesco", "bb", "caixa", "santander", "inter", "c6", "btg", "xp", "rico", "clear", "nuinvest", "modal", "picpay", "mercadopago", "pagbank", "neon", "sicoob", "sicredi", "safra", "wise", "nomad", "avenue", "binance", "mercadobitcoin", "genial", "toro", "pan", "paypal", "revolut"]));
    expect(BANK_BRANDS.length).toBe(31);
    expect(SERVICE_BRANDS.map(brand => brand.id)).toEqual(expect.arrayContaining(["netflix", "primevideo", "disneyplus", "max", "globoplay", "appletv", "paramount", "crunchyroll", "youtube", "spotify", "deezer", "applemusic", "amazon", "mercadolivre", "shopee", "aliexpress", "magalu", "shein", "uber", "99", "ifood", "rappi", "smartfit", "bluefit", "wellhub", "totalpass", "googleone", "icloud", "microsoft365", "chatgpt", "claude", "adobe", "canva", "notion", "github", "xbox", "playstation", "steam", "nintendo", "vivo", "claro", "tim", "oi", "enel", "cemig", "light", "cpfl", "sabesp", "copasa", "sanepar"]));
  });

  it("todo ícone herdado por serviço existe no catálogo de ícones", () => {
    for (const brand of SERVICE_BRANDS) expect(iconById(brand.icon), brand.id).toBeDefined();
  });

  it("detecta a marca pelo texto (sem acento, maiúsculas, alias mais longo vence)", () => {
    expect(detectBrand("Pagamento NUBANK")?.id).toBe("nubank");
    expect(detectBrand("Nu Invest")?.id).toBe("nuinvest");
    expect(detectBrand("Banco Itaú Unibanco")?.id).toBe("itau");
    expect(detectBrand("SMART FIT MENSAL")?.id).toBe("smartfit");
    expect(detectBrand("Amazon Prime Video")?.id).toBe("primevideo");
    expect(detectBrand("Compra Amazon")?.id).toBe("amazon");
    expect(detectBrand("Uber Trip")?.id).toBe("uber");
    expect(detectBrand("99")?.id).toBe("99");
    expect(detectBrand("Mercado R$ 99")?.id).not.toBe("99");
    expect(detectBrand("Banco do Brasil")?.id).toBe("bb");
    expect(detectBrand("Netflix", "bank")).toBeNull();
    expect(detectBrand("Padaria da esquina")).toBeNull();
  });

  it("fallback é determinístico e legível", () => {
    const a = fallbackBrand("Cooperativa Local");
    expect(a).toEqual(fallbackBrand("cooperativa local"));
    expect(a.monogram).toBe("CL");
    expect(contrastRatio(a.bg, a.fg)).toBeGreaterThanOrEqual(4.5);
    expect(fallbackBrand("").monogram).toBe("?");
  });

  it("encontra a marca pelo id", () => {
    expect(brandById("nubank")?.name).toBe("Nubank");
    expect(brandById("desconhecido")).toBeUndefined();
  });

  it("CR-26 · sugere a categoria do próprio usuário a partir da marca (ícone, nome exato, palavra)", () => {
    const categories = [
      { id: 1, name: "Alimentação", kind: "expense" },
      { id: 2, name: "Lazer e streaming", kind: "expense" },
      { id: 3, name: "Assinaturas", kind: "expense" },
      { id: 4, name: "Transporte", kind: "expense" },
      { id: 5, name: "Streaming", kind: "income" },
      { id: 6, name: "Casa", kind: "expense", icon: "energia" },
    ];
    expect(suggestCategoryForBrand("netflix", categories)?.id).toBe(3);
    expect(suggestCategoryForBrand("uber", categories)?.id).toBe(4);
    expect(suggestCategoryForBrand("ifood", categories)?.id).toBe(1);
    expect(suggestCategoryForBrand("enel", categories)?.id).toBe(6);
    expect(suggestCategoryForBrand("spotify", categories.filter(item => item.id !== 3))?.id).toBe(2);
    expect(suggestCategoryForBrand("nubank", categories)).toBeNull();
    expect(suggestCategoryForBrand("netflix", [])).toBeNull();
    expect(brandCategoryHints("netflix")).toContain("Streaming");
    expect(brandCategoryHints("itau")).toEqual([]);
  });

  it("todo serviço do catálogo tem categorias sugeridas", () => {
    expect(SERVICE_BRANDS.filter(brand => brandCategoryHints(brand.id).length === 0).map(brand => brand.id)).toEqual([]);
  });
});

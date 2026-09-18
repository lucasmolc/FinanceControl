// Logo upload (MEL-33): client-side validation mirroring the API rule for `logo_data`
// (data URL of PNG/JPEG/WEBP/SVG, at most 200 000 characters ≈ 150 KB of file).

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const LOGO_MAX_BYTES = 150 * 1024;
const LOGO_MAX_DATA_URL_LENGTH = 200_000;
export const LOGO_INVALID = "Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB.";

const DATA_URL = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/** True for a data URL the API accepts. */
export const isValidLogoData = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.length <= LOGO_MAX_DATA_URL_LENGTH && DATA_URL.test(value);

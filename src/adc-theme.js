import { createHash } from "node:crypto";
import fs from "node:fs";

const themeUrl = new URL("../packages/design/src/adc-theme.css", import.meta.url);

export const adcPublicThemeCss = fs.readFileSync(themeUrl, "utf8").trim();
export const adcPublicThemeAssetName = "adc-theme.css";
export const adcPublicThemeAssetPath = `assets/${adcPublicThemeAssetName}`;
export const adcPublicThemeVersion = createHash("sha256").update(adcPublicThemeCss).digest("hex").slice(0, 12);

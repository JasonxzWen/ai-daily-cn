export const PROMPTLAYER_INSPIRED_DAILY_THEME = "promptlayer-inspired";

export const promptLayerInspiredDailyThemeCss = `
:root[data-ai-daily-theme="promptlayer-inspired"],
html[data-ai-daily-theme="promptlayer-inspired"] {
  color-scheme: dark;
  --daily-theme-bg: #141413;
  --daily-theme-ink: #f8f4eb;
  --daily-theme-muted: #9d968a;
  --daily-theme-line: rgba(248, 244, 235, 0.16);
  --daily-theme-line-strong: rgba(248, 244, 235, 0.32);
  --daily-theme-paper: #f0eadf;
  --daily-theme-paper-soft: #e5dccd;
  --daily-theme-paper-ink: #3a2b1d;
  --daily-theme-paper-muted: #766b5e;
  --daily-theme-gold: #f2c94c;
  --daily-theme-gold-deep: #9a6d16;
  --daily-theme-green: #35d07f;
  --bg: var(--daily-theme-bg);
  --panel: var(--daily-theme-paper);
  --panel-soft: var(--daily-theme-paper-soft);
  --ink: var(--daily-theme-paper-ink);
  --muted: var(--daily-theme-paper-muted);
  --line: #c8bdab;
  --line-strong: #9f927f;
  --accent: var(--daily-theme-gold-deep);
  --accent-soft: #f8efcf;
  --shadow: none;
  --focus: 0 0 0 3px rgba(242, 201, 76, 0.28);
}

html[data-ai-daily-theme="promptlayer-inspired"] {
  min-height: 100%;
  background:
    linear-gradient(90deg, transparent calc(100% - 1px), rgba(248, 244, 235, 0.08) 0) 0 0 / min(25vw, 312px) 100%,
    linear-gradient(180deg, transparent calc(100% - 1px), rgba(248, 244, 235, 0.08) 0) 0 0 / 100% 78px,
    var(--daily-theme-bg);
}

html[data-ai-daily-theme="promptlayer-inspired"] body {
  min-height: 100%;
  background: transparent;
  color: var(--daily-theme-ink);
  font-family: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, "Times New Roman", serif;
}

html[data-ai-daily-theme="promptlayer-inspired"] body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 72% 8%, rgba(242, 201, 76, 0.10), transparent 24%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 180px);
  mix-blend-mode: screen;
}

html[data-ai-daily-theme="promptlayer-inspired"] a {
  color: color-mix(in srgb, var(--daily-theme-gold-deep) 82%, #111);
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-shell {
  width: min(1360px, calc(100vw - 32px));
  padding: 0 0 44px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily {
  min-height: clamp(310px, 42vh, 520px);
  padding: clamp(30px, 6vw, 76px) clamp(24px, 5vw, 72px);
  border: 1px solid var(--daily-theme-line);
  border-top: 0;
  border-radius: 0;
  background:
    linear-gradient(90deg, transparent 0, transparent calc(50% - 1px), rgba(248, 244, 235, 0.18) calc(50% - 1px), rgba(248, 244, 235, 0.18) 50%, transparent 50%),
    var(--daily-theme-bg);
  color: var(--daily-theme-ink);
  box-shadow: none;
  animation: daily-theme-rise 420ms ease-out both;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .eyebrow,
html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .meta {
  color: var(--daily-theme-muted);
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-date-title {
  max-width: 12ch;
  color: var(--daily-theme-ink);
  font-family: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, "Times New Roman", serif;
  font-size: clamp(48px, 8vw, 112px);
  font-weight: 400;
  line-height: 0.94;
  letter-spacing: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .toolbar {
  align-self: start;
  justify-content: flex-end;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-summary-text {
  min-height: 0;
  border: 0;
  border-left: 1px solid var(--daily-theme-line-strong);
  border-radius: 0;
  background: transparent;
  color: #d4cbbd;
  font-size: clamp(16px, 1.7vw, 24px);
  font-weight: 400;
  line-height: 1.42;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat-grid {
  grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat {
  min-height: 86px;
  border-color: var(--daily-theme-line);
  border-radius: 0;
  background: rgba(248, 244, 235, 0.04);
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat span,
html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat small {
  color: var(--daily-theme-muted);
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat strong {
  color: var(--daily-theme-ink);
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 26px;
  font-weight: 650;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .status-pill,
html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .button {
  border-color: var(--daily-theme-line-strong);
  border-radius: 0;
  background: transparent;
  color: var(--daily-theme-ink);
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  text-transform: uppercase;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .button:hover,
html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .status-pill.status-ok {
  border-color: var(--daily-theme-gold);
  background: var(--daily-theme-gold);
  color: #201b13;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-layout {
  gap: 0;
  margin-top: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav {
  top: 0;
  margin: 0;
  padding: 12px;
  border-color: var(--daily-theme-line);
  border-radius: 0;
  background: rgba(20, 20, 19, 0.94);
  backdrop-filter: blur(16px);
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav-title,
html[data-ai-daily-theme="promptlayer-inspired"] .report-nav a,
html[data-ai-daily-theme="promptlayer-inspired"] .report-nav small {
  color: var(--daily-theme-muted);
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav-group {
  border-color: var(--daily-theme-line);
  border-radius: 0;
  background: transparent;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav a {
  border-radius: 0;
  text-transform: uppercase;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav a:hover,
html[data-ai-daily-theme="promptlayer-inspired"] .report-nav a[aria-current="true"] {
  background: var(--daily-theme-gold);
  color: #201b13;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-section-stack {
  gap: 18px;
  padding: 24px 0 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .panel,
html[data-ai-daily-theme="promptlayer-inspired"] .finding,
html[data-ai-daily-theme="promptlayer-inspired"] .evidence-card {
  border-color: #c8bdab;
  border-radius: 2px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0)),
    repeating-linear-gradient(0deg, rgba(58, 43, 29, 0.025) 0 1px, transparent 1px 18px),
    var(--daily-theme-paper);
  color: var(--daily-theme-paper-ink);
  box-shadow: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] .panel {
  animation: daily-theme-rise 520ms ease-out both;
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-heading {
  padding-bottom: 12px;
  border-bottom: 1px solid #c8bdab;
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-summary {
  display: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] h1,
html[data-ai-daily-theme="promptlayer-inspired"] h2,
html[data-ai-daily-theme="promptlayer-inspired"] h3 {
  font-family: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, "Times New Roman", serif;
  font-weight: 500;
  letter-spacing: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-heading h2 {
  color: var(--daily-theme-paper-ink);
  font-size: clamp(24px, 3vw, 42px);
  line-height: 1.05;
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-summary,
html[data-ai-daily-theme="promptlayer-inspired"] .card-subtitle,
html[data-ai-daily-theme="promptlayer-inspired"] .meta,
html[data-ai-daily-theme="promptlayer-inspired"] .eyebrow {
  color: var(--daily-theme-paper-muted);
}

html[data-ai-daily-theme="promptlayer-inspired"] .interactive-card {
  border-radius: 2px;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

html[data-ai-daily-theme="promptlayer-inspired"] .interactive-card:hover,
html[data-ai-daily-theme="promptlayer-inspired"] .interactive-card:focus-within {
  transform: translateY(-2px);
  border-color: var(--daily-theme-gold-deep);
  box-shadow: 0 18px 34px rgba(20, 20, 19, 0.14);
}

html[data-ai-daily-theme="promptlayer-inspired"] .chip,
html[data-ai-daily-theme="promptlayer-inspired"] .status-pill,
html[data-ai-daily-theme="promptlayer-inspired"] .button,
html[data-ai-daily-theme="promptlayer-inspired"] button {
  border-radius: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .source-link,
html[data-ai-daily-theme="promptlayer-inspired"] .card-stat-label,
html[data-ai-daily-theme="promptlayer-inspired"] .card-visual-title {
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-data-table th,
html[data-ai-daily-theme="promptlayer-inspired"] .report-data-table td,
html[data-ai-daily-theme="promptlayer-inspired"] .table-scroll,
html[data-ai-daily-theme="promptlayer-inspired"] .card-table-scroll {
  border-color: #c8bdab;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-data-table thead th {
  background: #ded3bf;
  color: #3a2b1d;
}

html[data-ai-daily-theme="promptlayer-inspired"] .tracking-component {
  border-radius: 2px;
}

@keyframes daily-theme-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 760px) {
  html[data-ai-daily-theme="promptlayer-inspired"] .report-shell {
    width: 100%;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily {
    min-height: auto;
    padding: 26px 20px 28px;
    background:
      linear-gradient(90deg, transparent 0, transparent calc(50% - 1px), rgba(248, 244, 235, 0.12) calc(50% - 1px), rgba(248, 244, 235, 0.12) 50%, transparent 50%),
      var(--daily-theme-bg);
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .title-row {
    gap: 18px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .toolbar {
    width: 100%;
    gap: 8px;
    justify-content: flex-start;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .status-pill,
  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .button {
    min-height: 30px;
    padding: 7px 9px;
    font-size: 11px;
    line-height: 1.1;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-date-title {
    max-width: 100%;
    font-size: 54px;
    line-height: 0.96;
    overflow-wrap: normal;
    word-break: keep-all;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-summary-text {
    padding-left: 12px;
    font-size: 16px;
    line-height: 1.44;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat {
    min-height: 86px;
    padding: 10px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat strong {
    font-size: 24px;
    line-height: 1.02;
    overflow-wrap: anywhere;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-section-stack {
    padding: 14px 9px 0;
  }
}

@media (max-width: 380px) {
  html[data-ai-daily-theme="promptlayer-inspired"] .report-date-title {
    font-size: 48px;
  }
}

@media (prefers-reduced-motion: reduce) {
  html[data-ai-daily-theme="promptlayer-inspired"] *,
  html[data-ai-daily-theme="promptlayer-inspired"] *::before,
  html[data-ai-daily-theme="promptlayer-inspired"] *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .interactive-card:hover,
  html[data-ai-daily-theme="promptlayer-inspired"] .interactive-card:focus-within {
    transform: none;
  }
}
`.trim();

export function applyPromptLayerInspiredDailyTheme(html) {
  if (!html) {
    return html;
  }

  let themed = String(html);
  if (!/<html\b[^>]*\bdata-ai-daily-theme=/i.test(themed)) {
    themed = themed.replace(
      /<html\b([^>]*)>/i,
      `<html$1 data-ai-daily-theme="${PROMPTLAYER_INSPIRED_DAILY_THEME}">`
    );
  }

  const styleMarker = `data-ai-daily-theme-style="${PROMPTLAYER_INSPIRED_DAILY_THEME}"`;
  if (themed.includes(styleMarker)) {
    return themed;
  }

  const styleBlock = `<style ${styleMarker}>\n${promptLayerInspiredDailyThemeCss}\n</style>`;
  if (themed.includes("</head>")) {
    return themed.replace("</head>", `${styleBlock}\n</head>`);
  }
  return `${styleBlock}\n${themed}`;
}

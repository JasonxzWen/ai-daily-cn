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
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 180px),
    linear-gradient(90deg, transparent calc(100% - 1px), rgba(248, 244, 235, 0.07) 0) 0 0 / min(25vw, 312px) 100%;
  mix-blend-mode: screen;
}

html[data-ai-daily-theme="promptlayer-inspired"] a {
  color: color-mix(in srgb, var(--daily-theme-gold-deep) 82%, #111);
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-shell {
  width: min(1360px, calc(100vw - 32px));
  padding: 0 0 44px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-shell::before {
  content: "AI Daily";
  position: sticky;
  top: 0;
  z-index: 70;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  height: 64px;
  padding: 0 32px 0 92px;
  border: 1px solid var(--daily-theme-line);
  border-top: 0;
  background:
    linear-gradient(#8c8478 0 0) 20px 22px / 28px 1px no-repeat,
    linear-gradient(#8c8478 0 0) 20px 31px / 28px 1px no-repeat,
    linear-gradient(#8c8478 0 0) 20px 40px / 28px 1px no-repeat,
    linear-gradient(90deg, transparent 64px, var(--daily-theme-line) 64px, transparent 65px),
    var(--daily-theme-bg);
  color: var(--daily-theme-ink);
  font-family: Arial, "Noto Sans CJK SC", sans-serif;
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(380px, 0.78fr);
  gap: clamp(28px, 5vw, 72px);
  align-items: center;
  min-height: clamp(560px, 72vh, 760px);
  padding: clamp(58px, 7vw, 112px) clamp(24px, 5vw, 72px) clamp(140px, 16vw, 190px);
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

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily::before {
  content: "";
  position: absolute;
  right: clamp(40px, 6vw, 92px);
  top: clamp(78px, 9vw, 128px);
  width: min(39vw, 520px);
  height: clamp(280px, 40vw, 520px);
  border: 1px solid rgba(216, 208, 194, 0.58);
  background:
    radial-gradient(circle at 50% 36%, transparent 0 39%, rgba(67, 44, 16, 0.12) 39.2% 39.55%, transparent 39.8%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0) 38%),
    linear-gradient(90deg, transparent calc(33.333% - 1px), rgba(67, 44, 16, 0.12) 33.333%, transparent calc(33.333% + 1px)),
    linear-gradient(90deg, transparent calc(66.666% - 1px), rgba(67, 44, 16, 0.12) 66.666%, transparent calc(66.666% + 1px)),
    linear-gradient(180deg, transparent calc(58% - 1px), rgba(67, 44, 16, 0.12) 58%, transparent calc(58% + 1px)),
    var(--daily-theme-paper);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.28);
  opacity: 0.86;
  transform: rotate(-2.5deg);
  pointer-events: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily::after {
  content: "MAIN STREAM · TRACKING · GITHUB · BLOGS";
  position: absolute;
  right: clamp(70px, 9vw, 150px);
  top: clamp(250px, 28vw, 395px);
  width: min(32vw, 430px);
  color: rgba(67, 44, 16, 0.46);
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  transform: rotate(-2.5deg);
  pointer-events: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily > * {
  position: relative;
  z-index: 1;
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
  max-width: 8ch;
  color: var(--daily-theme-ink);
  font-family: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, "Times New Roman", serif;
  font-size: clamp(56px, 8vw, 104px);
  font-weight: 400;
  line-height: 0.92;
  letter-spacing: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .title-row {
  grid-column: 1;
  grid-row: 1;
  display: grid;
  align-content: center;
  min-width: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .toolbar {
  align-self: start;
  justify-content: flex-start;
  margin-top: 28px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-brief {
  display: contents;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-summary-text {
  grid-column: 1;
  grid-row: 2;
  align-self: center;
  max-width: min(100%, 660px);
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
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-top: 1px solid var(--daily-theme-line);
  background: rgba(20, 20, 19, 0.78);
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat {
  min-height: 112px;
  padding: 24px 22px;
  border-width: 0 1px 0 0;
  border-color: var(--daily-theme-line);
  border-radius: 0;
  background: transparent;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat span,
html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat small {
  color: var(--daily-theme-muted);
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat strong {
  color: var(--daily-theme-ink);
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: clamp(22px, 2vw, 30px);
  font-weight: 650;
  letter-spacing: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily .hero-stat:last-child strong {
  font-size: clamp(18px, 1.35vw, 23px);
  line-height: 1.04;
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

html[data-ai-daily-theme="promptlayer-inspired"] .report-layout {
  display: block;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 28px;
  border-color: #d7cdbd;
  border-top: 0;
  background: rgba(240, 235, 226, 0.92);
  color: var(--daily-theme-paper-ink);
  backdrop-filter: blur(14px);
  overflow-x: auto;
  scrollbar-width: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav::-webkit-scrollbar {
  display: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav-title {
  color: var(--daily-theme-paper-ink);
  font-family: Arial, "Noto Sans CJK SC", sans-serif;
  font-size: 22px;
  font-weight: 700;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav-group {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
  min-width: max-content;
  border: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav a {
  min-height: 36px;
  padding: 8px 12px;
  color: #81776a;
  background: transparent;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-nav a + a::before {
  content: "/";
  margin-right: 12px;
  color: #c0b5a4;
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-section-stack {
  gap: 0;
  padding: 0;
  border-right: 1px solid #d7cdbd;
  border-left: 1px solid #d7cdbd;
  background:
    linear-gradient(90deg, transparent calc(25% - 1px), rgba(58, 43, 29, 0.055) 25%, transparent calc(25% + 1px)),
    linear-gradient(90deg, transparent calc(50% - 1px), rgba(58, 43, 29, 0.055) 50%, transparent calc(50% + 1px)),
    linear-gradient(90deg, transparent calc(75% - 1px), rgba(58, 43, 29, 0.055) 75%, transparent calc(75% + 1px)),
    var(--daily-theme-paper);
}

html[data-ai-daily-theme="promptlayer-inspired"] .report-section-stack > .panel {
  margin: 0;
  border-width: 0 0 1px;
  border-radius: 0;
  background: transparent;
  scroll-margin-top: 76px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-heading {
  position: relative;
  min-height: clamp(170px, 22vw, 300px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(48px, 7vw, 112px) clamp(24px, 7vw, 92px);
  text-align: center;
  border-bottom: 1px solid #d7cdbd;
  overflow: hidden;
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-heading::before {
  content: "";
  width: 18px;
  height: 18px;
  position: absolute;
  top: clamp(34px, 5vw, 78px);
  left: 50%;
  border: 6px solid rgba(245, 207, 99, 0.24);
  border-radius: 999px;
  background: var(--daily-theme-gold);
  transform: translateX(-50%);
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-heading::after {
  content: "";
  position: absolute;
  right: -14%;
  bottom: -78%;
  width: min(72vw, 920px);
  aspect-ratio: 1 / 1;
  border: 1px solid rgba(58, 43, 29, 0.10);
  border-radius: 999px;
  pointer-events: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-heading > div {
  width: min(100%, 980px);
}

html[data-ai-daily-theme="promptlayer-inspired"] .section-heading h2 {
  font-size: clamp(36px, 5.2vw, 74px);
  line-height: 0.98;
}

html[data-ai-daily-theme="promptlayer-inspired"] .evidence-grid {
  gap: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card-grid,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 0;
}

html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card {
  position: relative;
  min-height: 330px;
  padding: clamp(34px, 4.5vw, 64px);
  border-width: 0 1px 1px 0;
  border-color: #d7cdbd;
  border-radius: 0;
  background: rgba(240, 235, 226, 0.48);
  overflow: visible;
  animation: daily-theme-rise 560ms ease-out both;
}

html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card {
  min-height: 292px;
  padding: 32px 28px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card::before,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card::before {
  content: "";
  position: absolute;
  right: -15px;
  bottom: -15px;
  z-index: 2;
  width: 30px;
  height: 30px;
  border: 1px solid #d7cdbd;
  border-radius: 999px;
  background: var(--daily-theme-paper);
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card .meta,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card .meta {
  margin: 0 0 38px;
  color: #b1a697;
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 18px;
  font-weight: 700;
}

html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card .meta {
  margin-bottom: 26px;
  font-size: 15px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card h3,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card h3 {
  margin: 0;
  color: var(--daily-theme-paper-ink);
  font-size: clamp(26px, 3vw, 38px);
  line-height: 1.02;
}

html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card h3 {
  font-size: clamp(22px, 2vw, 29px);
  line-height: 1.08;
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card h3 a,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card h3 a,
html[data-ai-daily-theme="promptlayer-inspired"] .blog-card h3 a {
  color: inherit;
  text-decoration: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card .card-title-link,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card .card-title-link {
  display: inline-flex;
  align-items: flex-start;
  gap: 10px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card .card-title-icon,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card .card-title-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 0.3em;
  opacity: 0.62;
  filter: sepia(0.45) saturate(0.7);
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card .card-subtitle,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card .card-subtitle {
  margin-top: 18px;
  color: #81776a;
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  text-transform: uppercase;
}

html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card p,
html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card p {
  margin-top: 24px;
  color: #4d3a29;
  font-size: clamp(17px, 1.6vw, 22px);
  line-height: 1.5;
}

html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card p {
  font-size: 16px;
  line-height: 1.5;
}

html[data-ai-daily-theme="promptlayer-inspired"] .card-tags {
  gap: 7px;
  margin-top: 18px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .chip {
  border-color: #d8ccb8;
  background: transparent;
  color: #8b7b66;
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
}

html[data-ai-daily-theme="promptlayer-inspired"] .chip-major,
html[data-ai-daily-theme="promptlayer-inspired"] .chip-notable,
html[data-ai-daily-theme="promptlayer-inspired"] .chip-new,
html[data-ai-daily-theme="promptlayer-inspired"] .chip-trend-new,
html[data-ai-daily-theme="promptlayer-inspired"] .chip-tag-stars,
html[data-ai-daily-theme="promptlayer-inspired"] .chip-stars {
  border-color: rgba(154, 109, 22, 0.42);
  background: #f6e7b8;
  color: #76520e;
}

html[data-ai-daily-theme="promptlayer-inspired"] .tracking-card-grid {
  display: grid;
  grid-template-columns: 1fr;
}

html[data-ai-daily-theme="promptlayer-inspired"] .tracking-card {
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    "tracking-title"
    "tracking-tags"
    "tracking-stats"
    "tracking-component"
    "tracking-bars"
    "tracking-table"
    "tracking-body";
  gap: 18px;
  min-height: 0;
  padding: clamp(30px, 4vw, 56px);
  border-width: 0 0 1px;
  border-radius: 0;
  background: rgba(240, 235, 226, 0.60);
  scroll-margin-top: 76px;
}

html[data-ai-daily-theme="promptlayer-inspired"] .tracking-card h3 {
  font-size: clamp(34px, 4vw, 56px);
  line-height: 1;
}

html[data-ai-daily-theme="promptlayer-inspired"] .tracking-card > p {
  max-width: 980px;
  color: #5c4b3b;
  font-size: 19px;
  line-height: 1.55;
}

html[data-ai-daily-theme="promptlayer-inspired"] .tracking-component,
html[data-ai-daily-theme="promptlayer-inspired"] .tracking-component-panel,
html[data-ai-daily-theme="promptlayer-inspired"] .tracking-data-table,
html[data-ai-daily-theme="promptlayer-inspired"] .card-data-table {
  border-radius: 0;
  background: #ebe3d6;
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card-grid,
html[data-ai-daily-theme="promptlayer-inspired"] .chinese-media-card-grid {
  display: block;
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card {
  position: relative;
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) minmax(90px, 140px);
  column-gap: clamp(18px, 3vw, 44px);
  align-items: start;
  min-height: 200px;
  padding: clamp(30px, 4.5vw, 56px) clamp(24px, 5vw, 68px);
  border-width: 0 0 1px;
  border-radius: 0;
  background: transparent;
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card:first-child {
  margin: clamp(28px, 4vw, 54px) clamp(24px, 5vw, 68px);
  padding: clamp(34px, 5vw, 64px);
  border: 1px solid #d7cdbd;
  background: rgba(240, 235, 226, 0.34);
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card::before {
  content: none;
  position: absolute;
  left: 0;
  right: 0;
  bottom: -15px;
  height: 30px;
  pointer-events: none;
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card::after {
  content: "READ  →";
  grid-column: 3;
  grid-row: 1 / span 4;
  align-self: center;
  justify-self: end;
  color: #9a6d16;
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card h3 {
  grid-column: 2;
  margin: 0;
  font-size: clamp(28px, 3.2vw, 44px);
  line-height: 1.08;
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card .card-tags,
html[data-ai-daily-theme="promptlayer-inspired"] .blog-card p,
html[data-ai-daily-theme="promptlayer-inspired"] .blog-card .card-detail-list,
html[data-ai-daily-theme="promptlayer-inspired"] .blog-card .card-media-grid {
  grid-column: 2;
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card p {
  max-width: 820px;
  color: #6d5f51;
  font-size: clamp(17px, 1.45vw, 21px);
  line-height: 1.55;
}

html[data-ai-daily-theme="promptlayer-inspired"] .blog-card .card-title-icon {
  position: absolute;
  left: clamp(24px, 5vw, 68px);
  top: clamp(34px, 5vw, 62px);
  width: 36px;
  height: 36px;
  opacity: 0.64;
  filter: sepia(0.45) saturate(0.7);
}

html[data-ai-daily-theme="promptlayer-inspired"] .interactive-card:nth-child(2n) {
  animation-delay: 70ms;
}

html[data-ai-daily-theme="promptlayer-inspired"] .interactive-card:nth-child(3n) {
  animation-delay: 120ms;
}

@supports (animation-timeline: view()) {
  html[data-ai-daily-theme="promptlayer-inspired"] .report-section-stack > .panel,
  html[data-ai-daily-theme="promptlayer-inspired"] .interactive-card {
    animation: daily-theme-rise both;
    animation-timeline: view();
    animation-range: entry 0% cover 24%;
  }
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
    display: block;
    grid-template-columns: 1fr;
    min-height: auto;
    padding: 26px 20px 28px;
    background:
      linear-gradient(90deg, transparent 0, transparent calc(50% - 1px), rgba(248, 244, 235, 0.12) calc(50% - 1px), rgba(248, 244, 235, 0.12) 50%, transparent 50%),
      var(--daily-theme-bg);
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily::before,
  html[data-ai-daily-theme="promptlayer-inspired"] .report-hero-daily::after {
    display: none;
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
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    margin-top: 20px;
    border: 1px solid var(--daily-theme-line);
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
    padding: 0;
    border-right: 0;
    border-left: 0;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-nav {
    display: flex;
    align-items: center;
    min-height: 0;
    padding: 12px 16px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .report-nav-group {
    flex-wrap: nowrap;
    justify-content: flex-start;
    margin-top: 0;
    margin-left: 10px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .section-heading {
    min-height: 220px;
    padding: 54px 22px 42px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .section-heading h2 {
    font-size: 42px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card-grid,
  html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card-grid {
    grid-template-columns: 1fr;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card,
  html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card,
  html[data-ai-daily-theme="promptlayer-inspired"] .tracking-card {
    min-height: 0;
    padding: 28px 22px;
    border-right: 0;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card h3,
  html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card h3 {
    font-size: 27px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .main-ticket-card p,
  html[data-ai-daily-theme="promptlayer-inspired"] .github-trending-card p,
  html[data-ai-daily-theme="promptlayer-inspired"] .tracking-card > p {
    font-size: 16px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card {
    grid-template-columns: 1fr;
    min-height: 0;
    padding: 30px 22px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card h3,
  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card .card-tags,
  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card p,
  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card .card-detail-list,
  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card .card-media-grid,
  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card::after {
    grid-column: 1;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card h3 {
    font-size: 32px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card::after {
    grid-row: auto;
    justify-self: start;
    margin-top: 12px;
  }

  html[data-ai-daily-theme="promptlayer-inspired"] .blog-card .card-title-icon {
    position: static;
    width: 28px;
    height: 28px;
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

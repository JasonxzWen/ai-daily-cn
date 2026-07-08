import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge, Button, Card, SegmentedControl, SegmentedControlItem } from "@astryxdesign/core";
import { ArrowUpRight, CalendarDays, FileText, Newspaper, Radio, RefreshCw } from "lucide-react";

type Article = {
  id?: string;
  title?: string;
  url?: string;
  summary?: string;
  date?: string;
  report_date?: string;
  report_url?: string;
  source?: string;
  domain?: string;
  quality_score?: number;
  importance?: string;
  section?: string;
  flavors?: string[];
  channels_l1?: string[];
  companies?: string[];
  products?: string[];
};

type Report = {
  report_date?: string;
  title?: string;
  summary?: string;
  url?: string;
  main_items?: number;
  builder_observations?: number;
  generated_at?: string;
};

type Feed = {
  site_title?: string;
  updated_at?: string;
  reports?: Report[];
};

type LoadState =
  | { status: "loading"; articles: Article[]; feed: Feed | null; error: "" }
  | { status: "ready"; articles: Article[]; feed: Feed | null; error: "" }
  | { status: "error"; articles: Article[]; feed: Feed | null; error: string };

type Mode = "today" | "yesterday" | "history";

const modeTitle: Record<Mode, string> = {
  today: "今日精选",
  yesterday: "昨日回看",
  history: "历史流"
};

const modeCopy: Record<Mode, string> = {
  today: "开屏默认读取最新日报入库的重点资讯。",
  yesterday: "保留上一期高质量信号，避免隔日漏读。",
  history: "按时间与质量混合排序，展示最近入库的公共资讯。"
};

export function App() {
  const [mode, setMode] = useState<Mode>("today");
  const [state, setState] = useState<LoadState>({
    status: "loading",
    articles: [],
    feed: null,
    error: ""
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [articles, feed] = await Promise.all([
          fetchJson<Article[]>("articles.json"),
          fetchJson<Feed>("feed.json")
        ]);
        if (!cancelled) {
          setState({ status: "ready", articles: Array.isArray(articles) ? articles : [], feed, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            articles: [],
            feed: null,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.articleIndexLoaded = state.status === "ready" ? mode : state.status;
  }, [mode, state.status]);

  const model = useMemo(() => buildViewModel(state.articles, state.feed, mode), [state.articles, state.feed, mode]);

  return (
    <main className="adc-shell" data-article-index="adc-react-astryx" data-adc-react-home>
      <header className="adc-topbar">
        <a className="adc-brand" href="index.html" aria-label="ADC 首页">
          <span className="adc-brand-mark">ADC.</span>
          <span className="adc-brand-subtitle">AI Daily CN</span>
        </a>
        <nav className="adc-nav" aria-label="主导航">
          <a href="index.html">今日</a>
          <a href="ops.html">运行</a>
          {model.latestReport?.url ? <a href={model.latestReport.url}>日报</a> : null}
          <a href="articles.json">数据</a>
        </nav>
      </header>

      <section className="adc-hero">
        <div className="adc-hero-copy">
          <Badge variant="neutral" label="ADC. 资讯流" icon={<Radio size={14} />} />
          <h1>ADC. AI 资讯流</h1>
          <p>{model.heroSummary}</p>
        </div>
        <div className="adc-metrics" aria-label="资讯概览">
          <Metric label="最新日期" value={formatDateShort(model.latestDate) || "--"} icon={<CalendarDays size={18} />} />
          <Metric label="今日入库" value={String(model.todayCount)} icon={<Newspaper size={18} />} />
          <Metric label="信源" value={String(model.sourceCount)} icon={<Radio size={18} />} />
          <Metric label="总量" value={String(state.articles.length)} icon={<FileText size={18} />} />
        </div>
      </section>

      <section className="adc-board">
        <div className="adc-board-header">
          <div>
            <p className="adc-kicker">首屏默认页</p>
            <h2 id="article-results-title">{modeTitle[mode]}</h2>
            <p id="articleResultMeta">{model.resultMeta}</p>
          </div>
          <SegmentedControl value={mode} onChange={(value) => setMode(value as Mode)} label="资讯范围" layout="hug">
            <SegmentedControlItem value="today" label="今日精选" />
            <SegmentedControlItem value="yesterday" label="昨日回看" />
            <SegmentedControlItem value="history" label="历史流" />
          </SegmentedControl>
        </div>

        <p className="adc-mode-copy">{modeCopy[mode]}</p>

        {state.status === "loading" ? <LoadingState /> : null}
        {state.status === "error" ? <ErrorState error={state.error} /> : null}
        {state.status === "ready" && model.visibleArticles.length === 0 ? <EmptyState /> : null}
        {state.status === "ready" && model.visibleArticles.length > 0 ? (
          <div className="adc-news-grid">
            {model.visibleArticles.map((article, index) => (
              <ArticleCard key={article.id || `${article.url || article.title}-${index}`} article={article} index={index} />
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ArticleCard({ article, index }: { article: Article; index: number }) {
  const score = Number(article.quality_score || 0);
  const source = cleanText(article.source) || "未标注来源";
  const title = cleanText(article.title) || "未命名资讯";
  const summary = cleanText(article.summary) || "暂无摘要。";
  const date = article.date || article.report_date || "";
  const primaryTag = firstText(article.channels_l1) || cleanText(article.domain) || cleanText(article.section) || "AI";
  const secondaryTags = [firstText(article.flavors), firstText(article.companies), firstText(article.products)]
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Card
      className="adc-news-card"
      padding={0}
      data-article-card
      data-article-score={score || undefined}
      data-rank={String(index + 1).padStart(2, "0")}
    >
      <article>
        <div className="adc-card-topline">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <Badge variant={badgeVariant(score)} label={primaryTag} />
        </div>
        <h3>
          {article.url ? (
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {title}
            </a>
          ) : (
            title
          )}
        </h3>
        <p>{summary}</p>
        <div className="adc-card-tags">
          <Badge variant="neutral" label={source} />
          {date ? <Badge variant="neutral" label={formatDateShort(date) || date} /> : null}
          {score ? <Badge variant="neutral" label={`${score} 分`} /> : null}
          {secondaryTags.map((tag) => (
            <Badge key={tag} variant="neutral" label={tag} />
          ))}
        </div>
        <div className="adc-card-footer">
          {article.report_url ? <a href={article.report_url}>对应日报</a> : <span />}
          {article.url ? (
            <a href={article.url} target="_blank" rel="noopener noreferrer" aria-label={`打开来源：${title}`}>
              <ArrowUpRight size={16} />
            </a>
          ) : null}
        </div>
      </article>
    </Card>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <Card className="adc-metric" padding={0}>
      <span className="adc-metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="adc-state-grid" aria-label="加载中">
      {Array.from({ length: 6 }, (_unused, index) => (
        <Card key={index} className="adc-skeleton" padding={0}>
          <span />
          <span />
          <span />
        </Card>
      ))}
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <Card className="adc-state-card" padding={0}>
      <h3>数据读取失败</h3>
      <p>{error}</p>
      <Button label="重新加载" variant="secondary" icon={<RefreshCw size={16} />} onClick={() => window.location.reload()} />
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="adc-state-card" padding={0}>
      <h3>暂无可展示资讯</h3>
      <p>当前数据源没有命中这个范围。</p>
    </Card>
  );
}

function buildViewModel(articles: Article[], feed: Feed | null, mode: Mode) {
  const sorted = [...articles].sort((a, b) => {
    const dateDiff = dateKey(b).localeCompare(dateKey(a));
    if (dateDiff !== 0) return dateDiff;
    return Number(b.quality_score || 0) - Number(a.quality_score || 0);
  });
  const dates = Array.from(new Set(sorted.map(dateKey).filter(Boolean)));
  const latestReport = feed?.reports?.[0] || null;
  const feedLatestDate = latestReport?.report_date || "";
  const latestDate = feedLatestDate && sorted.some((article) => dateKey(article) === feedLatestDate)
    ? feedLatestDate
    : dates[0] || feedLatestDate;
  const yesterdayDate = dates.find((date) => date !== latestDate) || "";
  const todayArticles = sorted.filter((article) => dateKey(article) === latestDate);
  const yesterdayArticles = sorted.filter((article) => dateKey(article) === yesterdayDate);
  const visibleArticles =
    mode === "today"
      ? todayArticles.slice(0, 18)
      : mode === "yesterday"
        ? yesterdayArticles.slice(0, 18)
        : sorted.slice(0, 60);
  const sourceCount = new Set(sorted.map((article) => cleanText(article.source)).filter(Boolean)).size;
  const heroSummary = cleanText(latestReport?.summary) ||
    "把每日 AI 资讯直接放在首页，按来源质量、时间和读者决策价值组织。";
  const resultDate = mode === "today" ? latestDate : mode === "yesterday" ? yesterdayDate : latestDate;
  const resultMeta = [
    `${visibleArticles.length} 条资讯`,
    resultDate ? formatDateLong(resultDate) : "",
    mode === "history" ? "最近 60 条" : ""
  ].filter(Boolean).join(" · ");

  return {
    latestReport,
    latestDate,
    todayCount: todayArticles.length,
    sourceCount,
    heroSummary,
    resultMeta,
    visibleArticles
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${url} ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function dateKey(article: Article) {
  return article.date || article.report_date || "";
}

function firstText(values?: string[]) {
  if (!Array.isArray(values)) return "";
  return cleanText(values.find((value) => cleanText(value)) || "");
}

function cleanText(value?: string | number | null) {
  return String(value ?? "").trim();
}

function formatDateShort(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatDateLong(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(date);
}

function badgeVariant(score: number) {
  if (score >= 90) return "success";
  if (score >= 80) return "info";
  return "neutral";
}

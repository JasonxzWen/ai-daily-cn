import { useEffect, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core";
import { ArrowDown, ArrowUpRight, CircleDot, Database, RefreshCw } from "lucide-react";

const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const INITIAL_VISIBLE_COUNT = 6;
const REVEAL_STEP = 6;

type SignalOccurrence = {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  publisher: {
    name: string;
    home_url: string;
  };
  collected_via: {
    name: string;
    url: string;
  };
  source_group: string;
  content_tags: string[];
  credibility_tag: string;
  event_date: string;
  published_at: string | null;
  collected_at: string;
  date_anomaly: "future_relative_to_collection" | null;
  source_health: "available" | "degraded" | "unknown";
  access_state: "direct" | "indirect" | "unknown";
};

type SignalGroup = {
  id: string;
  label: string;
  count: number;
  page_count: number;
  first_page_url: string;
  preview: SignalOccurrence[];
};

type SignalIndex = {
  schema_version: 1;
  kind: "signal_index";
  generated_at: string;
  total_count: number;
  groups: SignalGroup[];
};

type SignalPage = {
  kind: "signal_page";
  page: number;
  page_count: number;
  next_url: string | null;
  items: SignalOccurrence[];
};

type LoadState =
  | { status: "loading"; data: null; error: "" }
  | { status: "ready"; data: SignalIndex; error: "" }
  | { status: "error"; data: null; error: string };

const credibilityLabels: Record<string, string> = {
  primary_material: "一手材料",
  multi_source_material: "多源材料",
  single_source_relay: "单源转述",
  community_lead: "社区线索",
  monitoring_lead: "监测线索",
  pending_review: "待核材料"
};

const contentTagLabels: Record<string, string> = {
  model_release: "模型发布",
  product_update: "产品更新",
  open_source: "开源项目",
  research: "研究论文",
  engineering: "工程技术",
  company_business: "公司动态",
  funding: "融资交易",
  policy_infrastructure: "政策与基础设施",
  industry_news: "行业动态",
  creative_ai: "AIGC / 内容",
  analysis_opinion: "观点分析",
  podcast: "播客访谈",
  community_discussion: "社区讨论",
  other: "其他"
};

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    fetchJson<SignalIndex>("signals/index.json")
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data, error: "" });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.signalIndexLoaded = state.status;
  }, [state.status]);

  const signalIndex = state.status === "ready" ? state.data : null;
  const recentCutoff = signalIndex ? timestamp(signalIndex.generated_at) - RECENT_WINDOW_MS : 0;

  return (
    <main className="adc-shell" data-public-signal-monitor data-signal-index-state={state.status}>
      <a className="adc-skip-link" href="#signal-board">跳到信号板块</a>

      <header className="adc-topbar">
        <a className="adc-brand" href="index.html" aria-label="ADC 公共信号首页">
          <span className="adc-brand-mark">ADC.</span>
          <span className="adc-brand-subtitle">Public Signal Monitor</span>
        </a>
        <nav className="adc-nav" aria-label="数据导航">
          <span className="adc-live-label"><CircleDot size={14} /> 持续监听</span>
          <a href="signals/index.json">开放数据 <Database size={15} /></a>
          <a href="https://github.com/JasonxzWen/ai-daily-cn" target="_blank" rel="noopener noreferrer">
            GitHub <ArrowUpRight size={15} />
          </a>
        </nav>
      </header>

      <section className="adc-hero" aria-labelledby="adc-home-title">
        <div className="adc-hero-copy">
          <p className="adc-kicker">Public signals · Richness first</p>
          <h1 id="adc-home-title">看见 AI 生态里<br />正在发生的变化。</h1>
          <p className="adc-hero-summary">
            汇集官网博客、GitHub、社区、X、论文与公开媒体线索。这里负责监听和呈现，
            可信度只是一枚帮助判断的标签，不是内容准入门槛。
          </p>
        </div>
        <dl className="adc-snapshot" aria-label="信号快照">
          <div>
            <dt>已收录信号</dt>
            <dd>{signalIndex ? formatCount(signalIndex.total_count) : "—"}</dd>
          </div>
          <div>
            <dt>信源板块</dt>
            <dd>{signalIndex ? signalIndex.groups.length : "—"}</dd>
          </div>
          <div>
            <dt>快照时间</dt>
            <dd className="adc-snapshot-time">{signalIndex ? formatSnapshot(signalIndex.generated_at) : "读取中"}</dd>
          </div>
        </dl>
      </section>

      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState error={state.error} /> : null}
      {signalIndex ? <SignalBoard index={signalIndex} recentCutoff={recentCutoff} /> : null}
    </main>
  );
}

function SignalBoard({ index, recentCutoff }: { index: SignalIndex; recentCutoff: number }) {
  return (
    <div className="adc-board" id="signal-board">
      <aside className="adc-board-rail" aria-label="信源板块导航">
        <div className="adc-board-rail-inner">
          <p className="adc-rail-title">信源板块</p>
          <nav>
            {index.groups.map((group) => (
              <a key={group.id} href={`#group-${group.id}`}>
                <span>{group.label}</span>
                <strong>{formatCount(group.count)}</strong>
              </a>
            ))}
          </nav>
          <div className="adc-legend">
            <p>标签怎么读</p>
            <span><i className="is-primary" /> 一手 / 多源材料</span>
            <span><i className="is-relay" /> 转述材料</span>
            <span><i className="is-lead" /> 线索 / 待核</span>
            <small>标签只用于辅助判断，不改变默认时间顺序。</small>
          </div>
        </div>
      </aside>

      <div className="adc-stream">
        <header className="adc-stream-heading">
          <div>
            <p className="adc-kicker">按信源属性组织</p>
            <h2>最近 48 小时</h2>
          </div>
          <p>以本次数据快照为锚点；更早记录可在各板块内继续加载，无需离开当前页面。</p>
        </header>

        {index.groups.map((group) => (
          <SignalGroupSection key={group.id} group={group} recentCutoff={recentCutoff} />
        ))}
      </div>
    </div>
  );
}

function SignalGroupSection({ group, recentCutoff }: { group: SignalGroup; recentCutoff: number }) {
  const [items, setItems] = useState(() => uniqueSignals(group.preview));
  const [nextUrl, setNextUrl] = useState<string | null>(group.first_page_url);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [historyMode, setHistoryMode] = useState(false);
  const [boundaryReached, setBoundaryReached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const recentItems = useMemo(
    () => items.filter((item) => effectiveTimestamp(item) >= recentCutoff),
    [items, recentCutoff]
  );
  const eligibleItems = historyMode ? items : recentItems;
  const visibleItems = eligibleItems.slice(0, visibleCount);
  const hasCachedHistory = items.length > recentItems.length;
  const canRevealCached = visibleCount < eligibleItems.length;
  const canFetch = Boolean(nextUrl) && (historyMode || !boundaryReached);
  const canEnterHistory = !historyMode && boundaryReached && hasCachedHistory && !canRevealCached;
  const showAction = canRevealCached || canFetch || canEnterHistory || Boolean(error);
  const includesHistory = historyMode && visibleItems.some((item) => effectiveTimestamp(item) < recentCutoff);

  async function loadMore() {
    if (loading) return;
    setError("");

    if (canRevealCached) {
      setVisibleCount((count) => count + REVEAL_STEP);
      return;
    }

    if (canEnterHistory) {
      setHistoryMode(true);
      setVisibleCount((count) => count + REVEAL_STEP);
      return;
    }

    if (!nextUrl) return;
    setLoading(true);
    try {
      const page = await fetchJson<SignalPage>(nextUrl);
      const merged = appendUniqueSignals(items, page.items);
      const reachedOlderItems = page.items.some((item) => effectiveTimestamp(item) < recentCutoff);
      setItems(merged);
      setNextUrl(page.next_url);
      setBoundaryReached(reachedOlderItems || page.next_url === null);
      setVisibleCount((count) => count + REVEAL_STEP);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="adc-source-group" id={`group-${group.id}`} data-source-group={group.id}>
      <header className="adc-group-heading">
        <div>
          <p>{group.label}</p>
          <h2>{group.label}</h2>
        </div>
        <span>{formatCount(group.count)} 条</span>
      </header>

      {visibleItems.length > 0 ? (
        <div className="adc-signal-grid">
          {visibleItems.map((item) => <SignalCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="adc-group-empty">
          <p>这个板块在快照前 48 小时内暂无新信号。</p>
          <span>历史记录仍然保留，可继续向前浏览。</span>
        </div>
      )}

      {includesHistory ? <p className="adc-history-note">已进入快照 48 小时以前的历史记录</p> : null}
      {error ? <p className="adc-group-error" role="alert">加载失败：{error}</p> : null}
      {showAction ? (
        <button
          className="adc-load-more"
          type="button"
          onClick={loadMore}
          disabled={loading}
          data-load-more={group.id}
          data-history-mode={historyMode ? "history" : "recent"}
        >
          <span>{loadMoreLabel({ loading, error: Boolean(error), canRevealCached, canEnterHistory, historyMode })}</span>
          {loading ? <RefreshCw className="adc-spin" size={16} /> : <ArrowDown size={16} />}
        </button>
      ) : (
        <p className="adc-group-end">已展示该板块的全部记录</p>
      )}
    </section>
  );
}

function SignalCard({ item }: { item: SignalOccurrence }) {
  const contentTag = item.content_tags[0];
  return (
    <article className="adc-signal-card" data-signal-card={item.id}>
      <header>
        <a href={item.publisher.home_url} target="_blank" rel="noopener noreferrer" className="adc-publisher">
          <span>{publisherInitial(item.publisher.name)}</span>
          {item.publisher.name}
        </a>
        <time dateTime={item.published_at || item.event_date}>{formatSignalDate(item)}</time>
      </header>
      <h3>
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          {item.title}<ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </h3>
      <p>{cleanSummary(item.summary) || "原始信号暂未提供摘要，可直接打开来源查看完整内容。"}</p>
      <footer>
        <div className="adc-card-tags">
          <span className={`adc-tag adc-credibility ${credibilityTone(item.credibility_tag)}`} data-credibility-tag={item.credibility_tag}>
            {credibilityLabels[item.credibility_tag] || humanizeTag(item.credibility_tag)}
          </span>
          {contentTag ? <span className="adc-tag" data-content-tag={contentTag}>{contentTagLabels[contentTag] || humanizeTag(contentTag)}</span> : null}
        </div>
        <span className="adc-collected-via" title={`采集自 ${item.collected_via.name}`}>via {item.collected_via.name}</span>
      </footer>
    </article>
  );
}

function LoadingState() {
  return (
    <section className="adc-loading" role="status" aria-live="polite" aria-label="正在读取公共信号">
      <div className="adc-loading-rail" />
      <div className="adc-loading-content">
        <span />
        <div><i /><i /></div>
        <div><i /><i /></div>
      </div>
    </section>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <section className="adc-state-card" role="alert">
      <p className="adc-kicker">Signal index unavailable</p>
      <h2>公共信号暂时没有加载出来</h2>
      <p>{error}</p>
      <Button label="重新加载" variant="secondary" icon={<RefreshCw size={16} />} onClick={() => window.location.reload()} />
    </section>
  );
}

function loadMoreLabel(options: {
  loading: boolean;
  error: boolean;
  canRevealCached: boolean;
  canEnterHistory: boolean;
  historyMode: boolean;
}) {
  if (options.loading) return "正在读取";
  if (options.error) return "重试加载";
  if (options.canEnterHistory) return "查看更早历史";
  if (options.historyMode) return options.canRevealCached ? "显示更多历史" : "加载更多历史";
  return "加载更多近 48 小时信号";
}

function appendUniqueSignals(existing: SignalOccurrence[], incoming: SignalOccurrence[]) {
  const seen = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !seen.has(item.id))];
}

function uniqueSignals(items: SignalOccurrence[]) {
  return appendUniqueSignals([], items);
}

function effectiveTimestamp(item: SignalOccurrence) {
  if (item.date_anomaly === "future_relative_to_collection") return timestamp(item.collected_at);
  return timestamp(item.published_at) || timestamp(item.event_date ? `${item.event_date}T00:00:00.000Z` : "") || timestamp(item.collected_at);
}

function timestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSignalDate(item: SignalOccurrence) {
  const value = item.date_anomaly === "future_relative_to_collection"
    ? item.collected_at
    : item.published_at || item.event_date || item.collected_at;
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return item.event_date;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatSnapshot(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function cleanSummary(value: string | null) {
  return String(value || "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[`*_#|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publisherInitial(value: string) {
  return String(value || "?").trim().slice(0, 1).toUpperCase();
}

function humanizeTag(value: string) {
  return value.split("_").filter(Boolean).join(" ");
}

function credibilityTone(value: string) {
  if (value === "primary_material" || value === "multi_source_material") return "is-primary";
  if (value === "single_source_relay") return "is-relay";
  return "is-lead";
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json() as Promise<T>;
}

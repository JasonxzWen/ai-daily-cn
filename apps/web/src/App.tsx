import { useEffect, useState } from "react";
import { Badge, Button, Card, SegmentedControl, SegmentedControlItem } from "@astryxdesign/core";
import { ArrowUpRight, CalendarDays, FileText, Radio, RefreshCw } from "lucide-react";

type HomeStory = {
  id: string;
  title: string;
  url: string;
  summary: string;
  event_date: string;
  source: string;
  label: "本期主线" | "Source Watch";
  tags: string[];
  report_url?: string;
};

type Edition = {
  report_date: string;
  title: string;
  summary: string;
  report_url: string;
  data_url: string;
  generated_at: string;
  story_count: number;
  lead_story: HomeStory | null;
  secondary_stories: HomeStory[];
  compact_stories: HomeStory[];
};

type ArchiveEntry = {
  report_date: string;
  title: string;
  summary: string;
  url: string;
};

type HomeData = {
  schema_version: 1;
  site_title: string;
  generated_at: string;
  latest_edition: Edition | null;
  previous_edition: Edition | null;
  source_watch: HomeStory[];
  archive: ArchiveEntry[];
  byte_size: number;
};

type LoadState =
  | { status: "loading"; data: null; error: "" }
  | { status: "ready"; data: HomeData; error: "" }
  | { status: "error"; data: null; error: string };

type Mode = "latest" | "previous" | "archive";

export function App() {
  const [mode, setMode] = useState<Mode>("latest");
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    fetchJson<HomeData>("home.json")
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
    document.documentElement.dataset.articleIndexLoaded = state.status === "ready" ? mode : state.status;
  }, [mode, state.status]);

  const home = state.status === "ready" ? state.data : null;
  const edition = mode === "latest" ? home?.latest_edition : mode === "previous" ? home?.previous_edition : null;

  return (
    <main className="adc-shell" data-article-index="adc-react-astryx" data-adc-react-home>
      <a className="adc-skip-link" href="#article-results-title">跳到本期主线</a>
      <header className="adc-topbar">
        <a className="adc-brand" href="index.html" aria-label="ADC 首页">
          <span className="adc-brand-mark">ADC.</span>
          <span className="adc-brand-subtitle">AI Daily CN</span>
        </a>
        <nav className="adc-nav" aria-label="主导航">
          <a href="index.html">本期</a>
          {home?.latest_edition?.report_url ? <a href={home.latest_edition.report_url}>日报</a> : null}
          <a href="official-blogs/">官方博客</a>
          <a href="articles.json">数据</a>
          <a className="adc-nav-secondary" href="ops.html">运行</a>
        </nav>
      </header>

      <section className="adc-intro" aria-labelledby="adc-home-title">
        <div className="adc-intro-copy">
          <Badge
            variant="neutral"
            label={home?.latest_edition ? `最新一期 · ${formatDateShort(home.latest_edition.report_date)}` : "每日 AI 编辑版"}
            icon={<Radio size={14} />}
          />
          <h1 id="adc-home-title">ADC. AI 资讯流</h1>
          <p>{home?.latest_edition?.summary || "按日报期次、编辑顺序和读者决策价值组织每日 AI 资讯。"}</p>
        </div>
        <div className="adc-intro-mark" aria-hidden="true">
          <img src="assets/adc-character.svg" alt="" />
        </div>
      </section>

      <section className="adc-edition-toolbar" aria-label="日报期次选择">
        <div>
          <p className="adc-kicker">Edition first</p>
          <h2 id="article-results-title">
            {mode === "latest" ? "最新一期" : mode === "previous" ? "上一期" : "往期日报"}
          </h2>
        </div>
        <SegmentedControl value={mode} onChange={(value) => setMode(value as Mode)} label="日报期次" layout="hug">
          <SegmentedControlItem value="latest" label="最新一期" />
          <SegmentedControlItem value="previous" label="上一期" />
          <SegmentedControlItem value="archive" label="往期" />
        </SegmentedControl>
      </section>

      {state.status === "loading" ? <LoadingState /> : null}
      {state.status === "error" ? <ErrorState error={state.error} /> : null}
      {state.status === "ready" && mode !== "archive" && edition ? <EditionSurface edition={edition} /> : null}
      {state.status === "ready" && mode !== "archive" && !edition ? <EmptyState title="暂无这一期" /> : null}
      {state.status === "ready" && mode === "archive" ? <ArchiveSurface entries={state.data.archive} /> : null}

      {state.status === "ready" && mode === "latest" && state.data.source_watch.length > 0 ? (
        <SourceWatchRail stories={state.data.source_watch} />
      ) : null}
    </main>
  );
}

function EditionSurface({ edition }: { edition: Edition }) {
  return (
    <section className="adc-edition" data-edition-surface data-report-date={edition.report_date}>
      <header className="adc-edition-meta">
        <p>{formatDateLong(edition.report_date)} · {edition.story_count} 条编辑主线</p>
        <div>
          <a href={edition.report_url}>打开完整日报</a>
          <a href={edition.data_url}>本期 JSON</a>
        </div>
      </header>

      {edition.lead_story ? (
        <div className="adc-edition-feature-grid">
          <LeadStory story={edition.lead_story} />
          <div className="adc-secondary-stack" aria-label="次级主线">
            {edition.secondary_stories.map((story, index) => (
              <SecondaryStory key={story.id} story={story} index={index + 2} />
            ))}
          </div>
        </div>
      ) : <EmptyState title="本期暂无主线故事" />}

      {edition.compact_stories.length > 0 ? (
        <div className="adc-compact-list" aria-label="更多本期主线">
          {edition.compact_stories.map((story, index) => (
            <CompactStory key={story.id} story={story} index={index + 5} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LeadStory({ story }: { story: HomeStory }) {
  return (
    <Card className="adc-lead-story" padding={0} data-lead-story data-article-card>
      <article>
        <StoryTopline story={story} rank="01" />
        <h2><StoryLink story={story} /></h2>
        <p>{story.summary}</p>
        <StoryFooter story={story} />
      </article>
    </Card>
  );
}

function SecondaryStory({ story, index }: { story: HomeStory; index: number }) {
  return (
    <Card className="adc-secondary-story" padding={0} data-secondary-story data-article-card>
      <article>
        <StoryTopline story={story} rank={String(index).padStart(2, "0")} />
        <h3><StoryLink story={story} /></h3>
        <p>{story.summary}</p>
        <StoryFooter story={story} compact />
      </article>
    </Card>
  );
}

function CompactStory({ story, index }: { story: HomeStory; index: number }) {
  return (
    <article className="adc-compact-story" data-compact-story data-article-card>
      <span className="adc-story-rank">{String(index).padStart(2, "0")}</span>
      <div>
        <h3><StoryLink story={story} /></h3>
        <p>{story.summary}</p>
      </div>
      <span className="adc-compact-source">{story.source}</span>
      <a className="adc-icon-link" href={story.url} target="_blank" rel="noopener noreferrer" aria-label={`打开来源：${story.title}`}>
        <ArrowUpRight size={17} />
      </a>
    </article>
  );
}

function StoryTopline({ story, rank }: { story: HomeStory; rank: string }) {
  return (
    <div className="adc-story-topline">
      <span className="adc-story-rank">{rank}</span>
      <Badge variant="neutral" label={story.tags[0] || story.label} />
    </div>
  );
}

function StoryLink({ story }: { story: HomeStory }) {
  return <a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}</a>;
}

function StoryFooter({ story, compact = false }: { story: HomeStory; compact?: boolean }) {
  return (
    <footer className="adc-story-footer">
      <span>{story.source}</span>
      <span>{formatDateShort(story.event_date)}</span>
      {!compact && story.report_url ? <a href={story.report_url}>对应日报</a> : null}
      <a className="adc-icon-link" href={story.url} target="_blank" rel="noopener noreferrer" aria-label={`打开来源：${story.title}`}>
        <ArrowUpRight size={16} />
      </a>
    </footer>
  );
}

function ArchiveSurface({ entries }: { entries: ArchiveEntry[] }) {
  if (entries.length === 0) return <EmptyState title="暂无更多往期日报" />;
  return (
    <section className="adc-archive" aria-label="往期日报列表">
      {entries.map((entry) => (
        <article key={entry.report_date} className="adc-archive-row">
          <CalendarDays size={18} />
          <time dateTime={entry.report_date}>{formatDateLong(entry.report_date)}</time>
          <div>
            <h3><a href={entry.url}>{entry.title}</a></h3>
            <p>{entry.summary}</p>
          </div>
          <a className="adc-icon-link" href={entry.url} aria-label={`打开日报：${entry.title}`}><ArrowUpRight size={17} /></a>
        </article>
      ))}
      <a className="adc-archive-data-link" href="feed.json"><FileText size={16} /> 查看完整日报索引</a>
    </section>
  );
}

function SourceWatchRail({ stories }: { stories: HomeStory[] }) {
  return (
    <section className="adc-source-watch" aria-labelledby="source-watch-title" data-source-watch-rail>
      <div className="adc-source-watch-header">
        <div>
          <p className="adc-kicker">主体之后 · 持续监测</p>
          <h2 id="source-watch-title">Source Watch</h2>
        </div>
        <p>只展示相对历史快照发生实质变化的仓库与站点，并直接回指原始来源。</p>
      </div>
      <div className="adc-source-watch-grid">
        {stories.map((story, index) => (
          <article key={story.id} className="adc-source-watch-card">
            <div className="adc-story-topline">
              <span className="adc-story-rank">SW.{String(index + 1).padStart(2, "0")}</span>
              <Badge variant="neutral" label={story.source} />
            </div>
            <h3><StoryLink story={story} /></h3>
            <p>{story.summary}</p>
            <footer className="adc-story-footer">
              <span>{formatDateShort(story.event_date)}</span>
              <a className="adc-icon-link" href={story.url} target="_blank" rel="noopener noreferrer" aria-label={`打开 Source Watch 来源：${story.title}`}>
                <ArrowUpRight size={16} />
              </a>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="adc-state-grid" role="status" aria-live="polite" aria-label="加载中">
      <Card className="adc-skeleton adc-skeleton-lead" padding={0}><span /><span /><span /></Card>
      <div className="adc-skeleton-stack">
        {Array.from({ length: 3 }, (_unused, index) => (
          <Card key={index} className="adc-skeleton" padding={0}><span /><span /></Card>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <Card className="adc-state-card" padding={0} role="alert">
      <h3>首页数据读取失败</h3>
      <p>{error}</p>
      <Button label="重新加载" variant="secondary" icon={<RefreshCw size={16} />} onClick={() => window.location.reload()} />
    </Card>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <Card className="adc-state-card" padding={0}>
      <h3>{title}</h3>
      <p>公开数据中暂时没有可展示内容。</p>
    </Card>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json() as Promise<T>;
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

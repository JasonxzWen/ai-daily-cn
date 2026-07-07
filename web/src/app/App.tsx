import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  CheckCircle2,
  CircleDashed,
  Database,
  ExternalLink,
  Layers3,
  RadioTower,
  Sparkles
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { loadAppData } from "../lib/api";
import type { AppData, Article, SourceSummary, TopicSummary } from "../lib/types";
import { cn } from "../lib/utils";

type ViewId = "today" | "all" | "topics" | "sources" | "ops";

const NAV_ITEMS: Array<{ id: ViewId; label: string }> = [
  { id: "today", label: "今日精选" },
  { id: "all", label: "全部资讯" },
  { id: "topics", label: "主题" },
  { id: "sources", label: "信源" },
  { id: "ops", label: "运行看板" }
];

const BADGE_VARIANTS = ["cyan", "green", "pink", "orange", "purple"] as const;

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewId>(() => viewFromHash());

  useEffect(() => {
    loadAppData()
      .then(setData)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "数据加载失败");
      });
  }, []);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (error) {
    return <Shell view={view} onViewChange={setView}><ErrorState message={error} /></Shell>;
  }

  if (!data) {
    return <Shell view={view} onViewChange={setView}><LoadingState /></Shell>;
  }

  return (
    <Shell view={view} onViewChange={setView}>
      <Hero data={data} />
      {view === "today" ? <TodayView data={data} /> : null}
      {view === "all" ? <AllArticlesView articles={data.articles} /> : null}
      {view === "topics" ? <TopicsView topics={data.topics.topics} articles={data.articles} /> : null}
      {view === "sources" ? <SourcesView sources={data.sources.sources} /> : null}
      {view === "ops" ? <OpsView data={data} /> : null}
    </Shell>
  );
}

function Shell({
  children,
  view,
  onViewChange
}: {
  children: React.ReactNode;
  view: ViewId;
  onViewChange: (view: ViewId) => void;
}) {
  return (
    <div className="adc-shell" data-adc-app="react">
      <header className="sticky top-0 z-40 mb-9 rounded-full border border-white/10 bg-[rgba(40,42,54,0.76)] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="flex items-center justify-between gap-8">
          <a className="flex items-center gap-3" href="#/today" onClick={() => onViewChange("today")}>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--dracula-purple)] text-lg font-black text-[#191a21] shadow-[0_0_28px_rgba(189,147,249,0.35)]">ADC</span>
            <span>
              <span className="block text-sm font-semibold tracking-[0.16em] text-[var(--dracula-cyan)]">AI DAILY CN</span>
              <span className="block text-xs text-[var(--muted-foreground)]">精选、去重、精读后的 AI 情报</span>
            </span>
          </a>
          <nav className="flex items-center gap-1" aria-label="主导航">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#/${item.id}`}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition",
                  view === item.id
                    ? "bg-white/12 text-[var(--foreground)] shadow-inner"
                    : "text-[var(--muted-foreground)] hover:bg-white/7 hover:text-[var(--foreground)]"
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function Hero({ data }: { data: AppData }) {
  const updated = formatDateTime(data.today.generated_at);
  const stats = [
    { label: "入库资讯", value: data.today.stats.article_count, icon: Database, tone: "text-[var(--dracula-cyan)]" },
    { label: "活跃信源", value: data.today.stats.source_count, icon: RadioTower, tone: "text-[var(--dracula-green)]" },
    { label: "主题线索", value: data.today.stats.topic_count, icon: Layers3, tone: "text-[var(--dracula-pink)]" },
    { label: "AIFY 增补", value: data.today.stats.aify_count, icon: Sparkles, tone: "text-[var(--dracula-yellow)]" }
  ];

  return (
    <section className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(33,34,44,0.70)] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.30)] backdrop-blur-2xl">
      <div className="adc-grid absolute inset-x-0 top-0 h-64 opacity-20" />
      <div className="relative grid grid-cols-[1.25fr_0.75fr] gap-8">
        <div>
          <Badge variant="purple" className="mb-5">ADC 情报室 · {data.today.report_date}</Badge>
          <h1 className="max-w-4xl text-5xl font-black leading-tight text-[var(--foreground)]">
            {data.today.title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[var(--muted-foreground)]">
            {data.today.summary}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Badge variant="cyan">多源抓取</Badge>
            <Badge variant="green">精读打分</Badge>
            <Badge variant="pink">去重审校</Badge>
            <Badge variant="orange">精选送达</Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((item) => (
            <Card key={item.label} className="bg-white/6">
              <CardContent className="p-4">
                <item.icon className={cn("mb-5 h-5 w-5", item.tone)} />
                <div className="font-mono text-3xl font-semibold">{item.value}</div>
                <div className="mt-1 text-sm text-[var(--muted-foreground)]">{item.label}</div>
              </CardContent>
            </Card>
          ))}
          <div className="col-span-2 rounded-[1.35rem] border border-white/10 bg-white/6 px-5 py-4 text-sm text-[var(--muted-foreground)]">
            <span className="text-[var(--foreground)]">最近更新</span>
            <span className="font-mono"> · {updated}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function TodayView({ data }: { data: AppData }) {
  const spotlight = data.today.articles.slice(0, 3);
  const rest = data.today.articles.slice(3, 15);

  return (
    <section className="grid grid-cols-[0.9fr_1.1fr] gap-6">
      <div className="space-y-4">
        <SectionTitle icon={Sparkles} title="今日精选" meta={`${data.today.articles.length} 条精选`} />
        {spotlight.map((article, index) => (
          <ArticleCard key={article.id} article={article} featured={index === 0} />
        ))}
      </div>
      <div className="space-y-4">
        <SectionTitle icon={BookOpenText} title="情报流水" meta="按质量、时效和去重结果混合排序" />
        {rest.map((article) => <ArticleCard key={article.id} article={article} compact />)}
      </div>
    </section>
  );
}

function AllArticlesView({ articles }: { articles: Article[] }) {
  return (
    <section>
      <SectionTitle icon={BookOpenText} title="全部资讯" meta={`${articles.length} 条已处理资讯`} />
      <div className="grid grid-cols-3 gap-4">
        {articles.slice(0, 60).map((article) => <ArticleCard key={article.id} article={article} compact />)}
      </div>
    </section>
  );
}

function TopicsView({ topics, articles }: { topics: TopicSummary[]; articles: Article[] }) {
  const byId = useMemo(() => new Map(articles.map((article) => [article.id, article])), [articles]);

  return (
    <section>
      <SectionTitle icon={Layers3} title="主题" meta="AIFY 话题词表吸收为 ADC 语义层" />
      <div className="grid grid-cols-3 gap-4">
        {topics.slice(0, 18).map((topic, index) => {
          const firstArticle = topic.article_ids.map((id) => byId.get(id)).find(Boolean);
          return (
            <Card key={topic.id}>
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <Badge variant={BADGE_VARIANTS[index % BADGE_VARIANTS.length]}>{topic.label}</Badge>
                  <span className="font-mono text-2xl font-semibold">{topic.count}</span>
                </div>
                <p className="mt-5 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  {firstArticle ? firstArticle.summary : "持续观察该主题下的信源、产品和工程实践变化。"}
                </p>
                <div className="mt-5 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                  <span>{topic.sources.slice(0, 3).join(" / ") || "多源"}</span>
                  <span className="font-mono">{topic.latest_date}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function SourcesView({ sources }: { sources: SourceSummary[] }) {
  return (
    <section>
      <SectionTitle icon={RadioTower} title="信源" meta="公开安全字段，仅展示可读状态" />
      <div className="grid grid-cols-3 gap-4">
        {sources.map((source) => (
          <Card key={source.id}>
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <a className="group text-lg font-semibold" href={source.url} target="_blank" rel="noreferrer">
                    {source.name}
                    <ExternalLink className="ml-2 inline h-4 w-4 opacity-50 transition group-hover:opacity-100" />
                  </a>
                  <div className="mt-2 text-sm text-[var(--muted-foreground)]">{source.source_kind} · {source.authority}</div>
                </div>
                <StatusBadge status={source.status} />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
                <Metric label="文章" value={source.article_count} />
                <Metric label="等级" value={source.tier || "常规"} />
                <Metric label="最近" value={source.latest_article_date || "暂无"} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function OpsView({ data }: { data: AppData }) {
  return (
    <section className="grid grid-cols-[0.8fr_1.2fr] gap-6">
      <Card>
        <CardContent className="p-6">
          <SectionTitle icon={Activity} title="运行看板" meta={data.runtime.final_status === "ready" ? "静态构建已就绪" : "构建降级可用"} tight />
          <div className="mt-6 space-y-4">
            <MetricRow label="Build ID" value={data.runtime.build_id} mono />
            <MetricRow label="模式" value={data.runtime.mode} />
            <MetricRow label="报告日期" value={data.runtime.report_date} mono />
            <MetricRow label="生成时间" value={formatDateTime(data.runtime.generated_at)} mono />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <SectionTitle icon={Database} title="公开产物" meta="React 首页读取的静态 JSON" tight />
          <div className="mt-5 space-y-3">
            {data.runtime.artifacts.map((artifact) => (
              <div key={artifact.path} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <span className="font-mono text-sm text-[var(--dracula-cyan)]">{artifact.path}</span>
                <span className="text-sm text-[var(--muted-foreground)]">{artifact.count} · {artifact.hash}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ArticleCard({ article, featured = false, compact = false }: { article: Article; featured?: boolean; compact?: boolean }) {
  const tags = visibleTags(article);
  const why = whyItMatters(article);

  return (
    <Card data-article-card data-article-id={article.id} className={cn(featured ? "border-[rgba(255,121,198,0.30)] bg-[rgba(68,71,90,0.72)]" : "")}>
      <CardContent className={cn(featured ? "p-6" : "p-5")}>
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              {tags.map((tag, index) => (
                <Badge key={`${article.id}-${tag}`} variant={BADGE_VARIANTS[index % BADGE_VARIANTS.length]}>{tag}</Badge>
              ))}
              <Badge>已去重</Badge>
            </div>
            <a className={cn("group block font-semibold leading-snug", featured ? "text-2xl" : "text-lg")} href={article.url} target="_blank" rel="noreferrer">
              {article.title}
              <ArrowUpRight className="ml-2 inline h-5 w-5 text-[var(--dracula-cyan)] opacity-70 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
            </a>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-2xl font-semibold text-[var(--dracula-yellow)]">{article.quality_score}</div>
            <div className="text-xs text-[var(--muted-foreground)]">质量分</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <span>{article.source}</span>
          <span>·</span>
          <span className="font-mono">{article.date}</span>
          <span>·</span>
          <span>已精读</span>
        </div>
        <p className={cn("mt-4 leading-7 text-[var(--muted-foreground)]", compact ? "line-clamp-2 text-sm" : "line-clamp-3")}>
          {article.summary}
        </p>
        <div className="mt-5 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm leading-6 text-[var(--foreground)]">
          <span className="text-[var(--dracula-green)]">为什么值得看：</span>{why}
        </div>
        <Button asChild variant="ghost" size="sm" className="mt-4 px-0 text-[var(--dracula-cyan)]">
          <a href={article.url} target="_blank" rel="noreferrer">阅读全文 <ExternalLink className="h-4 w-4" /></a>
        </Button>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon: Icon, title, meta, tight = false }: { icon: typeof Sparkles; title: string; meta: string; tight?: boolean }) {
  return (
    <div className={cn("mb-4 flex items-center justify-between", tight ? "mb-0" : "")}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8">
          <Icon className="h-5 w-5 text-[var(--dracula-cyan)]" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">{meta}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-[var(--foreground)]">{value}</div>
    </div>
  );
}

function MetricRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-white/8 pb-3 last:border-b-0">
      <span className="text-sm text-[var(--muted-foreground)]">{label}</span>
      <span className={cn("max-w-[380px] truncate text-right text-sm", mono ? "font-mono" : "")}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: SourceSummary["status"] }) {
  if (status === "checked") {
    return <Badge variant="green"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />正常</Badge>;
  }
  if (status === "blocked") {
    return <Badge variant="orange"><CircleDashed className="mr-1 h-3.5 w-3.5" />降级</Badge>;
  }
  return <Badge><CircleDashed className="mr-1 h-3.5 w-3.5" />待观察</Badge>;
}

function LoadingState() {
  return (
    <Card>
      <CardContent className="p-10">
        <div className="h-6 w-48 animate-pulse rounded-full bg-white/10" />
        <div className="mt-8 grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-[1.35rem] bg-white/7" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-[rgba(255,85,85,0.28)]">
      <CardContent className="p-8">
        <Badge variant="orange">数据加载失败</Badge>
        <p className="mt-5 text-[var(--muted-foreground)]">{message}</p>
      </CardContent>
    </Card>
  );
}

function visibleTags(article: Article) {
  return [...article.channels_l1, ...article.channels_l2, article.domain]
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 3);
}

function whyItMatters(article: Article) {
  const topic = article.channels_l1[0] || article.domain;
  if (article.importance === "major") {
    return `这是 ${topic} 里的高权重信号，适合优先判断产品、模型或工程路线是否需要跟进。`;
  }
  if (article.quality_score >= 85) {
    return `质量分较高且已完成去重，适合作为本主题的代表性信息继续阅读。`;
  }
  return `它补齐了 ${topic} 的上下文，可帮助判断同类事件是否只是噪声还是正在形成趋势。`;
}

function viewFromHash(): ViewId {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return NAV_ITEMS.some((item) => item.id === raw) ? raw as ViewId : "today";
}

function formatDateTime(value: string) {
  if (!value) return "未知";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

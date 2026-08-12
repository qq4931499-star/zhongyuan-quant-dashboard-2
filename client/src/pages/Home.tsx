import { trpc } from "@/lib/trpc";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calculateDashboardMetrics, calculateTrend, formatCurrency, formatPercent, getTradeReturn, hasSellPrice, isRealizedTrade, type QuantTrade } from "@shared/quant";
import { normalizeTradeDateTime } from "@shared/tradeImport";
import html2canvas from "html2canvas";
import { ArrowUpRight, CalendarDays, CheckCircle2, CircleDollarSign, Download, FileSpreadsheet, FileUp, Loader2, Plus, ShieldCheck, Sparkles, Trash2, TrendingUp } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { read, utils as xlsxUtils, writeFile } from "xlsx";

const BRAND_LOGO_URL = "/manus-storage/zhongyuan-company-logo_05345835.png";
const POSTER_WHITE_LOGO_URL = "/manus-storage/zhongyuan-logo-white_e5733281.png";
const POSTER_BACKGROUND_URL = "/manus-storage/strategy-poster-gold-city_c278d7e4.png";

const DEFAULT_SETTINGS = {
  title: "中圆量化 月度收益走势",
  subtitle: "（T+1操作）",
  startDate: "2026-05-01",
  endDate: "2026-05-31",
};

type Settings = typeof DEFAULT_SETTINGS;
type TradeField = "symbol" | "stockName" | "buyPrice" | "sellPrice" | "buyDate" | "sellDate";
type ImportTrade = Omit<QuantTrade, "id">;
type ImportIssue = { row: number; message: string };

const importColumns = [
  { key: "symbol", label: "股票代码", aliases: ["股票代码", "代码", "symbol", "stock code"] },
  { key: "stockName", label: "股票名称", aliases: ["股票名称", "名称", "stockname", "stock name"] },
  { key: "buyPrice", label: "买入价", aliases: ["买入价", "买入价格", "buyprice", "buy price"] },
  { key: "sellPrice", label: "卖出价", aliases: ["卖出价", "卖出价格", "sellprice", "sell price"] },
  { key: "buyDate", label: "买入时间", aliases: ["买入时间", "买入日期", "buydatetime", "buydate", "buy time", "buy date"] },
  { key: "sellDate", label: "卖出时间", aliases: ["卖出时间", "卖出日期", "selldatetime", "selldate", "sell time", "sell date"] },
] as const;

function findImportCell(record: Record<string, unknown>, aliases: readonly string[]) {
  const entry = Object.entries(record).find(([header]) => aliases.includes(header.trim().toLowerCase()));
  return entry?.[1] ?? "";
}

function normalizeImportDateTime(value: unknown) {
  const raw = String(value ?? "").trim().replace(/[./]/g, "-").replace("T", " ");
  const [rawDate, rawTime = "00:00"] = raw.split(/\s+/);
  const parts = (rawDate ?? "").split("-").filter(Boolean);
  if (parts.length !== 3 || parts.some(part => !/^\d+$/.test(part))) return null;
  const [first, second, third] = parts;
  const year = first!.length === 4 ? first! : third!.length === 2 ? `20${third}` : third!;
  const month = first!.length === 4 ? second! : first!;
  const day = first!.length === 4 ? third! : second!;
  if (year.length !== 4) return null;
  if (!/^\d{1,2}:\d{2}$/.test(rawTime)) return null;
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${rawTime.padStart(5, "0")}`;
  const date = new Date(`${normalized.replace(" ", "T")}:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized.slice(0, 10) || date.getUTCHours() !== Number(rawTime.split(":")[0]) || date.getUTCMinutes() !== Number(rawTime.split(":")[1]) ? null : normalized;
}

function parseImportRecords(records: Record<string, unknown>[]) {
  const issues: ImportIssue[] = [];
  if (records.length === 0) return { rows: [] as ImportTrade[], issues: [{ row: 1, message: "未识别到可导入的数据行" }] };
  const headers = Object.keys(records[0]!).map(header => header.trim().toLowerCase());
  const missingHeaders = importColumns.filter(column => !headers.some(header => (column.aliases as readonly string[]).includes(header))).map(column => column.label);
  if (missingHeaders.length > 0) return { rows: [] as ImportTrade[], issues: [{ row: 1, message: `缺少列：${missingHeaders.join("、")}` }] };

  const rows = records.reduce<ImportTrade[]>((validRows, record, index) => {
    const rowNumber = index + 2;
    const symbol = String(findImportCell(record, importColumns[0].aliases)).trim().toUpperCase();
    const stockName = String(findImportCell(record, importColumns[1].aliases)).trim();
    const buyPrice = Number(String(findImportCell(record, importColumns[2].aliases)).replace(/[￥¥,\s]/g, ""));
    const sellPriceRaw = String(findImportCell(record, importColumns[3].aliases)).trim();
    const sellPrice = sellPriceRaw ? Number(sellPriceRaw.replace(/[￥¥,\s]/g, "")) : null;
    const buyDate = normalizeImportDateTime(findImportCell(record, importColumns[4].aliases));
    const sellDateRaw = String(findImportCell(record, importColumns[5].aliases)).trim();
    const sellDate = sellDateRaw ? normalizeImportDateTime(sellDateRaw) : null;
    const messages = [!symbol && "股票代码为空", !stockName && "股票名称为空", (!Number.isFinite(buyPrice) || buyPrice <= 0) && "买入价无效", (sellPriceRaw && (!Number.isFinite(sellPrice) || sellPrice! <= 0)) && "卖出价无效", !buyDate && "买入日期无效", (sellDateRaw && !sellDate) && "卖出日期无效"].filter(Boolean) as string[];
    if (messages.length > 0) {
      issues.push({ row: rowNumber, message: messages.join("；") });
      return validRows;
    }
    validRows.push({ symbol, stockName, buyPrice, sellPrice, buyDate: buyDate!, sellDate: sellDate! });
    return validRows;
  }, []);
  return { rows, issues };
}

function BrandLogo({ exportMode = false, src = BRAND_LOGO_URL }: { exportMode?: boolean; src?: string }) {
  return (
    <div className={`brand-logo ${exportMode ? "brand-logo-export" : ""}`}>
      <img data-export-logo={src} src={src} alt="中圆公司标志" />
    </div>
  );
}

async function loadImageAsDataUrl(url: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("品牌 Logo 加载失败");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("品牌 Logo 转换失败"));
    reader.onerror = () => reject(new Error("品牌 Logo 转换失败"));
    reader.readAsDataURL(blob);
  });
}

function MetricCard({ label, value, detail, tone = "navy" }: { label: string; value: string; detail: string; tone?: "navy" | "red" | "gold" }) {
  const lengthClass = value.length >= 12 ? "metric-value-very-long" : value.length >= 9 ? "metric-value-long" : "";
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card-top"><span>{label}</span><span className="metric-marker" /></div>
      <strong className={lengthClass}>{value}</strong>
    </article>
  );
}

function TrendLabel({ x, y, index, value, lastIndex }: { x?: number; y?: number; index?: number; value?: number; lastIndex: number }) {
  if (typeof x !== "number" || typeof y !== "number" || typeof value !== "number") return null;
  const isFirst = index === 0;
  const isLast = index === lastIndex;
  const above = !isFirst && (index ?? 0) % 2 === 0;
  return (
    <text x={x + (isFirst ? 13 : isLast ? -13 : 0)} y={y + (isFirst ? 24 : above ? -15 : 24)} textAnchor={isFirst ? "start" : isLast ? "end" : "middle"} className="trend-data-label">
      {formatPercent(value)}
    </text>
  );
}

function TrendChart({ trades, exportMode = false }: { trades: QuantTrade[]; exportMode?: boolean }) {
  const trend = useMemo(() => calculateTrend(trades), [trades]);
  const finalReturn = trend.at(-1)?.cumulativeReturn ?? 0;
  const chartHeight = exportMode ? 318 : 340;
  return (
    <section className={`trend-panel ${exportMode ? "trend-panel-export" : ""}`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Performance curve</p>
          <h2>累计收益趋势</h2>
        </div>
        <div className="final-return"><span>总收益率</span><strong>{formatPercent(finalReturn)}</strong></div>
      </div>
      <div className="chart-wrap" style={{ height: chartHeight }}>
        {trend.length === 0 ? <div className="chart-empty"><TrendingUp /><span>暂无交易数据，新增交易后将自动生成收益趋势。</span></div> : <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 42, right: 46, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="#ded8d0" strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="date" padding={{ left: 18, right: 18 }} tickFormatter={value => value.slice(5).replace("-", "/")} tickLine={false} axisLine={false} tick={{ fill: "#657083", fontSize: 12, fontFamily: "DM Mono" }} />
            <YAxis tickFormatter={value => `${(value * 100).toFixed(0)}%`} width={48} tickLine={false} axisLine={false} tick={{ fill: "#657083", fontSize: 12, fontFamily: "DM Mono" }} />
            <Tooltip
              cursor={{ stroke: "#e5b172", strokeWidth: 1 }}
              formatter={(value: number) => [formatPercent(value), "累计收益率"]}
              labelFormatter={value => `卖出日期 · ${value}`}
              contentStyle={{ background: "#172036", border: "none", borderRadius: 10, color: "#fff", fontSize: 12 }}
              labelStyle={{ color: "#e5b172" }}
            />
            <Line type="monotone" dataKey="cumulativeReturn" stroke="#b61928" strokeWidth={3} dot={{ r: 4, fill: "#f7f4ef", stroke: "#b61928", strokeWidth: 2.5 }} activeDot={{ r: 6, fill: "#e5b172", stroke: "#b61928", strokeWidth: 2 }} label={<TrendLabel lastIndex={trend.length - 1} />} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>}
      </div>
      {!exportMode && <p className="chart-note">按卖出日期升序；累计值为各笔单笔收益率的直接加总。数据每 5 秒同步一次。</p>}
    </section>
  );
}

function MarketingExport({ settings, trades, detailTrades }: { settings: Settings; trades: QuantTrade[]; detailTrades: QuantTrade[] }) {
  const metrics = calculateDashboardMetrics(trades);
  return (
    <section id="marketing-export" data-export-stage aria-hidden="true">
      <header className="export-header">
        <BrandLogo exportMode />
        <p>公开协作 · 月度交易复盘</p>
        <h1>{settings.title}</h1>
        <span>{settings.subtitle}</span>
        <time>{settings.startDate.replaceAll("-", ".")} — {settings.endDate.replaceAll("-", ".")}</time>
      </header>
      <div className="export-rule" />
      <div className="export-metrics">
        <MetricCard label="总交易次数" value={`${metrics.totalTrades} 笔`} detail="当期完成交易" />
        <MetricCard label="总盈亏金额" value={formatCurrency(metrics.totalProfit)} detail="卖出价 − 买入价" tone="red" />
        <MetricCard label="平均单笔收益率" value={formatPercent(metrics.averageReturn)} detail="算术平均" tone="gold" />
        <MetricCard label="最大单笔收益率" value={formatPercent(metrics.maximumReturn)} detail="当前最高纪录" />
      </div>
      <TrendChart trades={trades} exportMode />
      <div className="export-table-title"><span>交易明细</span><span>展示 {detailTrades.length} / {trades.length}</span></div>
      <table className="export-trade-table">
        <thead><tr><th>#</th><th>股票</th><th>买入</th><th>卖出</th><th>卖出日</th><th>收益率</th></tr></thead>
        <tbody>{detailTrades.map((trade, index) => <tr key={trade.id} data-buy-date={trade.buyDate}><td>{String(index + 1).padStart(2, "0")}</td><td><b>{trade.symbol}</b><span>{trade.stockName}</span></td><td>{trade.buyPrice.toFixed(2)}</td><td>{typeof trade.sellPrice === "number" ? trade.sellPrice.toFixed(2) : "-----"}</td><td>{trade.sellDate?.slice(5) ?? "-----"}</td><td className={hasSellPrice(trade) ? getTradeReturn(trade) >= 0 ? "positive" : "negative" : "pending"}>{hasSellPrice(trade) ? formatPercent(getTradeReturn(trade)) : "-----"}</td></tr>)}</tbody>
      </table>
      <footer className="export-footer"><span>中圆量化 · 数据维护于云端</span><strong>总收益率 {formatPercent(metrics.finalCumulativeReturn)}</strong></footer>
    </section>
  );
}

function StrategyPoster({ settings, trades, detailTrades }: { settings: Settings; trades: QuantTrade[]; detailTrades: QuantTrade[] }) {
  const metrics = calculateDashboardMetrics(trades);
  const realizedTrades = trades.filter(isRealizedTrade);
  const profitableTrades = realizedTrades.filter(trade => getTradeReturn(trade) > 0).length;
  const winRate = realizedTrades.length > 0 ? profitableTrades / realizedTrades.length : 0;
  const minReturn = realizedTrades.length > 0 ? Math.min(...realizedTrades.map(getTradeReturn)) : 0;
  const cards = [
    { value: formatPercent(metrics.finalCumulativeReturn), label: "累计收益" },
    { value: `${metrics.totalTrades}只`, label: "交易股票数量" },
    { value: `${profitableTrades}只`, label: "盈利股票数量" },
    { value: formatPercent(winRate), label: "胜率" },
    { value: formatPercent(metrics.maximumReturn), label: "最高单笔收益" },
  ];
  return (
    <section id="strategy-poster" data-export-stage aria-hidden="true">
      <div className="poster-hero">
        <div className="poster-hero-grid" />
        <div className="poster-orbits"><i /><i /><i /><b>中圆</b></div>
        <div className="poster-brand"><BrandLogo exportMode src={POSTER_WHITE_LOGO_URL} /><span>公开协作 · 量化策略复盘</span></div>
        <div className="poster-period"><span>统计周期</span><strong>{settings.startDate.replaceAll("-", ".")} - {settings.endDate.replaceAll("-", ".")}</strong></div>
        <div className="poster-heading"><p>ZHONGYUAN QUANTITATIVE</p><h1>中圆量化<br />{settings.startDate.slice(0, 4)}年{Number(settings.startDate.slice(5, 7))}月策略执行汇总</h1><small>{settings.subtitle || "（T+1操作）"}</small></div>
      </div>
      <div className="poster-metrics">{cards.map(card => <div className="poster-metric" key={card.label}><strong>{card.value}</strong><span>{card.label}</span></div>)}</div>
      <div className="poster-ledger">
        <div className="poster-ledger-heading"><span>交易明细</span><b>（T+1交易策略 · 当前记录收益区间 {formatPercent(minReturn)} — {formatPercent(metrics.maximumReturn)}）</b></div>
        <table className="poster-trade-table">
          <thead><tr><th>序列</th><th>股票名称</th><th>股票代码</th><th>买入价格</th><th>买入时间</th><th>卖出价格</th><th>卖出时间</th><th>收益率</th></tr></thead>
          <tbody>{detailTrades.map((trade, index) => <tr key={trade.id} data-buy-date={trade.buyDate}><td>{index + 1}</td><td>{trade.stockName}</td><td>{trade.symbol}</td><td>{trade.buyPrice.toFixed(2)}</td><td>{trade.buyDate}</td><td>{typeof trade.sellPrice === "number" ? trade.sellPrice.toFixed(2) : "-----"}</td><td>{trade.sellDate ?? "-----"}</td><td className={hasSellPrice(trade) ? getTradeReturn(trade) >= 0 ? "poster-positive" : "poster-negative" : "poster-pending"}>{hasSellPrice(trade) ? formatPercent(getTradeReturn(trade)) : "-----"}</td></tr>)}</tbody>
        </table>
      </div>
      <footer className="poster-footer"><strong>量行致远 · 衡守初心</strong><span>中圆量化，以数据洞察市场，以模型辅助研判，以风控守护每一次决策。</span></footer>
    </section>
  );
}

function BuyReport({ trades, reportDate, selectedTradeIds }: { trades: QuantTrade[]; reportDate: string; selectedTradeIds: number[] }) {
  const manuallySelectedTrades = trades.filter(trade => selectedTradeIds.includes(trade.id));
  const selectedTrades = (manuallySelectedTrades.length > 0 ? manuallySelectedTrades : trades.filter(trade => trade.buyDate.startsWith(reportDate))).slice(0, 4);
  const logicItems = [{ label: "趋势识别", Icon: TrendingUp }, { label: "资金行为", Icon: CircleDollarSign }, { label: "多因子共振", Icon: Sparkles }, { label: "风险过滤", Icon: ShieldCheck }];
  return (
    <section id="buy-report" data-export-stage aria-hidden="true">
      <header className="buy-report-header"><BrandLogo exportMode src={POSTER_WHITE_LOGO_URL} /><p>ZHONGYUAN QUANTITATIVE</p><h1>今日策略战报</h1><time>{reportDate.replaceAll("-", ".")}</time><strong>中圆量化智能决策系统</strong></header>
      {selectedTrades.length === 0 ? <div className="buy-report-empty">该日期暂无新增交易明细</div> : <div className={`buy-report-grid buy-report-count-${selectedTrades.length}`}>{selectedTrades.map(trade => <article className="buy-report-card" key={trade.id}><h2>{trade.stockName} <small>/ {trade.symbol}</small></h2><dl><div><dt>买入价格</dt><dd>{trade.buyPrice.toFixed(2)}</dd></div><div><dt>买入时间</dt><dd>{trade.buyDate}</dd></div><div><dt>卖出价格</dt><dd>{typeof trade.sellPrice === "number" ? trade.sellPrice.toFixed(2) : "-----"}</dd></div><div><dt>卖出时间</dt><dd>{trade.sellDate ?? "-----"}</dd></div><div><dt>收益率</dt><dd className={`buy-report-profit ${hasSellPrice(trade) ? getTradeReturn(trade) >= 0 ? "profit-positive" : "profit-negative" : "profit-pending"}`}>{hasSellPrice(trade) ? formatPercent(getTradeReturn(trade)) : "-----"}</dd></div></dl></article>)}</div>}
      <section className="buy-report-logic"><div>{logicItems.map(({ label, Icon }) => <article key={label}><span className="buy-report-logic-icon" aria-hidden="true"><Icon strokeWidth={1.7} viewBox="-2 -2 28 28" /></span><b>{label}</b></article>)}</div></section>
      <footer className="buy-report-footer"><strong>量行致远 · 衡守初心</strong><span>数据仅供策略研究与交流，不构成任何投资建议</span></footer>
    </section>
  );
}

export default function Home() {
  const utils = trpc.useUtils();
  const { data: snapshot, isLoading, isError } = trpc.dashboard.snapshot.useQuery(undefined, { refetchInterval: 5000, refetchOnWindowFocus: true });
  const settings = snapshot?.settings ?? DEFAULT_SETTINGS;
  const trades = useMemo(() => ([...(snapshot?.trades ?? [])] as QuantTrade[]).sort((left, right) => right.buyDate.localeCompare(left.buyDate) || right.id - left.id), [snapshot?.trades]);
  const metrics = useMemo(() => calculateDashboardMetrics(trades), [trades]);
  const [titleDraft, setTitleDraft] = useState(settings.title);
  const [subtitleDraft, setSubtitleDraft] = useState(settings.subtitle);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false);
  const [pendingExport, setPendingExport] = useState<"marketing" | "strategy" | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportCount, setExportCount] = useState("5");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedReportTradeIds, setSelectedReportTradeIds] = useState<number[]>([]);
  const [timeDrafts, setTimeDrafts] = useState<Record<number, { buyDate: string; sellDate: string }>>({});
  const [importRows, setImportRows] = useState<ImportTrade[]>([]);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTitleDraft(settings.title); setSubtitleDraft(settings.subtitle); }, [settings.title, settings.subtitle]);
  useEffect(() => setSelectedReportTradeIds(previous => {
    const available = previous.filter(id => trades.some(trade => trade.id === id));
    return available.length === previous.length ? previous : available;
  }), [trades]);

  const refresh = () => utils.dashboard.snapshot.invalidate();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const reportShortcutDates = useMemo(() => Array.from(new Set([today, yesterday, ...trades.map(trade => trade.buyDate.slice(0, 10))])).sort((a, b) => b.localeCompare(a)).slice(0, 6), [today, yesterday, trades]);
  const updateSettings = trpc.dashboard.updateSettings.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const updateTrade = trpc.dashboard.updateTrade.useMutation({ onSuccess: updated => {
    if (updated) {
      utils.dashboard.snapshot.setData(undefined, snapshot => snapshot ? {
        ...snapshot,
        trades: snapshot.trades.map(trade => trade.id === updated.id ? { ...trade, ...updated } : trade),
      } : snapshot);
    }
    void refresh();
  }, onError: error => toast.error(error.message) });
  const deleteTrade = trpc.dashboard.deleteTrade.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const createTrade = trpc.dashboard.createTrade.useMutation({ onSuccess: () => { refresh(); setIsModalOpen(false); toast.success("交易已保存"); }, onError: error => toast.error(error.message) });
  const bulkImportTrades = trpc.dashboard.bulkImportTrades.useMutation();

  const persistSetting = (field: keyof Settings, value: string) => {
    if (value.trim() && value !== settings[field]) updateSettings.mutate({ [field]: value.trim() });
  };
  const persistTrade = (trade: QuantTrade, field: TradeField, rawValue: string) => {
    const optionalSellField = field === "sellPrice" || field === "sellDate";
    if (optionalSellField && !rawValue.trim()) {
      if (trade[field] !== null) updateTrade.mutate({ id: trade.id, values: { [field]: null } });
      return;
    }
    const value = field === "buyPrice" || field === "sellPrice" ? Number(rawValue) : field === "buyDate" || field === "sellDate" ? normalizeTradeDateTime(rawValue) : rawValue.trim();
    if ((typeof value === "number" && (!Number.isFinite(value) || value <= 0)) || (typeof value === "string" && !value)) {
      toast.error("请填写有效的交易信息");
      return;
    }
    if (value !== trade[field]) updateTrade.mutate({ id: trade.id, values: { [field]: value } });
  };
  const toDateTimeLocalValue = (value: string | null) => value ? normalizeTradeDateTime(value).replace(" ", "T") : "";
  const getTimeDraft = (trade: QuantTrade) => timeDrafts[trade.id] ?? { buyDate: toDateTimeLocalValue(trade.buyDate), sellDate: toDateTimeLocalValue(trade.sellDate) };
  const updateTimeDraft = (trade: QuantTrade, field: "buyDate" | "sellDate", value: string) => setTimeDrafts(previous => ({ ...previous, [trade.id]: { ...getTimeDraft(trade), ...previous[trade.id], [field]: value } }));
  const hasTimeChanges = (trade: QuantTrade) => { const draft = getTimeDraft(trade); return draft.buyDate !== toDateTimeLocalValue(trade.buyDate) || draft.sellDate !== toDateTimeLocalValue(trade.sellDate); };
  const confirmTradeTimes = (trade: QuantTrade) => {
    const draft = getTimeDraft(trade);
    const buyDate = normalizeTradeDateTime(draft.buyDate);
    const sellDate = draft.sellDate.trim() ? normalizeTradeDateTime(draft.sellDate) : null;
    if (!buyDate || (draft.sellDate.trim() && !sellDate)) { toast.error("请填写有效的年-月-日时分"); return; }
    updateTrade.mutate({ id: trade.id, values: { buyDate, sellDate } }, { onSuccess: () => {
      utils.dashboard.snapshot.setData(undefined, snapshot => snapshot ? { ...snapshot, trades: snapshot.trades.map(item => item.id === trade.id ? { ...item, buyDate, sellDate } : item) } : snapshot);
      setTimeDrafts(previous => { const { [trade.id]: _, ...rest } = previous; return rest; });
      void refresh();
      toast.success(`${trade.symbol} 时间已确认`);
    } });
  };
  const toggleReportTrade = (tradeId: number, checked: boolean) => setSelectedReportTradeIds(previous => {
    if (!checked) return previous.filter(id => id !== tradeId);
    if (previous.includes(tradeId)) return previous;
    if (previous.length >= 4) { toast.error("今日策略战报最多选择 4 条交易"); return previous; }
    return [...previous, tradeId];
  });

  const addTrade = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createTrade.mutate({
      symbol: String(form.get("symbol") ?? ""), stockName: String(form.get("stockName") ?? ""),
      buyPrice: Number(form.get("buyPrice")), sellPrice: String(form.get("sellPrice") ?? "").trim() ? Number(form.get("sellPrice")) : null,
      buyDate: normalizeTradeDateTime(String(form.get("buyDate") ?? "")), sellDate: String(form.get("sellDate") ?? "").trim() ? normalizeTradeDateTime(String(form.get("sellDate"))) : null,
    });
  };

  const resetImport = () => {
    setImportRows([]); setImportIssues([]); setImportFileName("");
    if (importInputRef.current) importInputRef.current.value = "";
  };

  const downloadImportTemplate = () => {
    const workbook = xlsxUtils.book_new();
    const worksheet = xlsxUtils.json_to_sheet([
      { "股票代码": "600519.SH", "股票名称": "贵州茅台", "买入价": 1685.5, "卖出价": 1798.6, "买入时间": "2026-05-06 09:35", "卖出时间": "2026-05-07 10:02" },
      { "股票代码": "300750.SZ", "股票名称": "宁德时代", "买入价": 193.45, "卖出价": "", "买入时间": "2026-05-07 10:18", "卖出时间": "" },
    ]);
    xlsxUtils.book_append_sheet(workbook, worksheet, "交易明细");
    writeFile(workbook, "中圆量化-交易批量导入模板.xlsx");
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    resetImport();
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setImportIssues([{ row: 1, message: "仅支持 CSV 或 XLSX 文件" }]);
      return;
    }
    try {
      const workbook = file.name.toLowerCase().endsWith(".csv")
        ? read((await file.text()).replace(/^\uFEFF/, ""), { type: "string", cellDates: true })
        : read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!firstSheet) throw new Error("未找到工作表");
      const records = xlsxUtils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
      if (records.length > 500) throw new Error("单次最多导入 500 条交易记录");
      const parsed = parseImportRecords(records);
      setImportRows(parsed.rows); setImportIssues(parsed.issues); setImportFileName(file.name);
      if (parsed.issues.length === 0) toast.success(`已识别 ${parsed.rows.length} 条可导入交易`);
    } catch (error) {
      setImportIssues([{ row: 1, message: error instanceof Error ? error.message : "文件解析失败" }]);
    }
  };

  const submitBulkImport = async () => {
    if (importRows.length === 0 || importIssues.length > 0) return;
    try {
      const result = await bulkImportTrades.mutateAsync({ trades: importRows });
      if (result.issues.length > 0) {
        setImportIssues(result.issues.map(issue => ({ row: issue.row, message: issue.messages.join("；") })));
        toast.error("服务器校验未通过，请修正文件后重试");
        return;
      }
      await refresh();
      toast.success(`已导入 ${result.imported} 条交易`, { description: result.skipped > 0 ? `已跳过 ${result.skipped} 条重复交易。` : "指标与趋势已自动刷新。" });
      setIsImportOpen(false); resetImport();
    } catch (error) {
      toast.error("批量导入失败", { description: error instanceof Error ? error.message : "请检查文件内容后重试" });
    }
  };

  const exportImage = async ({ stageId, captureClass, fileSuffix, backgroundColor }: { stageId: string; captureClass: string; fileSuffix: string; backgroundColor: string }) => {
    const sourceStage = exportRef.current?.querySelector<HTMLElement>(`#${stageId}`);
    if (!sourceStage) {
      toast.error("营销图画布尚未准备完成");
      return;
    }
    setIsExporting(true);
    const captureHost = document.createElement("div");
    try {
      const logoUrls = Array.from(new Set(Array.from(sourceStage.querySelectorAll<HTMLImageElement>("[data-export-logo]")).map(image => image.dataset.exportLogo ?? BRAND_LOGO_URL)));
      const assetUrls = stageId === "strategy-poster" ? [...logoUrls, POSTER_BACKGROUND_URL] : logoUrls;
      const assetDataUrls = new Map(await Promise.all(assetUrls.map(async url => [url, await loadImageAsDataUrl(url)] as const)));
      const applyExportAssets = (stage: HTMLElement) => {
        stage.querySelectorAll<HTMLImageElement>("[data-export-logo]").forEach(image => { image.src = assetDataUrls.get(image.dataset.exportLogo ?? BRAND_LOGO_URL) ?? image.src; });
        const hero = stage.querySelector<HTMLElement>(".poster-hero");
        const posterBackground = assetDataUrls.get(POSTER_BACKGROUND_URL);
        if (hero && posterBackground) {
          hero.style.backgroundImage = `linear-gradient(180deg, rgba(4,4,3,.08), rgba(18,10,4,.56)), url("${posterBackground}")`;
          hero.style.backgroundPosition = "center, center";
          hero.style.backgroundRepeat = "no-repeat, no-repeat";
          hero.style.backgroundSize = "auto, cover";
        }
      };
      const captureStage = sourceStage.cloneNode(true) as HTMLElement;
      captureStage.id = `${stageId}-capture`;
      captureStage.classList.add(captureClass);
      applyExportAssets(captureStage);
      Object.assign(captureHost.style, { position: "fixed", left: "-2000px", top: "0", width: "1080px", pointerEvents: "none", overflow: "hidden" });
      captureHost.appendChild(captureStage);
      document.body.appendChild(captureHost);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await document.fonts?.ready;
      const captureHeight = Math.ceil(captureStage.scrollHeight);
      if (captureHeight < 500) throw new Error("营销图内容高度异常");
      const canvas = await html2canvas(captureStage, {
        backgroundColor, useCORS: true, allowTaint: false, scale: 1, imageTimeout: 15000, width: 1080, height: captureHeight, windowWidth: 1080, windowHeight: captureHeight,
        onclone: clonedDocument => {
          const clonedStage = clonedDocument.querySelector<HTMLElement>(`.${captureClass}`);
          if (clonedStage) Object.assign(clonedStage.style, { position: "fixed", left: "0", top: "0", visibility: "visible", display: "block", margin: "0" });
          if (clonedStage) applyExportAssets(clonedStage);
        },
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("图片生成失败");
      if (blob.size < 10_000) throw new Error("生成的图片数据异常，请重试");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${settings.title.replace(/[\\/:*?"<>|]/g, "-")}-${fileSuffix}.png`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${fileSuffix}已下载`, { description: `1080 × ${captureHeight} PNG 已生成。` });
    } catch (error) {
      toast.error("导出失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    } finally { captureHost.remove(); setIsExporting(false); }
  };
  const exportMarketingImage = () => exportImage({ stageId: "marketing-export", captureClass: "marketing-export-capture", fileSuffix: "营销图", backgroundColor: "#f7f4ef" });
  const exportStrategyPoster = () => exportImage({ stageId: "strategy-poster", captureClass: "strategy-poster-capture", fileSuffix: "策略汇总海报", backgroundColor: "#0a0908" });
  const exportBuyReport = () => { setIsReportOpen(false); exportImage({ stageId: "buy-report", captureClass: "buy-report-capture", fileSuffix: `${reportDate.replaceAll("-", "")}-今日策略战报`, backgroundColor: "#080807" }); };
  const openExportOptions = (target: "marketing" | "strategy") => { setPendingExport(target); setIsExportOptionsOpen(true); };
  const confirmPosterExport = () => { setIsExportOptionsOpen(false); if (pendingExport === "strategy") exportStrategyPoster(); if (pendingExport === "marketing") exportMarketingImage(); };
  const resolvedExportCount = exportCount.trim().toLowerCase() === "全部" || exportCount.trim().toLowerCase() === "all" ? trades.length : Math.max(1, Math.min(trades.length, Number.parseInt(exportCount, 10) || 5));
  const exportTrades = trades.slice(0, resolvedExportCount).sort((left, right) => left.buyDate.localeCompare(right.buyDate) || left.id - right.id);

  if (isLoading) return <main className="loading-screen"><Loader2 className="spin" /><span>正在连接收益数据…</span></main>;
  if (isError) return <main className="loading-screen"><span>数据暂时不可用，请刷新页面后重试。</span></main>;

  return (
    <main className="app-shell">
      <div className="page-grid">
        <header className="topbar">
          <div className="topbar-brand"><BrandLogo /><span className="public-pill"><i />公开协作</span></div>
          <div className="title-editor">
            <p className="eyebrow">Monthly return journal</p>
            <input aria-label="主标题" className="main-title-input" value={titleDraft} maxLength={120} onChange={event => setTitleDraft(event.target.value)} onBlur={event => persistSetting("title", event.target.value)} />
            <input aria-label="副标题" className="subtitle-input" value={subtitleDraft} maxLength={120} onChange={event => setSubtitleDraft(event.target.value)} onBlur={event => persistSetting("subtitle", event.target.value)} />
          </div>
          <div className="topbar-actions">
            <div className="date-stack"><span><CalendarDays />统计区间</span><div><input aria-label="统计起始日期" type="date" value={settings.startDate} onChange={event => persistSetting("startDate", event.target.value)} /><em>至</em><input aria-label="统计截止日期" type="date" value={settings.endDate} onChange={event => persistSetting("endDate", event.target.value)} /></div></div>
            <div className="export-actions"><button className="poster-export-button" onClick={() => openExportOptions("strategy")} disabled={isExporting}>{isExporting ? <Loader2 className="spin" /> : <Download />}{isExporting ? "生成中" : "策略汇总海报"}</button><button className="export-button" onClick={() => openExportOptions("marketing")} disabled={isExporting}>{isExporting ? <Loader2 className="spin" /> : <Download />}{isExporting ? "生成中" : "导出营销图"}</button></div>
          </div>
        </header>

        <section className="metrics-section" aria-label="核心指标">
          <div className="section-kicker"><span>01</span><p>月度关键指标 <small>实时由交易明细计算</small></p></div>
          <div className="metrics-grid">
            <MetricCard label="总交易次数" value={`${metrics.totalTrades} 笔`} detail="已实现交易" />
            <MetricCard label="总盈亏金额" value={formatCurrency(metrics.totalProfit)} detail="卖出价 − 买入价累计" tone="red" />
            <MetricCard label="平均单笔收益率" value={formatPercent(metrics.averageReturn)} detail="各笔收益率算术平均" tone="gold" />
            <MetricCard label="最大单笔收益率" value={formatPercent(metrics.maximumReturn)} detail="当前记录最高值" />
          </div>
        </section>

        <TrendChart trades={trades} />

        <section className="trade-section">
          <div className="section-heading table-heading">
            <div><p className="eyebrow">Trading ledger</p><h2>交易明细</h2></div>
            <div className="table-actions"><button className="battle-report-button" onClick={() => setIsReportOpen(true)}><FileSpreadsheet />今日策略战报</button><button className="template-button" onClick={downloadImportTemplate}><Download />下载模板</button><button className="import-trade-button" onClick={() => { resetImport(); setIsImportOpen(true); }}><FileUp />批量导入</button><button className="add-trade-button" onClick={() => setIsModalOpen(true)}><Plus />新增交易</button></div>
          </div>
          <div className="table-scroll">
            <table className="trade-table">
              <thead><tr><th aria-label="选择战报数据">勾选</th><th>序号</th><th>股票代码</th><th>股票名称</th><th>买入价</th><th>卖出价</th><th>买入时间</th><th>卖出时间</th><th>确认</th><th>单笔收益率</th><th aria-label="操作" /></tr></thead>
              <tbody>
                {trades.length === 0 ? <tr><td colSpan={11}><div className="table-empty"><TrendingUp /><span>暂无交易记录</span><button onClick={() => setIsModalOpen(true)}>新增第一笔交易</button></div></td></tr> : trades.map((trade, index) => <tr key={trade.id}>
                  <td><input className="report-select-input" aria-label={`选择 ${trade.symbol} 用于今日策略战报`} type="checkbox" checked={selectedReportTradeIds.includes(trade.id)} onChange={event => toggleReportTrade(trade.id, event.target.checked)} /></td>
                  <td><span className="row-number">{String(index + 1).padStart(2, "0")}</span></td>
                  <td><input aria-label={`${trade.symbol} 股票代码`} className="cell-input symbol-input" defaultValue={trade.symbol} maxLength={32} onBlur={event => persistTrade(trade, "symbol", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 股票名称`} className="cell-input" defaultValue={trade.stockName} maxLength={80} onBlur={event => persistTrade(trade, "stockName", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 买入价`} className="cell-input price-input" type="number" min="0.01" step="0.01" defaultValue={trade.buyPrice} onBlur={event => persistTrade(trade, "buyPrice", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 卖出价`} className="cell-input price-input" type="number" min="0.01" step="0.01" defaultValue={trade.sellPrice ?? ""} placeholder="-----" onBlur={event => persistTrade(trade, "sellPrice", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 买入时间`} className="cell-input date-cell-input" type="datetime-local" value={getTimeDraft(trade).buyDate} onChange={event => updateTimeDraft(trade, "buyDate", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 卖出时间`} className="cell-input date-cell-input" type="datetime-local" value={getTimeDraft(trade).sellDate} onChange={event => updateTimeDraft(trade, "sellDate", event.target.value)} /></td>
                  <td className="time-confirm-cell">{hasTimeChanges(trade) && <button className="time-confirm-button" disabled={updateTrade.isPending} onClick={() => confirmTradeTimes(trade)}><CheckCircle2 />确认</button>}</td>
                  <td><span className={`return-tag ${hasSellPrice(trade) ? getTradeReturn(trade) >= 0 ? "positive" : "negative" : "pending"}`}>{hasSellPrice(trade) ? formatPercent(getTradeReturn(trade)) : "-----"}</span></td>
                  <td><button aria-label={`删除 ${trade.symbol} 交易`} className="delete-button" onClick={() => deleteTrade.mutate({ id: trade.id })}><Trash2 /></button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="table-footer"><span>共 <b>{trades.length}</b> 条交易记录，其中已实现 <b>{metrics.totalTrades}</b> 条；已勾选 <b>{selectedReportTradeIds.length}</b> / 4 条用于今日策略战报</span><span>单笔收益率 = （卖出价 − 买入价）÷ 买入价</span></div>
        </section>

        <footer className="site-footer"><BrandLogo /><span>中圆量化收益分析仪表板</span><span>数据由公开协作成员共同维护</span><span>© 2026</span></footer>
      </div>

      {isModalOpen && <div className="modal-backdrop" role="presentation"><form className="trade-modal" onSubmit={addTrade}><div className="modal-heading"><div><p className="eyebrow">New trade</p><h2>新增交易</h2></div><button type="button" onClick={() => setIsModalOpen(false)}>×</button></div><div className="form-grid"><label>股票代码<input name="symbol" required maxLength={32} placeholder="600519.SH" /></label><label>股票名称<input name="stockName" required maxLength={80} placeholder="贵州茅台" /></label><label>买入价<input name="buyPrice" required type="number" min="0.01" step="0.01" placeholder="0.00" /></label><label>卖出价（可留空）<input name="sellPrice" type="number" min="0.01" step="0.01" placeholder="-----" /></label><label>买入时间<input name="buyDate" required type="datetime-local" defaultValue={`${settings.startDate}T00:00`} /></label><label>卖出时间（可留空）<input name="sellDate" type="datetime-local" /></label></div><button className="modal-save" disabled={createTrade.isPending} type="submit">{createTrade.isPending ? "保存中…" : "保存交易"}<ArrowUpRight /></button></form></div>}

      <Dialog open={isImportOpen} onOpenChange={open => { setIsImportOpen(open); if (!open) resetImport(); }}>
        <DialogContent className="import-dialog" showCloseButton={false}>
          <DialogHeader><p className="eyebrow">Bulk import</p><DialogTitle>批量导入交易明细</DialogTitle><DialogDescription>支持 CSV 与 XLSX 文件；股票代码、名称、买入价和买入时间为必填，时间格式为 YYYY-MM-DD HH:mm；卖出字段可留空。</DialogDescription></DialogHeader>
          <div className="import-helper"><div><FileSpreadsheet /><span>下载标准模板后，填入最多 500 条交易。</span></div><button type="button" onClick={downloadImportTemplate}><Download />下载模板</button></div>
          <label className="import-dropzone"><input ref={importInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleImportFile} /><FileUp /><strong>选择 CSV 或 Excel 文件</strong><span>文件仅在浏览器中解析并发送交易数据</span></label>
          {importFileName && <div className={`import-summary ${importIssues.length > 0 ? "has-errors" : ""}`}>{importIssues.length === 0 ? <CheckCircle2 /> : <span>!</span>}<div><strong>{importFileName}</strong><small>{importIssues.length === 0 ? `已识别 ${importRows.length} 条交易，导入时将自动跳过重复记录。` : `发现 ${importIssues.length} 处问题，请修正后重新选择文件。`}</small></div></div>}
          {importIssues.length > 0 && <div className="import-issues">{importIssues.slice(0, 5).map(issue => <p key={`${issue.row}-${issue.message}`}>第 {issue.row} 行：{issue.message}</p>)}{importIssues.length > 5 && <p>另有 {importIssues.length - 5} 项问题未展开。</p>}</div>}
          <DialogFooter className="import-dialog-actions"><DialogClose asChild><button type="button" className="import-cancel">取消</button></DialogClose><button type="button" className="import-confirm" disabled={importRows.length === 0 || importIssues.length > 0 || bulkImportTrades.isPending} onClick={submitBulkImport}>{bulkImportTrades.isPending ? <Loader2 className="spin" /> : <FileUp />}{bulkImportTrades.isPending ? "正在导入" : `导入 ${importRows.length} 条交易`}</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="report-dialog">
          <DialogHeader><p className="eyebrow">Strategy report</p><DialogTitle>导出今日策略战报</DialogTitle><DialogDescription>{selectedReportTradeIds.length > 0 ? `将优先使用交易明细中已勾选的 ${selectedReportTradeIds.length} 条记录。` : "选择买入日期，系统将展示该日新增的前 4 支标的。"}</DialogDescription></DialogHeader>
          <label className="report-date-field">买入日期<input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} /></label><div className="report-date-shortcuts"><span>快捷日期</span><div>{reportShortcutDates.map(date => <button type="button" className={date === reportDate ? "active" : ""} key={date} onClick={() => setReportDate(date)}>{date === today ? "今天" : date === yesterday ? "昨天" : date.slice(5).replace("-", "/")}</button>)}</div></div>
          <DialogFooter><button type="button" className="import-cancel" onClick={() => setIsReportOpen(false)}>取消</button><button type="button" className="report-confirm" onClick={exportBuyReport}><Download />导出战报</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExportOptionsOpen} onOpenChange={(open) => { setIsExportOptionsOpen(open); if (!open) setPendingExport(null); }}>
        <DialogContent className="report-dialog export-options-dialog"><DialogHeader><p className="eyebrow">Export settings</p><DialogTitle>{pendingExport === "strategy" ? "策略汇总海报" : "导出营销图"}</DialogTitle><DialogDescription>设置导出图片中交易明细的展示数量。</DialogDescription></DialogHeader><label className="report-date-field">明细数量<input aria-label="弹窗导出明细数量" value={exportCount} onChange={event => setExportCount(event.target.value)} placeholder="例如 5 或 全部" /></label><div className="export-count-shortcuts"><button type="button" className={exportCount === "5" ? "active" : ""} onClick={() => setExportCount("5")}>5 条</button><button type="button" className={exportCount === "10" ? "active" : ""} onClick={() => setExportCount("10")}>10 条</button><button type="button" className={exportCount === "全部" ? "active" : ""} onClick={() => setExportCount("全部")}>全部</button></div><DialogFooter><button type="button" className="import-cancel" onClick={() => setIsExportOptionsOpen(false)}>取消</button><button type="button" className="report-confirm" onClick={confirmPosterExport}><Download />确认导出</button></DialogFooter></DialogContent>
      </Dialog>

      <div className="marketing-export-host"><div ref={exportRef}><MarketingExport settings={settings} trades={trades} detailTrades={exportTrades} /><StrategyPoster settings={settings} trades={trades} detailTrades={exportTrades} /><BuyReport trades={trades} reportDate={reportDate} selectedTradeIds={selectedReportTradeIds} /></div></div>
    </main>
  );
}

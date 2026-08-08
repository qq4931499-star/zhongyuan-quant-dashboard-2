import { trpc } from "@/lib/trpc";
import { calculateDashboardMetrics, calculateTrend, formatCurrency, formatPercent, getTradeReturn, type QuantTrade } from "@shared/quant";
import html2canvas from "html2canvas";
import { ArrowUpRight, CalendarDays, Download, Loader2, Plus, Trash2, TrendingUp } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

const BRAND_LOGO_URL = "/manus-storage/zhongyuan-company-logo_05345835.png";

const DEFAULT_SETTINGS = {
  title: "中圆量化 月度收益走势",
  subtitle: "（T+1操作）",
  startDate: "2026-05-01",
  endDate: "2026-05-31",
};

type Settings = typeof DEFAULT_SETTINGS;
type TradeField = "symbol" | "stockName" | "buyPrice" | "sellPrice" | "buyDate" | "sellDate";

function BrandLogo({ exportMode = false }: { exportMode?: boolean }) {
  return (
    <div className={`brand-logo ${exportMode ? "brand-logo-export" : ""}`}>
      <img data-export-logo src={BRAND_LOGO_URL} alt="中圆公司标志" />
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
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card-top"><span>{label}</span><span className="metric-marker" /></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function TrendLabel({ x, y, index, value }: { x?: number; y?: number; index?: number; value?: number }) {
  if (typeof x !== "number" || typeof y !== "number" || typeof value !== "number") return null;
  const above = (index ?? 0) % 2 === 0;
  return (
    <text x={x} y={y + (above ? -15 : 24)} textAnchor="middle" className="trend-data-label">
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
        <div className="final-return"><span>最终累计收益率</span><strong>{formatPercent(finalReturn)}</strong></div>
      </div>
      <div className="chart-wrap" style={{ height: chartHeight }}>
        {trend.length === 0 ? <div className="chart-empty"><TrendingUp /><span>暂无交易数据，新增交易后将自动生成收益趋势。</span></div> : <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 42, right: 34, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#ded8d0" strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="date" tickFormatter={value => value.slice(5).replace("-", "/")} tickLine={false} axisLine={false} tick={{ fill: "#657083", fontSize: 12, fontFamily: "DM Mono" }} />
            <YAxis tickFormatter={value => `${(value * 100).toFixed(0)}%`} width={48} tickLine={false} axisLine={false} tick={{ fill: "#657083", fontSize: 12, fontFamily: "DM Mono" }} />
            <Tooltip
              cursor={{ stroke: "#e5b172", strokeWidth: 1 }}
              formatter={(value: number) => [formatPercent(value), "累计收益率"]}
              labelFormatter={value => `卖出日期 · ${value}`}
              contentStyle={{ background: "#172036", border: "none", borderRadius: 10, color: "#fff", fontSize: 12 }}
              labelStyle={{ color: "#e5b172" }}
            />
            <Line type="monotone" dataKey="cumulativeReturn" stroke="#b61928" strokeWidth={3} dot={{ r: 4, fill: "#f7f4ef", stroke: "#b61928", strokeWidth: 2.5 }} activeDot={{ r: 6, fill: "#e5b172", stroke: "#b61928", strokeWidth: 2 }} label={<TrendLabel />} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>}
      </div>
      {!exportMode && <p className="chart-note">按卖出日期升序；累计值为各笔单笔收益率的直接加总。数据每 5 秒同步一次。</p>}
    </section>
  );
}

function MarketingExport({ settings, trades }: { settings: Settings; trades: QuantTrade[] }) {
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
      <div className="export-table-title"><span>交易明细</span><span>TOP {Math.min(5, trades.length)} / {trades.length}</span></div>
      <table className="export-trade-table">
        <thead><tr><th>#</th><th>股票</th><th>买入</th><th>卖出</th><th>卖出日</th><th>收益率</th></tr></thead>
        <tbody>{trades.slice(0, 5).map((trade, index) => <tr key={trade.id}><td>{String(index + 1).padStart(2, "0")}</td><td><b>{trade.symbol}</b><span>{trade.stockName}</span></td><td>{trade.buyPrice.toFixed(2)}</td><td>{trade.sellPrice.toFixed(2)}</td><td>{trade.sellDate.slice(5)}</td><td className={getTradeReturn(trade) >= 0 ? "positive" : "negative"}>{formatPercent(getTradeReturn(trade))}</td></tr>)}</tbody>
      </table>
      <footer className="export-footer"><span>中圆量化 · 数据维护于云端</span><strong>FINAL {formatPercent(metrics.finalCumulativeReturn)}</strong></footer>
    </section>
  );
}

export default function Home() {
  const utils = trpc.useUtils();
  const { data: snapshot, isLoading, isError } = trpc.dashboard.snapshot.useQuery(undefined, { refetchInterval: 5000, refetchOnWindowFocus: true });
  const settings = snapshot?.settings ?? DEFAULT_SETTINGS;
  const trades = (snapshot?.trades ?? []) as QuantTrade[];
  const metrics = useMemo(() => calculateDashboardMetrics(trades), [trades]);
  const [titleDraft, setTitleDraft] = useState(settings.title);
  const [subtitleDraft, setSubtitleDraft] = useState(settings.subtitle);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTitleDraft(settings.title); setSubtitleDraft(settings.subtitle); }, [settings.title, settings.subtitle]);

  const refresh = () => utils.dashboard.snapshot.invalidate();
  const updateSettings = trpc.dashboard.updateSettings.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const updateTrade = trpc.dashboard.updateTrade.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const deleteTrade = trpc.dashboard.deleteTrade.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const createTrade = trpc.dashboard.createTrade.useMutation({ onSuccess: () => { refresh(); setIsModalOpen(false); toast.success("交易已保存"); }, onError: error => toast.error(error.message) });

  const persistSetting = (field: keyof Settings, value: string) => {
    if (value.trim() && value !== settings[field]) updateSettings.mutate({ [field]: value.trim() });
  };
  const persistTrade = (trade: QuantTrade, field: TradeField, rawValue: string) => {
    const value = field === "buyPrice" || field === "sellPrice" ? Number(rawValue) : rawValue.trim();
    if ((typeof value === "number" && (!Number.isFinite(value) || value <= 0)) || (typeof value === "string" && !value)) {
      toast.error("请填写有效的交易信息");
      return;
    }
    if (value !== trade[field]) updateTrade.mutate({ id: trade.id, values: { [field]: value } });
  };

  const addTrade = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createTrade.mutate({
      symbol: String(form.get("symbol") ?? ""), stockName: String(form.get("stockName") ?? ""),
      buyPrice: Number(form.get("buyPrice")), sellPrice: Number(form.get("sellPrice")),
      buyDate: String(form.get("buyDate") ?? ""), sellDate: String(form.get("sellDate") ?? ""),
    });
  };

  const exportMarketingImage = async () => {
    const sourceStage = exportRef.current?.querySelector<HTMLElement>("#marketing-export");
    if (!sourceStage) {
      toast.error("营销图画布尚未准备完成");
      return;
    }
    setIsExporting(true);
    const captureHost = document.createElement("div");
    try {
      const logoDataUrl = await loadImageAsDataUrl(BRAND_LOGO_URL);
      const captureStage = sourceStage.cloneNode(true) as HTMLElement;
      captureStage.id = "marketing-export-capture";
      captureStage.classList.add("marketing-export-capture");
      captureStage.querySelectorAll<HTMLImageElement>("[data-export-logo]").forEach(image => { image.src = logoDataUrl; });
      Object.assign(captureHost.style, { position: "fixed", left: "-2000px", top: "0", width: "1080px", pointerEvents: "none", overflow: "hidden" });
      captureHost.appendChild(captureStage);
      document.body.appendChild(captureHost);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await document.fonts?.ready;
      const captureHeight = Math.ceil(captureStage.scrollHeight);
      if (captureHeight < 500) throw new Error("营销图内容高度异常");
      const canvas = await html2canvas(captureStage, {
        backgroundColor: "#f7f4ef", useCORS: true, allowTaint: false, scale: 1, imageTimeout: 15000, width: 1080, height: captureHeight, windowWidth: 1080, windowHeight: captureHeight,
        onclone: clonedDocument => {
          const clonedStage = clonedDocument.querySelector<HTMLElement>("#marketing-export-capture");
          if (clonedStage) Object.assign(clonedStage.style, { position: "fixed", left: "0", top: "0", visibility: "visible", display: "block", margin: "0" });
          clonedDocument.querySelectorAll<HTMLImageElement>("[data-export-logo]").forEach(image => { image.src = logoDataUrl; });
        },
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("图片生成失败");
      if (blob.size < 10_000) throw new Error("生成的图片数据异常，请重试");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${settings.title.replace(/[\\/:*?"<>|]/g, "-")}-营销图.png`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("营销图已下载", { description: `1080 × ${captureHeight} PNG 已生成。` });
    } catch (error) {
      toast.error("导出失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    } finally { captureHost.remove(); setIsExporting(false); }
  };

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
            <label className="date-input"><CalendarDays /><span>统计区间</span><input aria-label="统计起始日期" type="date" value={settings.startDate} onChange={event => persistSetting("startDate", event.target.value)} /><em>至</em><input aria-label="统计截止日期" type="date" value={settings.endDate} onChange={event => persistSetting("endDate", event.target.value)} /></label>
            <button className="export-button" onClick={exportMarketingImage} disabled={isExporting}>{isExporting ? <Loader2 className="spin" /> : <Download />}{isExporting ? "生成中" : "导出营销图"}</button>
          </div>
        </header>

        <section className="metrics-section" aria-label="核心指标">
          <div className="section-kicker"><span>01</span><p>月度关键指标 <small>实时由交易明细计算</small></p></div>
          <div className="metrics-grid">
            <MetricCard label="总交易次数" value={`${metrics.totalTrades} 笔`} detail="当期完成交易" />
            <MetricCard label="总盈亏金额" value={formatCurrency(metrics.totalProfit)} detail="卖出价 − 买入价累计" tone="red" />
            <MetricCard label="平均单笔收益率" value={formatPercent(metrics.averageReturn)} detail="各笔收益率算术平均" tone="gold" />
            <MetricCard label="最大单笔收益率" value={formatPercent(metrics.maximumReturn)} detail="当前记录最高值" />
          </div>
        </section>

        <TrendChart trades={trades} />

        <section className="trade-section">
          <div className="section-heading table-heading">
            <div><p className="eyebrow">Trading ledger</p><h2>交易明细</h2></div>
            <button className="add-trade-button" onClick={() => setIsModalOpen(true)}><Plus />新增交易</button>
          </div>
          <div className="table-scroll">
            <table className="trade-table">
              <thead><tr><th>序号</th><th>股票代码</th><th>股票名称</th><th>买入价</th><th>卖出价</th><th>买入日期</th><th>卖出日期</th><th>单笔收益率</th><th aria-label="操作" /></tr></thead>
              <tbody>
                {trades.length === 0 ? <tr><td colSpan={9}><div className="table-empty"><TrendingUp /><span>暂无交易记录</span><button onClick={() => setIsModalOpen(true)}>新增第一笔交易</button></div></td></tr> : trades.map((trade, index) => <tr key={trade.id}>
                  <td><span className="row-number">{String(index + 1).padStart(2, "0")}</span></td>
                  <td><input aria-label={`${trade.symbol} 股票代码`} className="cell-input symbol-input" defaultValue={trade.symbol} maxLength={32} onBlur={event => persistTrade(trade, "symbol", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 股票名称`} className="cell-input" defaultValue={trade.stockName} maxLength={80} onBlur={event => persistTrade(trade, "stockName", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 买入价`} className="cell-input price-input" type="number" min="0.01" step="0.01" defaultValue={trade.buyPrice} onBlur={event => persistTrade(trade, "buyPrice", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 卖出价`} className="cell-input price-input" type="number" min="0.01" step="0.01" defaultValue={trade.sellPrice} onBlur={event => persistTrade(trade, "sellPrice", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 买入日期`} className="cell-input date-cell-input" type="date" defaultValue={trade.buyDate} onBlur={event => persistTrade(trade, "buyDate", event.target.value)} /></td>
                  <td><input aria-label={`${trade.symbol} 卖出日期`} className="cell-input date-cell-input" type="date" defaultValue={trade.sellDate} onBlur={event => persistTrade(trade, "sellDate", event.target.value)} /></td>
                  <td><span className={`return-tag ${getTradeReturn(trade) >= 0 ? "positive" : "negative"}`}>{formatPercent(getTradeReturn(trade))}</span></td>
                  <td><button aria-label={`删除 ${trade.symbol} 交易`} className="delete-button" onClick={() => deleteTrade.mutate({ id: trade.id })}><Trash2 /></button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="table-footer"><span>共 <b>{trades.length}</b> 条交易记录</span><span>单笔收益率 = （卖出价 − 买入价）÷ 买入价</span></div>
        </section>

        <footer className="site-footer"><BrandLogo /><span>中圆量化收益分析仪表板</span><span>数据由公开协作成员共同维护</span><span>© 2026</span></footer>
      </div>

      {isModalOpen && <div className="modal-backdrop" role="presentation"><form className="trade-modal" onSubmit={addTrade}><div className="modal-heading"><div><p className="eyebrow">New trade</p><h2>新增交易</h2></div><button type="button" onClick={() => setIsModalOpen(false)}>×</button></div><div className="form-grid"><label>股票代码<input name="symbol" required maxLength={32} placeholder="600519.SH" /></label><label>股票名称<input name="stockName" required maxLength={80} placeholder="贵州茅台" /></label><label>买入价<input name="buyPrice" required type="number" min="0.01" step="0.01" placeholder="0.00" /></label><label>卖出价<input name="sellPrice" required type="number" min="0.01" step="0.01" placeholder="0.00" /></label><label>买入日期<input name="buyDate" required type="date" defaultValue={settings.startDate} /></label><label>卖出日期<input name="sellDate" required type="date" defaultValue={settings.endDate} /></label></div><button className="modal-save" disabled={createTrade.isPending} type="submit">{createTrade.isPending ? "保存中…" : "保存交易"}<ArrowUpRight /></button></form></div>}

      <div className="marketing-export-host"><div ref={exportRef}><MarketingExport settings={settings} trades={trades} /></div></div>
    </main>
  );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CNY_USD } from "@easyclaw/core";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  fetchKeyUsage, fetchActiveKeyUsage, fetchKeyUsageTimeseries, fetchPricing,
  type KeyModelUsageSummary, type ActiveKeyInfo, type KeyUsageDailyBucket,
  type ProviderPricing,
} from "../api.js";

type TimeRange = "7d" | "30d" | "all";

const CHART_COLORS = [
  "#6c63ff",
  "#00d4ff",
  "#ff6b6b",
  "#ffc078",
  "#63e6be",
  "#cc5de8",
  "#ff922b",
  "#20c997",
];

function formatCost(amount: number, nativeCurrency: string, isCN: boolean): string {
  if (isCN) {
    const cny = nativeCurrency === "CNY" ? amount : amount * CNY_USD;
    return "\u00a5" + cny.toFixed(4);
  }
  const usd = nativeCurrency === "USD" ? amount : amount / CNY_USD;
  return "$" + usd.toFixed(4);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

type PricingEntry = { inputPerM: number; outputPerM: number; currency: string };
type PricingMap = Map<string, PricingEntry>; // key: "provider/modelId"

function buildPricingMap(list: ProviderPricing[]): PricingMap {
  const map: PricingMap = new Map();
  for (const pp of list) {
    for (const m of pp.models) {
      map.set(`${pp.provider}/${m.modelId}`, {
        inputPerM: parseFloat(m.inputPricePerMillion) || 0,
        outputPerM: parseFloat(m.outputPricePerMillion) || 0,
        currency: pp.currency,
      });
    }
  }
  return map;
}

function computeCost(
  inputTokens: number,
  outputTokens: number,
  provider: string,
  model: string,
  pricingMap: PricingMap,
): { amount: number; currency: string } {
  const entry = pricingMap.get(`${provider}/${model}`);
  if (!entry) {
    return { amount: 0, currency: "USD" };
  }
  return {
    amount: (inputTokens * entry.inputPerM + outputTokens * entry.outputPerM) / 1_000_000,
    currency: entry.currency,
  };
}

interface CostInfo {
  amount: number;
  currency: string;
}

interface ModelRow {
  row: KeyModelUsageSummary;
  isActive: boolean;
  cost: CostInfo;
}

interface KeyGroup {
  keyId: string;
  keyLabel: string;
  authType: "api_key" | "oauth";
  models: ModelRow[];
  totalCost: number;
  currency: string;
}

interface ProviderGroup {
  provider: string;
  keys: KeyGroup[];
  totalCost: number;
  currency: string;
}

function toUsd(amount: number, currency: string): number {
  return currency === "USD" ? amount : amount / CNY_USD;
}

function buildGroups(
  allRows: KeyModelUsageSummary[],
  activeKey: ActiveKeyInfo | null,
  pricingMap: PricingMap,
): ProviderGroup[] {
  const providerMap = new Map<string, Map<string, ModelRow[]>>();

  for (const row of allRows) {
    if (!providerMap.has(row.provider)) {
      providerMap.set(row.provider, new Map());
    }
    const keyMap = providerMap.get(row.provider)!;
    if (!keyMap.has(row.keyId)) {
      keyMap.set(row.keyId, []);
    }
    const isActive = activeKey !== null
      && row.keyId === activeKey.keyId
      && row.model === activeKey.model;
    const cost = computeCost(row.inputTokens, row.outputTokens, row.provider, row.model, pricingMap);
    keyMap.get(row.keyId)!.push({ row, isActive, cost });
  }

  const result: ProviderGroup[] = [];
  for (const [provider, keyMap] of providerMap) {
    const keys: KeyGroup[] = [];
    for (const [keyId, models] of keyMap) {
      const first = models[0];
      const totalCost = models.reduce((s, m) => s + m.cost.amount, 0);
      keys.push({
        keyId,
        keyLabel: first.row.keyLabel,
        authType: first.row.authType,
        models,
        totalCost,
        currency: first.cost.currency,
      });
    }
    keys.sort((a, b) => toUsd(b.totalCost, b.currency) - toUsd(a.totalCost, a.currency));
    const totalCost = keys.reduce((s, k) => s + k.totalCost, 0);
    const currency = keys[0]?.currency ?? "USD";
    result.push({ provider, keys, totalCost, currency });
  }
  result.sort((a, b) => toUsd(b.totalCost, b.currency) - toUsd(a.totalCost, a.currency));
  return result;
}

function ensureActiveKey(
  rows: KeyModelUsageSummary[],
  activeKey: ActiveKeyInfo | null,
): KeyModelUsageSummary[] {
  const allRows = [...rows];
  if (activeKey) {
    const found = allRows.some(
      (r) => r.keyId === activeKey.keyId && r.model === activeKey.model,
    );
    if (!found) {
      allRows.push({
        keyId: activeKey.keyId,
        keyLabel: activeKey.keyLabel,
        provider: activeKey.provider,
        model: activeKey.model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalCostUsd: "0",
        authType: activeKey.authType,
      });
    }
  }
  return allRows;
}

function UsageTable({
  grouped, isCN, t,
}: {
  grouped: ProviderGroup[];
  isCN: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="usage-blocks">
      {grouped.flatMap((pg) =>
        pg.keys.map((kg) => (
          <div key={kg.keyId} className="usage-key-block">
            <div className="usage-key-header">
              <span className="usage-key-provider">{pg.provider}</span>
              <span className="usage-key-label">{kg.keyLabel}</span>
              {kg.authType !== "oauth" && (
                <span className="usage-key-cost">
                  {formatCost(kg.totalCost, kg.currency, isCN)}
                </span>
              )}
            </div>
            <table className="usage-inner-table">
              <thead>
                <tr>
                  <th>{t("keyUsage.model")}</th>
                  <th>{t("keyUsage.inputTokens")}</th>
                  <th>{t("keyUsage.outputTokens")}</th>
                  <th>{t("keyUsage.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {kg.models.map((mr) => (
                  <tr key={mr.row.model} className="table-hover-row">
                    <td className="usage-model-name">
                      {mr.row.model}
                      {mr.isActive && (
                        <>
                          {" "}
                          <span className="badge badge-active">{t("keyUsage.active")}</span>
                        </>
                      )}
                    </td>
                    <td className="usage-token-cell">{formatTokens(mr.row.inputTokens)}</td>
                    <td className="usage-token-cell">{formatTokens(mr.row.outputTokens)}</td>
                    <td className="usage-token-cell">
                      {kg.authType === "oauth"
                        ? "-"
                        : formatCost(mr.cost.amount, mr.cost.currency, isCN)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )),
      )}
    </div>
  );
}

export function KeyUsagePage() {
  const { t, i18n } = useTranslation();
  const isCN = i18n.language === "zh";
  const [rows, setRows] = useState<KeyModelUsageSummary[]>([]);
  const [todayRows, setTodayRows] = useState<KeyModelUsageSummary[]>([]);
  const [timeseries, setTimeseries] = useState<KeyUsageDailyBucket[]>([]);
  const [activeKey, setActiveKey] = useState<ActiveKeyInfo | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<{ key: string; detail?: string } | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [pricingMap, setPricingMap] = useState<PricingMap>(new Map());

  /** Build time-range filter from current timeRange state. */
  const buildFilter = useCallback(() => {
    const filter: { windowStart?: number; windowEnd?: number } = {};
    const now = Date.now();
    if (timeRange === "7d") {
      filter.windowStart = now - 7 * 24 * 60 * 60 * 1000;
      filter.windowEnd = now;
    } else if (timeRange === "30d") {
      filter.windowStart = now - 30 * 24 * 60 * 60 * 1000;
      filter.windowEnd = now;
    }
    return filter;
  }, [timeRange]);

  /** Fetch today's usage + active key (independent of time range). */
  const loadTodayAndActive = useCallback(async () => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [activeData, todayData] = await Promise.all([
      fetchActiveKeyUsage(),
      fetchKeyUsage({ windowStart: todayStart.getTime(), windowEnd: now }).catch(() => [] as KeyModelUsageSummary[]),
    ]);

    setActiveKey(activeData);
    setTodayRows(todayData);
  }, []);

  /** Fetch historical table + chart (depends on time range). */
  const loadHistorical = useCallback(async () => {
    const filter = buildFilter();

    const [usageData, tsData] = await Promise.all([
      fetchKeyUsage(filter),
      fetchKeyUsageTimeseries(filter).catch(() => [] as KeyUsageDailyBucket[]),
    ]);

    setRows(usageData);
    setTimeseries(tsData);
  }, [buildFilter]);

  /** Full load — initial page load and manual refresh. */
  const loadAll = useCallback(async () => {
    setInitialLoading(true);
    setError(null);
    try {
      await Promise.all([loadTodayAndActive(), loadHistorical()]);
      setLastRefresh(new Date());
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("501")) {
        setRows([]);
        setActiveKey(null);
        setTodayRows([]);
        setTimeseries([]);
        setLastRefresh(new Date());
      } else {
        setError({ key: "keyUsage.failedToLoad", detail: errMsg });
      }
    } finally {
      setInitialLoading(false);
    }
  }, [loadTodayAndActive, loadHistorical]);

  // Fetch pricing data once on mount
  useEffect(() => {
    (async () => {
      try {
        const statusRes = await fetch("http://127.0.0.1:3210/api/status");
        const status = await statusRes.json();
        const deviceId = status.deviceId || "unknown";
        const lang = navigator.language?.slice(0, 2) || "en";
        const platform = navigator.userAgent.includes("Mac") ? "darwin"
          : navigator.userAgent.includes("Win") ? "win32" : "linux";
        const data = await fetchPricing(deviceId, platform, "0.8.0", lang);
        if (data) setPricingMap(buildPricingMap(data));
      } catch { /* graceful degradation — use empty map */ }
    })();
  }, []);

  // Initial load
  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When time range changes, only reload historical data (not today/active)
  const [isFirstRender, setIsFirstRender] = useState(true);
  useEffect(() => {
    if (isFirstRender) {
      setIsFirstRender(false);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    loadHistorical()
      .then(() => { if (!cancelled) setLastRefresh(new Date()); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadAll();
    }, 60_000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Group rows for historical table (with active key injected)
  const grouped = useMemo(
    () => buildGroups(ensureActiveKey(rows, activeKey), activeKey, pricingMap),
    [rows, activeKey, pricingMap],
  );

  // Group rows for today's table (with active key injected)
  const todayGrouped = useMemo(
    () => buildGroups(ensureActiveKey(todayRows, activeKey), activeKey, pricingMap),
    [todayRows, activeKey, pricingMap],
  );

  // Transform timeseries data for Recharts (fill missing dates with zeros)
  const { chartData, seriesKeys } = useMemo(() => {
    if (timeseries.length === 0) return { chartData: [], seriesKeys: [] };

    const seriesSet = new Set<string>();
    const dateMap = new Map<string, Record<string, number>>();

    for (const bucket of timeseries) {
      const key = `${bucket.keyLabel} / ${bucket.model}`;
      seriesSet.add(key);

      if (!dateMap.has(bucket.date)) {
        dateMap.set(bucket.date, {});
      }
      const entry = dateMap.get(bucket.date)!;
      entry[key] = (entry[key] ?? 0) + bucket.inputTokens + bucket.outputTokens;
    }

    const keys = Array.from(seriesSet);

    // Determine date range from timeRange selection
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate: Date;
    if (timeRange === "7d") {
      startDate = new Date(today.getTime() - 6 * 86_400_000);
    } else if (timeRange === "30d") {
      startDate = new Date(today.getTime() - 29 * 86_400_000);
    } else {
      // "all": span from earliest data point to today
      const allDates = Array.from(dateMap.keys()).sort();
      startDate = allDates.length > 0 ? new Date(allDates[0] + "T00:00:00") : today;
    }

    // Fill in every date in the range
    const allData: Record<string, unknown>[] = [];
    const cursor = new Date(startDate);
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const existing = dateMap.get(dateStr) ?? {};
      allData.push({ date: dateStr, ...existing });
      cursor.setDate(cursor.getDate() + 1);
    }

    return { chartData: allData, seriesKeys: keys };
  }, [timeseries, timeRange]);

  /** Solo mode: click shows only that series; click again restores all. */
  function handleLegendClick(dataKey: string) {
    setHiddenSeries((prev) => {
      const allOthersHidden = seriesKeys.every(
        (k) => k === dataKey || prev.has(k),
      );
      if (allOthersHidden) {
        return new Set();
      }
      const next = new Set(seriesKeys.filter((k) => k !== dataKey));
      return next;
    });
  }

  const rangeLabels: Record<TimeRange, string> = {
    "7d": t("keyUsage.timeRange7d"),
    "30d": t("keyUsage.timeRange30d"),
    all: t("keyUsage.timeRangeAll"),
  };

  const loading = initialLoading;
  const hasData = rows.length > 0 || activeKey;
  const hasTodayData = todayRows.length > 0 || activeKey;

  return (
    <div>
      <div className="page-header">
        <h1>{t("keyUsage.title")}</h1>
        <div className="page-header-actions">
          <button
            className="btn btn-secondary"
            onClick={loadAll}
            disabled={loading}
          >
            {t("keyUsage.refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-alert">{t(error.key)}{error.detail ?? ""}</div>
      )}

      {loading && <p className="text-muted">{t("keyUsage.loadingData")}</p>}

      {/* Today's Usage Table */}
      {!loading && !error && hasTodayData && (
        <div className="section-card">
          <h3 className="usage-section-title">{t("keyUsage.todayTitle")}</h3>
          <UsageTable grouped={todayGrouped} isCN={isCN} t={t} />
        </div>
      )}

      {/* Time range selector — controls historical table + chart */}
      {!loading && !error && (
        <div className="usage-time-range-bar">
          {(["7d", "30d", "all"] as TimeRange[]).map((range) => (
            <button
              key={range}
              className={timeRange === range ? "btn btn-outline" : "btn btn-secondary"}
              onClick={() => setTimeRange(range)}
              disabled={historyLoading}
            >
              {rangeLabels[range]}
            </button>
          ))}
        </div>
      )}

      {/* Historical Usage Table */}
      {!loading && !error && hasData && (
        <div className="section-card">
          <h3 className="usage-section-title">{t("keyUsage.historyTitle")}</h3>
          <UsageTable grouped={grouped} isCN={isCN} t={t} />
        </div>
      )}

      {/* Historical Usage Line Chart */}
      {!loading && !error && chartData.length > 0 && (
        <div className="section-card">
          <h3 className="usage-section-title">{t("keyUsage.historyChart")}</h3>
          <div className="usage-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#999" fontSize={12} />
                <YAxis stroke="#999" fontSize={12} tickFormatter={formatTokens} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-bg-alt)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    color: "var(--color-text)",
                  }}
                  formatter={(value: unknown) => [formatTokens(Number(value)), t("keyUsage.tokens")]}
                  labelFormatter={(label: unknown) => `${t("keyUsage.date")}: ${label}`}
                />
                <Legend
                  onClick={(e) => handleLegendClick(e.dataKey as string)}
                  wrapperStyle={{ cursor: "pointer" }}
                />
                {seriesKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    hide={hiddenSeries.has(key)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!loading && !error && !hasData && !hasTodayData && (
        <div className="empty-state">
          <p>{t("keyUsage.noData")}</p>
        </div>
      )}

      <p className="td-meta">
        {t("keyUsage.lastUpdated")}: {lastRefresh.toLocaleTimeString()}
      </p>
    </div>
  );
}

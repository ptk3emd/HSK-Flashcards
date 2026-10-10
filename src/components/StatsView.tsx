import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card, FSRSOptions, DeckConfig, ReviewLog } from '../types/card';
import { loadReviewLogs } from '../lib/storage';
import { calculateRetrievability } from '../lib/fsrs';
import { LEVEL_NUMERALS } from '../data/defaultDecks';
import { RetentionCalibration } from './RetentionCalibration';
import { ChevronDown } from 'lucide-react';

interface StatsViewProps {
  cards: Card[];
  fsrsOptions?: FSRSOptions;
  deckConfig?: DeckConfig;
}

type TimeRange = 'all' | '30d' | '7d' | 'today';

export const StatsView: React.FC<StatsViewProps> = ({
  cards,
  fsrsOptions,
  deckConfig,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [retentionTab, setRetentionTab] = useState<'curve' | 'history' | 'buttons' | 'calibration'>('curve');
  const [hoveredPoint, setHoveredPoint] = useState<{ day: number; retention: number } | null>(null);

  const targetRetention = fsrsOptions?.request_retention ?? 0.90;

  // Load review logs from persistent storage
  const allLogs: ReviewLog[] = useMemo(() => {
    try {
      return loadReviewLogs();
    } catch {
      return [];
    }
  }, []);

  // Filter logs by selected time range
  const filteredLogs = useMemo(() => {
    if (timeRange === 'all') return allLogs;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const cutoff =
      timeRange === 'today'
        ? new Date().setHours(0, 0, 0, 0)
        : timeRange === '7d'
        ? now - 7 * dayMs
        : now - 30 * dayMs;

    return allLogs.filter(log => new Date(log.reviewTime).getTime() >= cutoff);
  }, [allLogs, timeRange]);

  // Overall Deck Card Status Breakdown
  const totalCards = cards.length;
  const newCount = cards.filter(c => c.state === 0).length;
  const learningCount = cards.filter(c => c.state === 1 || c.state === 3).length;
  // Mature: scheduled_days >= 21; Young: scheduled_days < 21
  const youngCount = cards.filter(c => c.state === 2 && c.scheduled_days < 21).length;
  const matureCount = cards.filter(c => c.state === 2 && c.scheduled_days >= 21).length;
  const studiedCards = cards.filter(c => c.reps > 0);
  const totalStudied = studiedCards.length;

  const matureRate = totalStudied > 0 ? Math.round((matureCount / totalStudied) * 100) : 0;

  // Stability & Difficulty Metrics
  const avgStabilityNum = studiedCards.length > 0
    ? studiedCards.reduce((acc, c) => acc + (c.stability || 0), 0) / studiedCards.length
    : 0;
  const avgStability = avgStabilityNum > 0 ? avgStabilityNum.toFixed(1) : '0';

  const maxStability = studiedCards.length > 0
    ? Math.max(...studiedCards.map(c => c.stability || 0)).toFixed(1)
    : '0';

  const avgDifficulty = studiedCards.length > 0
    ? (studiedCards.reduce((acc, c) => acc + (c.difficulty || 0), 0) / studiedCards.length).toFixed(1)
    : '0';

  // Review Logs & True Retention Rates
  const totalReviews = filteredLogs.length;
  const buttonCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    filteredLogs.forEach(l => {
      if (counts[l.rating as 1 | 2 | 3 | 4] !== undefined) {
        counts[l.rating as 1 | 2 | 3 | 4]++;
      }
    });
    return counts;
  }, [filteredLogs]);

  // Positive reviews: Good (3) and Easy (4)
  const positiveReviews = buttonCounts[3] + buttonCounts[4];
  const trueRetentionRate = totalReviews > 0
    ? Math.round((positiveReviews / totalReviews) * 100)
    : Math.round(targetRetention * 100);

  // Mature vs Young true retention
  const matureLogs = filteredLogs.filter(l => (l.previousCardSnapshot?.scheduled_days ?? 0) >= 21);
  const matureRetention = matureLogs.length > 0
    ? Math.round((matureLogs.filter(l => l.rating >= 3).length / matureLogs.length) * 100)
    : null;

  const youngLogs = filteredLogs.filter(
    l => l.state === 2 && (l.previousCardSnapshot?.scheduled_days ?? 0) < 21
  );
  const youngRetention = youngLogs.length > 0
    ? Math.round((youngLogs.filter(l => l.rating >= 3).length / youngLogs.length) * 100)
    : null;

  // Study Streaks & Days Active Calculation
  const { currentStreak, maxStreak, daysStudiedCount } = useMemo(() => {
    if (allLogs.length === 0) {
      return { currentStreak: 0, maxStreak: 0, daysStudiedCount: 0 };
    }

    // Set of distinct YYYY-MM-DD studied
    const datesSet = new Set(
      allLogs.map(l => new Date(l.reviewTime).toISOString().slice(0, 10))
    );
    const sortedDates = Array.from(datesSet).sort();
    const daysStudiedCount = sortedDates.length;

    // Check consecutive streaks
    let maxS = 0;
    let currS = 0;
    let prevTime: number | null = null;
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (const dateStr of sortedDates) {
      const dt = new Date(dateStr).getTime();
      if (prevTime === null) {
        currS = 1;
      } else {
        const diff = Math.round((dt - prevTime) / oneDayMs);
        if (diff === 1) {
          currS++;
        } else {
          currS = 1;
        }
      }
      if (currS > maxS) maxS = currS;
      prevTime = dt;
    }

    // Current streak: does today or yesterday count?
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - oneDayMs).toISOString().slice(0, 10);
    let activeStreak = 0;
    if (datesSet.has(todayStr) || datesSet.has(yesterdayStr)) {
      let checkDate = datesSet.has(todayStr) ? new Date() : new Date(Date.now() - oneDayMs);
      while (datesSet.has(checkDate.toISOString().slice(0, 10))) {
        activeStreak++;
        checkDate = new Date(checkDate.getTime() - oneDayMs);
      }
    }

    return {
      currentStreak: activeStreak,
      maxStreak: Math.max(maxS, activeStreak),
      daysStudiedCount,
    };
  }, [allLogs]);

  // Future Due Forecast (Next 30+ days)
  const forecast = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    let dueToday = 0;
    let dueTomorrow = 0;
    let due2to3 = 0;
    let due4to7 = 0;
    let due8to14 = 0;
    let due15to30 = 0;
    let due30plus = 0;

    cards.forEach(c => {
      if (c.state === 0 || c.suspended) return; // Unstarted and suspended cards
      const dueTime = new Date(c.due).getTime();
      if (dueTime <= todayEnd) {
        dueToday++;
      } else {
        const daysAway = Math.ceil((dueTime - todayEnd) / oneDay);
        if (daysAway === 1) dueTomorrow++;
        else if (daysAway <= 3) due2to3++;
        else if (daysAway <= 7) due4to7++;
        else if (daysAway <= 14) due8to14++;
        else if (daysAway <= 30) due15to30++;
        else due30plus++;
      }
    });

    return [
      { label: 'Hoje', count: dueToday, highlight: dueToday > 0 },
      { label: 'Amanhã', count: dueTomorrow, highlight: false },
      { label: '2-3 d', count: due2to3, highlight: false },
      { label: '4-7 d', count: due4to7, highlight: false },
      { label: '8-14 d', count: due8to14, highlight: false },
      { label: '15-30 d', count: due15to30, highlight: false },
      { label: '30+ d', count: due30plus, highlight: false },
    ];
  }, [cards]);

  // HSK Level Mastery Breakdown
  const hskBreakdown = useMemo(() => {
    const levelsMap = new Map<string, { total: number; studied: number; mature: number }>();
    cards.forEach(c => {
      const lvl = c.level || 'Geral';
      const curr = levelsMap.get(lvl) || { total: 0, studied: 0, mature: 0 };
      curr.total++;
      if (c.reps > 0) curr.studied++;
      if (c.state === 2 && c.scheduled_days >= 21) curr.mature++;
      levelsMap.set(lvl, curr);
    });

    return Array.from(levelsMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([level, data]) => ({
        level,
        ...data,
        masteryRate: data.total > 0 ? Math.round((data.mature / data.total) * 100) : 0,
        studiedRate: data.total > 0 ? Math.round((data.studied / data.total) * 100) : 0,
      }));
  }, [cards]);

  // FSRS forgetting curve, from the same function the scheduler uses
  const curveStability = Math.max(1, avgStabilityNum || 5);
  const forgettingCurvePoints = useMemo(() => {
    const maxDay = Math.min(60, Math.max(30, Math.round(curveStability * 2.5)));
    const points: { day: number; retention: number }[] = [];

    for (let d = 0; d <= maxDay; d += Math.max(1, Math.floor(maxDay / 30))) {
      const r = calculateRetrievability(d, curveStability);
      points.push({ day: d, retention: Math.max(0, Math.min(1, r)) });
    }
    return { maxDay, points };
  }, [curveStability]);

  // SVG chart drawn at the container's real width: one unit is one pixel, so axis
  // labels keep their size on a phone instead of shrinking with the drawing
  const chartBoxRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(560);
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width > 0) setChartWidth(Math.max(280, width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [retentionTab]);
  const chartHeight = 200;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;
  const graphW = chartWidth - padLeft - padRight;
  const graphH = chartHeight - padTop - padBottom;

  // Convert (day, retention) to SVG coordinates
  const getSvgCoordinates = (day: number, ret: number) => {
    const x = padLeft + (day / forgettingCurvePoints.maxDay) * graphW;
    const y = padTop + (1 - ret) * graphH;
    return { x, y };
  };

  const curveSvgPath = useMemo(() => {
    const pts = forgettingCurvePoints.points.map(p => getSvgCoordinates(p.day, p.retention));
    if (pts.length === 0) return '';
    return pts.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');
  }, [forgettingCurvePoints, chartWidth]);

  const curveSvgArea = useMemo(() => {
    if (!curveSvgPath) return '';
    const lastPt = getSvgCoordinates(forgettingCurvePoints.maxDay, forgettingCurvePoints.points[forgettingCurvePoints.points.length - 1]?.retention ?? 0);
    const firstPt = getSvgCoordinates(0, 1);
    const bottomY = padTop + graphH;
    return `${curveSvgPath} L ${lastPt.x} ${bottomY} L ${firstPt.x} ${bottomY} Z`;
  }, [curveSvgPath, forgettingCurvePoints, chartWidth]);

  const targetLineY = padTop + (1 - targetRetention) * graphH;

  // The marked points on the curve. The whole chart picks among them: tap or drag anywhere
  // selects the nearest one, and as a slider the arrow keys step through them.
  const keyPoints = useMemo(
    () =>
      forgettingCurvePoints.points.filter(
        (_, idx) => idx % Math.max(1, Math.floor(forgettingCurvePoints.points.length / 8)) === 0
      ),
    [forgettingCurvePoints]
  );

  const pointNearest = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * chartWidth;
    let best = keyPoints[0];
    for (const p of keyPoints) {
      if (Math.abs(getSvgCoordinates(p.day, p.retention).x - x) < Math.abs(getSvgCoordinates(best.day, best.retention).x - x)) best = p;
    }
    return best;
  };

  const handleChartKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const idx = hoveredPoint ? keyPoints.findIndex((p) => p.day === hoveredPoint.day) : -1;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(keyPoints.length - 1, idx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = keyPoints.length - 1;
    else return;
    e.preventDefault();
    setHoveredPoint(keyPoints[Math.max(0, next)]);
  };

  // Daily retention trend (last 14 active days)
  const dailyHistory = useMemo(() => {
    const dayMap = new Map<string, { total: number; positive: number }>();
    allLogs.forEach(log => {
      const day = new Date(log.reviewTime).toISOString().slice(0, 10);
      const curr = dayMap.get(day) || { total: 0, positive: 0 };
      curr.total++;
      if (log.rating >= 3) curr.positive++;
      dayMap.set(day, curr);
    });

    const entries = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14);

    return entries.map(([day, data]) => ({
      day: day.slice(5), // MM-DD
      total: data.total,
      positive: data.positive,
      rate: Math.round((data.positive / data.total) * 100),
    }));
  }, [allLogs]);

  const tabButton = (active: boolean) =>
    `min-h-11 sm:min-h-9 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
      active
        ? 'bg-black/[0.07] dark:bg-white/[0.12] text-[var(--text-fg)]'
        : 'ink-secondary hover:text-[var(--text-fg)]'
    }`;
  const decimal = (value: string | number) => String(value).replace('.', ',');

  const summaryRows = [
    {
      label: 'Retenção real',
      detail: `alvo ${Math.round(targetRetention * 100)}% · ${positiveReviews} de ${totalReviews} acertos`,
      value: `${trueRetentionRate}%`,
    },
    { label: 'Estabilidade média', detail: `máx. ${decimal(maxStability)} d`, value: `${decimal(avgStability)} d` },
    { label: 'Sequência', detail: `recorde ${maxStreak} d`, value: `${currentStreak} d` },
    { label: 'Revisões', detail: `${daysStudiedCount} dias de estudo`, value: String(totalReviews) },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <h1 className="font-semibold text-2xl">Estatísticas</h1>
        <div role="group" aria-label="Período" className="sheet !rounded-xl p-1 flex gap-0.5">
          {(
            [
              { id: 'all', label: 'Tudo' },
              { id: '30d', label: '30 d' },
              { id: '7d', label: '7 d' },
              { id: 'today', label: 'Hoje' },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTimeRange(tab.id)}
              aria-pressed={timeRange === tab.id}
              className={tabButton(timeRange === tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <section aria-labelledby="stats-summary" className="sheet overflow-hidden">
        <h2 id="stats-summary" className="sr-only">Resumo</h2>
        <ul className="ledger">
          {summaryRows.map(row => (
            <li key={row.label} className="flex items-center gap-4 px-5 py-3.5">
              <span className="flex-1 min-w-0">
                <span className="block font-medium">{row.label}</span>
                <span className="block text-xs ink-tertiary tabular truncate">{row.detail}</span>
              </span>
              <span className="tabular text-2xl font-semibold">{row.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="stats-retention" className="sheet p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h2 id="stats-retention" className="text-base font-semibold">Retenção</h2>
          <div role="group" aria-label="Visualização" className="grid grid-cols-4 sm:flex gap-0.5 -mx-1 sm:mx-0">
            {(
              [
                { id: 'curve', label: 'Curva' },
                { id: 'buttons', label: 'Botões' },
                { id: 'history', label: 'Histórico' },
                { id: 'calibration', label: 'Calibração' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRetentionTab(tab.id)}
                aria-pressed={retentionTab === tab.id}
                className={`${tabButton(retentionTab === tab.id)} !px-2 sm:!px-3`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 1: FSRS Forgetting Curve */}
        {retentionTab === 'curve' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ink-secondary">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-red-500 rounded-full" aria-hidden="true" />
                R(t)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-emerald-500" aria-hidden="true" />
                alvo {Math.round(targetRetention * 100)}%
              </span>
              <span className="ml-auto tabular">S = {decimal(avgStability)} d</span>
            </div>

            {/* SVG Interactive Chart */}
            <div
              ref={chartBoxRef}
              className="relative"
            >
              <p id="retention-curve-summary" className="sr-only">
                {`Curva de retenção estimada para estabilidade de ${avgStability} dias: ${forgettingCurvePoints.points
                  .filter((_, i, arr) => i === 0 || i === arr.length - 1 || i === Math.floor(arr.length / 2))
                  .map(p => `${Math.round(p.retention * 100)}% no dia ${p.day}`)
                  .join(', ')}. Alvo de ${Math.round(targetRetention * 100)}%. Use as setas para percorrer os dias.`}
              </p>
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-auto overflow-visible cursor-crosshair rounded-lg"
                style={{ touchAction: 'pan-y' }}
                role="slider"
                tabIndex={0}
                aria-label="Curva de retenção"
                aria-describedby="retention-curve-summary"
                aria-valuemin={0}
                aria-valuemax={forgettingCurvePoints.maxDay}
                aria-valuenow={hoveredPoint?.day ?? 0}
                aria-valuetext={
                  hoveredPoint
                    ? `Dia ${hoveredPoint.day}: ${Math.round(hoveredPoint.retention * 100)}% de retenção`
                    : 'Nenhum dia selecionado'
                }
                onKeyDown={handleChartKeyDown}
                onFocus={() => setHoveredPoint((p) => p ?? keyPoints[0] ?? null)}
                onBlur={() => setHoveredPoint(null)}
                onPointerDown={(e) => setHoveredPoint(pointNearest(e))}
                onPointerMove={(e) => {
                  // Mouse: follow the cursor. Touch and pen: follow while pressed (a horizontal drag)
                  if (e.pointerType === 'mouse' || e.buttons !== 0) setHoveredPoint(pointNearest(e));
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse') setHoveredPoint(null);
                }}
              >
                {/* Horizontal Grid lines */}
                {[1.0, 0.9, 0.75, 0.5, 0.25].map(ret => {
                  const y = padTop + (1 - ret) * graphH;
                  return (
                    <g key={ret}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={chartWidth - padRight}
                        y2={y}
                        style={{ stroke: 'var(--chart-grid)' }}
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 6}
                        y={y + 3}
                        textAnchor="end"
                        fontSize="12"
                        style={{ fill: 'var(--chart-label)' }}
                        fontWeight="600"
                      >
                        {Math.round(ret * 100)}%
                      </text>
                    </g>
                  );
                })}

                {/* Target Retention Threshold Line */}
                <line
                  x1={padLeft}
                  y1={targetLineY}
                  x2={chartWidth - padRight}
                  y2={targetLineY}
                  style={{ stroke: 'var(--chart-target)' }}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />

                {/* Area Gradient under curve */}
                <defs>
                  <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: 'var(--chart-curve)', stopOpacity: 0.3 }} />
                    <stop offset="100%" style={{ stopColor: 'var(--chart-curve)', stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                <path d={curveSvgArea} fill="url(#curveGradient)" />

                {/* Main Curve Line */}
                <path
                  d={curveSvgPath}
                  fill="none"
                  style={{ stroke: 'var(--chart-curve)' }}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Vertical Day Grid Labels */}
                {[...new Set([0, 7, 14, 21, 30, forgettingCurvePoints.maxDay])].map(day => {
                  if (day > forgettingCurvePoints.maxDay) return null;
                  const x = padLeft + (day / forgettingCurvePoints.maxDay) * graphW;
                  return (
                    <g key={day}>
                      <line
                        x1={x}
                        y1={padTop + graphH}
                        x2={x}
                        y2={padTop + graphH + 4}
                        style={{ stroke: 'var(--chart-tick)' }}
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={padTop + graphH + 16}
                        textAnchor="middle"
                        fontSize="12"
                        style={{ fill: 'var(--chart-label)' }}
                        fontWeight="600"
                      >
                        {day}d
                      </text>
                    </g>
                  );
                })}

                {/* Marked points on the curve; the chart itself handles selection */}
                {keyPoints.map(p => {
                    const coords = getSvgCoordinates(p.day, p.retention);
                    const isHovered = hoveredPoint?.day === p.day;
                    return (
                      <g key={p.day} aria-hidden="true">
                        {isHovered && (
                          <line
                            x1={coords.x}
                            y1={padTop}
                            x2={coords.x}
                            y2={padTop + graphH}
                            style={{ stroke: 'var(--chart-tick)' }}
                            strokeWidth="1"
                            strokeDasharray="3 3"
                          />
                        )}
                        <circle
                          cx={coords.x}
                          cy={coords.y}
                          r={isHovered ? 6 : 3.5}
                          style={{ fill: 'var(--chart-curve)', stroke: isHovered ? 'var(--color-focus)' : 'var(--chart-point-ring)' }}
                          strokeWidth="2"
                          className="transition-all"
                        />
                      </g>
                    );
                  })}
              </svg>

              {/* Tooltip on Hover */}
              {hoveredPoint && (
                <div
                  aria-hidden="true"
                  className="absolute top-0 right-0 px-2.5 py-1 rounded-lg text-xs tabular bg-white dark:bg-zinc-900 shadow-sm"
                >
                  <span className="ink-secondary">Dia {hoveredPoint.day}</span>{' '}
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    {Math.round(hoveredPoint.retention * 100)}%
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs ink-tertiary">
              <code className="font-mono">R(t) = (1 + 19/81 · t/S)^−0.5</code>
            </p>
          </div>
        )}

        {/* Tab 2: Answer Buttons Distribution */}
        {retentionTab === 'buttons' && (
          <div className="space-y-4">
            {totalReviews > 0 && (
              <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-black/[0.06] dark:bg-white/10" aria-hidden="true">
                <div style={{ width: `${(buttonCounts[1] / totalReviews) * 100}%` }} className="bg-red-500 h-full" />
                <div style={{ width: `${(buttonCounts[2] / totalReviews) * 100}%` }} className="bg-amber-500 h-full" />
                <div style={{ width: `${(buttonCounts[3] / totalReviews) * 100}%` }} className="bg-emerald-500 h-full" />
                <div style={{ width: `${(buttonCounts[4] / totalReviews) * 100}%` }} className="bg-blue-500 h-full" />
              </div>
            )}
            <ul className="ledger -mx-5 sm:-mx-6 border-y border-[var(--separator)]">
              {(
                [
                  { grade: 1, label: 'De novo', tone: 'text-red-700 dark:text-red-300' },
                  { grade: 2, label: 'Difícil', tone: 'text-amber-700 dark:text-amber-300' },
                  { grade: 3, label: 'Bom', tone: 'text-emerald-700 dark:text-emerald-300' },
                  { grade: 4, label: 'Fácil', tone: 'text-blue-700 dark:text-blue-300' },
                ] as const
              ).map(row => (
                <li key={row.grade} className="flex items-center gap-4 px-5 sm:px-6 py-3">
                  <span className="tabular w-4 ink-tertiary text-sm">{row.grade}</span>
                  <span className="flex-1 font-medium">{row.label}</span>
                  <span className="tabular text-sm ink-tertiary w-12 text-right">
                    {totalReviews > 0 ? Math.round((buttonCounts[row.grade] / totalReviews) * 100) : 0}%
                  </span>
                  <span className={`tabular text-lg font-semibold w-14 text-right ${row.tone}`}>
                    {buttonCounts[row.grade]}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-4 px-5 sm:px-6 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">Retenção em jovens</span>
                  <span className="block text-xs ink-tertiary">intervalo &lt; 21 d</span>
                </span>
                <span className="tabular text-lg font-semibold">{youngRetention !== null ? `${youngRetention}%` : '—'}</span>
              </li>
              <li className="flex items-center gap-4 px-5 sm:px-6 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">Retenção em maduros</span>
                  <span className="block text-xs ink-tertiary">intervalo ≥ 21 d</span>
                </span>
                <span className="tabular text-lg font-semibold">{matureRetention !== null ? `${matureRetention}%` : '—'}</span>
              </li>
            </ul>
          </div>
        )}

        {/* Tab 3: Daily Retention History */}
        {retentionTab === 'history' && (
          dailyHistory.length === 0 ? (
            <p className="py-10 text-center text-sm ink-secondary">Sem revisões registradas</p>
          ) : (
            <ul className="ledger -mx-5 sm:-mx-6 border-y border-[var(--separator)]">
              {dailyHistory.map(item => (
                <li key={item.day} className="flex items-center gap-4 px-5 sm:px-6 py-2.5 text-sm">
                  <span className="w-20 shrink-0 ink-secondary tabular">{item.day}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10" aria-hidden="true">
                    <span style={{ width: `${item.rate}%` }} className="block h-full rounded-full bg-emerald-500" />
                  </span>
                  <span className="tabular text-xs ink-tertiary w-14 text-right">{item.positive}/{item.total}</span>
                  <span className="tabular font-semibold w-12 text-right text-emerald-700 dark:text-emerald-300">{item.rate}%</span>
                </li>
              ))}
            </ul>
          )
        )}

        {/* Tab 4: Calibration of predicted vs real recall */}
        {retentionTab === 'calibration' && (
          <RetentionCalibration logs={filteredLogs} />
        )}
      </section>

      <section aria-labelledby="stats-maturity" className="sheet overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <h2 id="stats-maturity" className="text-base font-semibold">Maturidade</h2>
          {totalCards > 0 && (
            <div className="mt-4 w-full h-1.5 rounded-full overflow-hidden flex bg-black/[0.06] dark:bg-white/10" aria-hidden="true">
              <div style={{ width: `${(newCount / totalCards) * 100}%` }} className="bg-blue-500 h-full" />
              <div style={{ width: `${(learningCount / totalCards) * 100}%` }} className="bg-red-500 h-full" />
              <div style={{ width: `${(youngCount / totalCards) * 100}%` }} className="bg-amber-500 h-full" />
              <div style={{ width: `${(matureCount / totalCards) * 100}%` }} className="bg-emerald-500 h-full" />
            </div>
          )}
        </div>
        <ul className="ledger border-t border-[var(--separator)]">
          {[
            { label: 'Novos', detail: 'não iniciados', value: newCount, tone: 'text-blue-700 dark:text-blue-300' },
            { label: 'Aprendendo', detail: 'em assimilação', value: learningCount, tone: 'text-red-700 dark:text-red-300' },
            { label: 'Jovens', detail: 'intervalo < 21 d', value: youngCount, tone: 'text-amber-700 dark:text-amber-300' },
            { label: 'Maduros', detail: `intervalo ≥ 21 d · ${matureRate}%`, value: matureCount, tone: 'text-emerald-700 dark:text-emerald-300' },
            { label: 'Estudadas', detail: `de ${totalCards} palavras`, value: totalStudied, tone: '' },
            { label: 'Dificuldade média', detail: 'escala de 1 a 10', value: decimal(avgDifficulty), tone: '' },
          ].map(row => (
            <li key={row.label} className="flex items-center gap-4 px-5 py-3">
              <span className="flex-1 min-w-0">
                <span className="block font-medium">{row.label}</span>
                <span className="block text-xs ink-tertiary">{row.detail}</span>
              </span>
              <span className={`tabular text-lg font-semibold ${row.tone}`}>{row.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="stats-forecast" className="sheet overflow-hidden">
        <h2 id="stats-forecast" className="px-5 pt-5 pb-3 text-base font-semibold">Próximas revisões</h2>
        <ul className="ledger border-t border-[var(--separator)]">
          {forecast.map(item => {
            const maxForecast = Math.max(...forecast.map(f => f.count), 1);
            return (
              <li key={item.label} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                <span className={`w-16 shrink-0 ${item.highlight ? 'font-semibold' : 'ink-secondary'}`}>{item.label}</span>
                <span className="flex-1 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10" aria-hidden="true">
                  <span
                    style={{ width: `${(item.count / maxForecast) * 100}%` }}
                    className={`block h-full rounded-full ${item.highlight ? 'bg-red-600 dark:bg-red-500' : 'bg-red-600/40 dark:bg-red-400/50'}`}
                  />
                </span>
                <span className={`tabular w-12 text-right font-semibold ${item.highlight ? 'text-red-700 dark:text-red-300' : ''}`}>
                  {item.count}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {hskBreakdown.length > 0 && (
        <section aria-labelledby="stats-levels" className="sheet overflow-hidden">
          <h2 id="stats-levels" className="px-5 pt-5 pb-3 text-base font-semibold">Domínio por nível</h2>
          <ul className="ledger border-t border-[var(--separator)]">
            {hskBreakdown.map(lvl => (
              <li key={lvl.level} className="flex items-center gap-4 px-5 py-3">
                <span lang="zh-CN" aria-hidden="true" className="hanzi-index text-2xl w-10 text-center shrink-0 ink-tertiary">
                  {LEVEL_NUMERALS[lvl.level] ?? '·'}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{lvl.level}</span>
                    <span className="text-xs ink-tertiary tabular">
                      {lvl.studied} de {lvl.total} · {lvl.mature} maduras
                    </span>
                  </span>
                  <span className="mt-2 flex h-1 rounded-full overflow-hidden bg-black/[0.06] dark:bg-white/10" aria-hidden="true">
                    <span style={{ width: `${lvl.masteryRate}%` }} className="bg-emerald-500 h-full" />
                    <span style={{ width: `${Math.max(0, lvl.studiedRate - lvl.masteryRate)}%` }} className="bg-amber-500 h-full" />
                  </span>
                </span>
                <span className="tabular w-12 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                  {lvl.masteryRate}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="sheet group px-5 py-1">
        <summary className="flex items-center gap-2 font-medium cursor-pointer list-none min-h-12 [&::-webkit-details-marker]:hidden">
          <h2 className="text-base font-semibold">Como o FSRS agenda</h2>
          <ChevronDown className="w-4 h-4 ml-auto ink-tertiary transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <dl className="ledger text-sm pb-3">
          {[
            ['Estabilidade (S)', 'dias até a lembrança cair para 90%'],
            ['Dificuldade (D)', 'complexidade da palavra, de 1 a 10'],
            ['Recuperabilidade (R)', 'chance de lembrar agora'],
          ].map(([term, def]) => (
            <div key={term} className="py-2.5">
              <dt className="font-medium">{term}</dt>
              <dd className="ink-secondary">{def}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
};

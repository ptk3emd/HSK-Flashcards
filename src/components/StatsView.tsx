import React, { useState, useMemo } from 'react';
import { Card, FSRSOptions, DeckConfig, ReviewLog } from '../types/card';
import { loadReviewLogs } from '../lib/storage';
import { RetentionCalibration } from './RetentionCalibration';
import {
  BarChart3,
  TrendingUp,
  Brain,
  Calendar,
  Zap,
  Award,
  Layers,
  PieChart,
  Activity,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface StatsViewProps {
  cards: Card[];
  theme: 'dark' | 'light';
  fsrsOptions?: FSRSOptions;
  deckConfig?: DeckConfig;
}

type TimeRange = 'all' | '30d' | '7d' | 'today';

export const StatsView: React.FC<StatsViewProps> = ({
  cards,
  theme,
  fsrsOptions,
  deckConfig,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [retentionTab, setRetentionTab] = useState<'curve' | 'history' | 'buttons' | 'calibration'>('curve');
  const [hoveredPoint, setHoveredPoint] = useState<{ day: number; retention: number } | null>(null);

  const isLight = theme === 'light';
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

  // FSRS Forgetting Curve Points Calculation: R(t) = (1 + (19/81) * (t / S))^(-0.5)
  const curveStability = Math.max(1, avgStabilityNum || 5);
  const forgettingCurvePoints = useMemo(() => {
    const factor = 19 / 81;
    const decay = 0.5;
    const maxDay = Math.min(60, Math.max(30, Math.round(curveStability * 2.5)));
    const points: { day: number; retention: number }[] = [];

    for (let d = 0; d <= maxDay; d += Math.max(1, Math.floor(maxDay / 30))) {
      const r = Math.pow(1 + factor * (d / curveStability), -decay);
      points.push({ day: d, retention: Math.max(0, Math.min(1, r)) });
    }
    return { maxDay, points };
  }, [curveStability]);

  // SVG Chart Dimensions
  const chartWidth = 560;
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
  }, [forgettingCurvePoints]);

  const curveSvgArea = useMemo(() => {
    if (!curveSvgPath) return '';
    const lastPt = getSvgCoordinates(forgettingCurvePoints.maxDay, forgettingCurvePoints.points[forgettingCurvePoints.points.length - 1]?.retention ?? 0);
    const firstPt = getSvgCoordinates(0, 1);
    const bottomY = padTop + graphH;
    return `${curveSvgPath} L ${lastPt.x} ${bottomY} L ${firstPt.x} ${bottomY} Z`;
  }, [curveSvgPath, forgettingCurvePoints]);

  const targetLineY = padTop + (1 - targetRetention) * graphH;

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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-7 animate-in fade-in duration-300">
      {/* Header with Title and Period Filter */}
      <div
        className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
          isLight
            ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
            : 'bg-white/[0.04] border-white/10 text-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-red-600/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">Estatísticas Gerais</h1>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                Métricas de retenção, curva de memória FSRS e ritmo de revisões
              </p>
            </div>
          </div>

          {/* Time range selector tabs */}
          <div
            className={`inline-flex p-1 rounded-2xl border ${
              isLight ? 'bg-black/5 border-black/10' : 'bg-black/40 border-white/10'
            }`}
          >
            {(
              [
                { id: 'all', label: 'Tudo' },
                { id: '30d', label: '30 dias' },
                { id: '7d', label: '7 dias' },
                { id: 'today', label: 'Hoje' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTimeRange(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timeRange === tab.id
                    ? 'bg-red-600 text-white shadow-sm'
                    : isLight
                    ? 'text-black/60 hover:text-black'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Top Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6">
          {/* 1. Taxa de Retenção Real */}
          <div
            className={`rounded-2xl p-4 border transition-all ${
              isLight
                ? 'bg-emerald-500/5 border-emerald-600/20 shadow-sm'
                : 'bg-emerald-500/10 border-emerald-500/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold opacity-70">Taxa de Retenção</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {trueRetentionRate}%
            </div>
            <div className="text-[10px] opacity-60 mt-1 font-medium">
              Alvo: {Math.round(targetRetention * 100)}% ({positiveReviews}/{totalReviews || 0} acertos)
            </div>
          </div>

          {/* 2. Estabilidade Média */}
          <div
            className={`rounded-2xl p-4 border transition-all ${
              isLight ? 'bg-blue-500/5 border-blue-600/20 shadow-sm' : 'bg-blue-500/10 border-blue-500/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold opacity-70">Estabilidade (S)</span>
              <Clock className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {avgStability} <span className="text-xs font-bold opacity-60">dias</span>
            </div>
            <div className="text-[10px] opacity-60 mt-1 font-medium">
              Máx: {maxStability} dias (retenção 90%)
            </div>
          </div>

          {/* 3. Sequência de Dias (Streak) */}
          <div
            className={`rounded-2xl p-4 border transition-all ${
              isLight ? 'bg-amber-500/5 border-amber-600/20 shadow-sm' : 'bg-amber-500/10 border-amber-500/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold opacity-70">Sequência Ativa</span>
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {currentStreak} <span className="text-xs font-bold opacity-60">dias</span>
            </div>
            <div className="text-[10px] opacity-60 mt-1 font-medium">
              Recorde: {maxStreak} dias consecutivos
            </div>
          </div>

          {/* 4. Total de Revisões */}
          <div
            className={`rounded-2xl p-4 border transition-all ${
              isLight
                ? 'bg-purple-500/5 border-purple-600/20 shadow-sm'
                : 'bg-purple-500/10 border-purple-500/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold opacity-70">Total de Revisões</span>
              <RotateCcw className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {totalReviews}
            </div>
            <div className="text-[10px] opacity-60 mt-1 font-medium">
              {daysStudiedCount} dias estudados no total
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Gráfico de Retenção Interativo */}
      <div
        className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
          isLight
            ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
            : 'bg-white/[0.04] border-white/10 text-white'
        }`}
      >
        {/* Navigation Tabs for Retention Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-bold">Gráfico de Retenção & Curva FSRS</h2>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
              Decaimento teórico da memória e taxa real de acertos
            </p>
          </div>

          <div
            className={`inline-flex flex-wrap p-1 rounded-xl border text-xs ${
              isLight ? 'bg-black/5 border-black/10' : 'bg-black/40 border-white/10'
            }`}
          >
            <button
              type="button"
              onClick={() => setRetentionTab('curve')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                retentionTab === 'curve'
                  ? 'bg-red-600 text-white shadow-sm'
                  : isLight
                  ? 'text-black/60 hover:text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Curva de Esquecimento
            </button>
            <button
              type="button"
              onClick={() => setRetentionTab('buttons')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                retentionTab === 'buttons'
                  ? 'bg-red-600 text-white shadow-sm'
                  : isLight
                  ? 'text-black/60 hover:text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Botões de Resposta
            </button>
            <button
              type="button"
              onClick={() => setRetentionTab('history')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                retentionTab === 'history'
                  ? 'bg-red-600 text-white shadow-sm'
                  : isLight
                  ? 'text-black/60 hover:text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Histórico Diário
            </button>
            <button
              type="button"
              onClick={() => setRetentionTab('calibration')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                retentionTab === 'calibration'
                  ? 'bg-red-600 text-white shadow-sm'
                  : isLight
                  ? 'text-black/60 hover:text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Calibração
            </button>
          </div>
        </div>

        {/* Tab 1: FSRS Forgetting Curve */}
        {retentionTab === 'curve' && (
          <div className="space-y-5">
            {/* Legend & Summary Info */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-1 bg-red-500 rounded-full" />
                  <span className="font-semibold">Curva de Retenção R(t)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 border-t border-dashed border-emerald-500" />
                  <span className="font-semibold opacity-80">
                    Alvo FSRS ({Math.round(targetRetention * 100)}%)
                  </span>
                </div>
              </div>
              <div className={`text-[11px] font-medium ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                Estabilidade calculada: <strong>{avgStability} dias</strong>
              </div>
            </div>

            {/* SVG Interactive Chart */}
            <div
              className={`relative rounded-2xl p-4 border overflow-x-auto ${
                isLight ? 'bg-black/[0.02] border-black/10' : 'bg-black/30 border-white/10'
              }`}
            >
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-auto max-h-64 overflow-visible"
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
                        stroke={isLight ? '#e5e7eb' : '#27272a'}
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 6}
                        y={y + 3}
                        textAnchor="end"
                        fontSize="9"
                        fill={isLight ? '#6b7280' : '#a1a1aa'}
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
                  stroke="#10b981"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />

                {/* Area Gradient under curve */}
                <defs>
                  <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={curveSvgArea} fill="url(#curveGradient)" />

                {/* Main Curve Line */}
                <path
                  d={curveSvgPath}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Vertical Day Grid Labels */}
                {[0, 7, 14, 21, 30, forgettingCurvePoints.maxDay].map(day => {
                  if (day > forgettingCurvePoints.maxDay) return null;
                  const x = padLeft + (day / forgettingCurvePoints.maxDay) * graphW;
                  return (
                    <g key={day}>
                      <line
                        x1={x}
                        y1={padTop + graphH}
                        x2={x}
                        y2={padTop + graphH + 4}
                        stroke={isLight ? '#9ca3af' : '#52525b'}
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={padTop + graphH + 16}
                        textAnchor="middle"
                        fontSize="9"
                        fill={isLight ? '#6b7280' : '#a1a1aa'}
                        fontWeight="600"
                      >
                        {day}d
                      </text>
                    </g>
                  );
                })}

                {/* Key interactive points on the curve */}
                {forgettingCurvePoints.points
                  .filter((_, idx) => idx % Math.max(1, Math.floor(forgettingCurvePoints.points.length / 8)) === 0)
                  .map(p => {
                    const coords = getSvgCoordinates(p.day, p.retention);
                    const isHovered = hoveredPoint?.day === p.day;
                    return (
                      <g
                        key={p.day}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(p)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <circle
                          cx={coords.x}
                          cy={coords.y}
                          r={isHovered ? 6 : 3.5}
                          fill="#ef4444"
                          stroke={isLight ? '#ffffff' : '#18181b'}
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
                  className={`absolute top-4 right-4 px-3 py-1.5 rounded-xl border text-xs shadow-md ${
                    isLight ? 'bg-white border-black/10 text-black' : 'bg-zinc-900 border-white/20 text-white'
                  }`}
                >
                  <span className="font-bold">Dia {hoveredPoint.day}:</span>{' '}
                  <span className="text-red-500 font-extrabold">
                    {Math.round(hoveredPoint.retention * 100)}% de retenção
                  </span>
                </div>
              )}
            </div>

            {/* Explanation breakdown */}
            <div
              className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                isLight ? 'bg-black/[0.02] border-black/5 text-black/70' : 'bg-black/20 border-white/5 text-white/70'
              }`}
            >
              A retenção estimada é calculada com base na equação oficial do algoritmo FSRS:{' '}
              <code className="font-mono text-red-500 font-bold">R(t) = (1 + 19/81 * t/S)^(-0.5)</code>.
              Ela prediz a probabilidade exata de você reconhecer o ideograma chinês antes da próxima repetição.
            </div>
          </div>
        )}

        {/* Tab 2: Answer Buttons Distribution */}
        {retentionTab === 'buttons' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* De novo */}
              <div
                className={`p-4 rounded-2xl border ${
                  isLight ? 'bg-red-500/5 border-red-500/20' : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                <div className="text-xs font-semibold text-red-600 dark:text-red-400">1. De novo</div>
                <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">
                  {buttonCounts[1]}
                </div>
                <div className="text-[11px] opacity-60 mt-0.5">
                  {totalReviews > 0 ? Math.round((buttonCounts[1] / totalReviews) * 100) : 0}% das respostas
                </div>
              </div>

              {/* Difícil */}
              <div
                className={`p-4 rounded-2xl border ${
                  isLight ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-500/10 border-amber-500/20'
                }`}
              >
                <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">2. Difícil</div>
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {buttonCounts[2]}
                </div>
                <div className="text-[11px] opacity-60 mt-0.5">
                  {totalReviews > 0 ? Math.round((buttonCounts[2] / totalReviews) * 100) : 0}% das respostas
                </div>
              </div>

              {/* Bom */}
              <div
                className={`p-4 rounded-2xl border ${
                  isLight ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-500/10 border-emerald-500/20'
                }`}
              >
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">3. Bom</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {buttonCounts[3]}
                </div>
                <div className="text-[11px] opacity-60 mt-0.5">
                  {totalReviews > 0 ? Math.round((buttonCounts[3] / totalReviews) * 100) : 0}% das respostas
                </div>
              </div>

              {/* Fácil */}
              <div
                className={`p-4 rounded-2xl border ${
                  isLight ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-500/10 border-blue-500/20'
                }`}
              >
                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">4. Fácil</div>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                  {buttonCounts[4]}
                </div>
                <div className="text-[11px] opacity-60 mt-0.5">
                  {totalReviews > 0 ? Math.round((buttonCounts[4] / totalReviews) * 100) : 0}% das respostas
                </div>
              </div>
            </div>

            {/* Stacked Proportional Bar */}
            {totalReviews > 0 && (
              <div>
                <div className="text-xs font-semibold mb-2 opacity-80">Proporção dos Botões de Avaliação</div>
                <div
                  className={`w-full h-4 rounded-full overflow-hidden flex border ${
                    isLight ? 'bg-black/5 border-black/10' : 'bg-black/40 border-white/10'
                  }`}
                >
                  <div
                    style={{ width: `${(buttonCounts[1] / totalReviews) * 100}%` }}
                    className="bg-red-500 h-full transition-all"
                    title={`De novo: ${buttonCounts[1]}`}
                  />
                  <div
                    style={{ width: `${(buttonCounts[2] / totalReviews) * 100}%` }}
                    className="bg-amber-500 h-full transition-all"
                    title={`Difícil: ${buttonCounts[2]}`}
                  />
                  <div
                    style={{ width: `${(buttonCounts[3] / totalReviews) * 100}%` }}
                    className="bg-emerald-500 h-full transition-all"
                    title={`Bom: ${buttonCounts[3]}`}
                  />
                  <div
                    style={{ width: `${(buttonCounts[4] / totalReviews) * 100}%` }}
                    className="bg-blue-500 h-full transition-all"
                    title={`Fácil: ${buttonCounts[4]}`}
                  />
                </div>
              </div>
            )}

            {/* Retention segmented by maturity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div
                className={`p-4 rounded-2xl border ${
                  isLight ? 'bg-black/[0.02] border-black/5' : 'bg-black/20 border-white/5'
                }`}
              >
                <span className="text-xs opacity-60 font-medium">Retenção em Cartões Jovens (&lt; 21d)</span>
                <div className="text-xl font-bold mt-1">
                  {youngRetention !== null ? `${youngRetention}%` : 'Sem dados'}
                </div>
                <p className="text-[10px] opacity-50 mt-0.5">Fase inicial de consolidação na memória</p>
              </div>

              <div
                className={`p-4 rounded-2xl border ${
                  isLight ? 'bg-black/[0.02] border-black/5' : 'bg-black/20 border-white/5'
                }`}
              >
                <span className="text-xs opacity-60 font-medium">Retenção em Cartões Maduros (&ge; 21d)</span>
                <div className="text-xl font-bold mt-1">
                  {matureRetention !== null ? `${matureRetention}%` : 'Sem dados'}
                </div>
                <p className="text-[10px] opacity-50 mt-0.5">Memória de longo prazo consolidada</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Daily Retention History */}
        {retentionTab === 'history' && (
          <div className="space-y-4">
            {dailyHistory.length === 0 ? (
              <div
                className={`text-center py-10 rounded-2xl border text-xs opacity-60 ${
                  isLight ? 'bg-black/[0.02] border-black/5' : 'bg-black/20 border-white/5'
                }`}
              >
                Ainda não há histórico diário de revisões gravado. Complete uma sessão de estudo para visualizar o gráfico.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-semibold opacity-80">
                  Taxa de Acertos nos Últimos Dias Estudados
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                  {dailyHistory.map(item => (
                    <div
                      key={item.day}
                      className={`p-3 rounded-2xl border text-center ${
                        isLight ? 'bg-black/[0.02] border-black/10' : 'bg-black/30 border-white/10'
                      }`}
                    >
                      <div className="text-[10px] opacity-50 font-semibold">{item.day}</div>
                      <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                        {item.rate}%
                      </div>
                      <div className="text-[10px] opacity-50 mt-0.5">
                        {item.positive}/{item.total} rev.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Calibration of predicted vs real recall */}
        {retentionTab === 'calibration' && (
          <RetentionCalibration logs={filteredLogs} theme={theme} />
        )}
      </div>

      {/* SECTION: Estatísticas Gerais & Maturidade dos Cartões */}
      <div
        className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
          isLight
            ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
            : 'bg-white/[0.04] border-white/10 text-white'
        }`}
      >
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-bold">Distribuição & Maturidade do Baralho</h2>
        </div>

        {/* Maturity Progress Bar */}
        {totalCards > 0 && (
          <div className="space-y-3">
            <div
              className={`w-full h-4 rounded-full overflow-hidden flex border ${
                isLight ? 'bg-black/5 border-black/10' : 'bg-black/40 border-white/10'
              }`}
            >
              <div
                style={{ width: `${(newCount / totalCards) * 100}%` }}
                className="bg-blue-500 h-full transition-all"
                title={`Novos: ${newCount}`}
              />
              <div
                style={{ width: `${(learningCount / totalCards) * 100}%` }}
                className="bg-red-500 h-full transition-all"
                title={`Aprendendo: ${learningCount}`}
              />
              <div
                style={{ width: `${(youngCount / totalCards) * 100}%` }}
                className="bg-amber-500 h-full transition-all"
                title={`Jovens: ${youngCount}`}
              />
              <div
                style={{ width: `${(matureCount / totalCards) * 100}%` }}
                className="bg-emerald-500 h-full transition-all"
                title={`Maduros: ${matureCount}`}
              />
            </div>

            {/* Counts Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div
                className={`p-3 rounded-2xl border ${
                  isLight ? 'bg-black/[0.02] border-black/5' : 'bg-black/20 border-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="opacity-70 font-medium">Novos</span>
                </div>
                <div className="text-lg font-black mt-1">{newCount}</div>
                <div className="text-[10px] opacity-40">Não iniciados</div>
              </div>

              <div
                className={`p-3 rounded-2xl border ${
                  isLight ? 'bg-black/[0.02] border-black/5' : 'bg-black/20 border-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="opacity-70 font-medium">Aprendendo</span>
                </div>
                <div className="text-lg font-black mt-1">{learningCount}</div>
                <div className="text-[10px] opacity-40">Em assimilação</div>
              </div>

              <div
                className={`p-3 rounded-2xl border ${
                  isLight ? 'bg-black/[0.02] border-black/5' : 'bg-black/20 border-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="opacity-70 font-medium">Jovens</span>
                </div>
                <div className="text-lg font-black mt-1">{youngCount}</div>
                <div className="text-[10px] opacity-40">&lt; 21 dias de intervalo</div>
              </div>

              <div
                className={`p-3 rounded-2xl border ${
                  isLight ? 'bg-black/[0.02] border-black/5' : 'bg-black/20 border-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="opacity-70 font-medium">Maduros</span>
                </div>
                <div className="text-lg font-black mt-1">{matureCount}</div>
                <div className="text-[10px] opacity-40">&ge; 21 dias ({matureRate}%)</div>
              </div>
            </div>
          </div>
        )}

        {/* Secondary General Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-black/5 dark:border-white/10">
          <div>
            <div className="text-[11px] opacity-60 font-semibold">Total no Baralho</div>
            <div className="text-xl font-bold mt-0.5">{totalCards} palavras</div>
          </div>
          <div>
            <div className="text-[11px] opacity-60 font-semibold">Total Estudadas</div>
            <div className="text-xl font-bold mt-0.5">{totalStudied} palavras</div>
          </div>
          <div>
            <div className="text-[11px] opacity-60 font-semibold">Dificuldade Média</div>
            <div className="text-xl font-bold mt-0.5">{avgDifficulty} / 10</div>
          </div>
          <div>
            <div className="text-[11px] opacity-60 font-semibold">Taxa de Maturidade</div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {matureRate}%
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Previsão de Revisões Futuras (Forecast) */}
      <div
        className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
          isLight
            ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
            : 'bg-white/[0.04] border-white/10 text-white'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold">Carga de Revisões Futuras</h2>
          </div>
          <span className={`text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
            Previsão baseada no agendamento FSRS
          </span>
        </div>

        {/* Forecast Column Chart */}
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2.5">
          {forecast.map(item => {
            const maxForecast = Math.max(...forecast.map(f => f.count), 1);
            const heightPercent = Math.max(12, Math.round((item.count / maxForecast) * 100));

            return (
              <div
                key={item.label}
                className={`flex flex-col items-center justify-end p-3 rounded-2xl border transition-all min-h-[140px] ${
                  item.highlight
                    ? 'bg-red-500/10 border-red-500/30'
                    : isLight
                    ? 'bg-black/[0.02] border-black/5'
                    : 'bg-black/20 border-white/5'
                }`}
              >
                <div className="text-xs font-black text-red-500 mb-2">{item.count}</div>
                {/* Visual bar */}
                <div className="w-full bg-black/5 dark:bg-white/5 rounded-lg flex items-end h-16 p-1">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-md transition-all ${
                      item.highlight ? 'bg-red-600' : 'bg-red-500/50 dark:bg-red-500/40'
                    }`}
                  />
                </div>
                <div className="text-[11px] font-bold opacity-70 mt-2 text-center">{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION: Domínio por Nível HSK */}
      {hskBreakdown.length > 0 && (
        <div
          className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
            isLight
              ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
              : 'bg-white/[0.04] border-white/10 text-white'
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold">Domínio de Vocabulário por Nível HSK</h2>
          </div>

          <div className="space-y-3">
            {hskBreakdown.map(lvl => (
              <div
                key={lvl.level}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isLight ? 'bg-black/[0.02] border-black/5' : 'bg-black/20 border-white/5'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm">{lvl.level}</span>
                    <span className="opacity-50">
                      ({lvl.studied} de {lvl.total} estudadas)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-semibold">
                    <span className="opacity-60">Maduras: {lvl.mature}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {lvl.masteryRate}% consolidado
                    </span>
                  </div>
                </div>

                <div
                  className={`w-full h-2.5 rounded-full overflow-hidden flex border ${
                    isLight ? 'bg-black/5 border-black/10' : 'bg-black/40 border-white/10'
                  }`}
                >
                  <div
                    style={{ width: `${lvl.masteryRate}%` }}
                    className="bg-emerald-500 h-full transition-all"
                  />
                  <div
                    style={{ width: `${Math.max(0, lvl.studiedRate - lvl.masteryRate)}%` }}
                    className="bg-amber-500 h-full transition-all"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explicação da Repetição Espaçada FSRS */}
      <div
        className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
          isLight
            ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
            : 'bg-white/[0.04] border-white/10 text-white'
        }`}
      >
        <div className="flex items-center gap-2 font-bold mb-2">
          <Brain className="w-5 h-5 text-red-500" />
          <h3 className="text-base font-bold">Como Funciona a Repetição Espaçada?</h3>
        </div>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-black/70' : 'text-white/70'}`}>
          O agendador de repetição calcula matematicamente a curva de retenção de memória de cada ideograma chinês com base em:
        </p>
        <ul className={`text-xs space-y-1.5 list-disc pl-5 mt-2 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
          <li><strong>Estabilidade (S):</strong> Duração estimada em dias antes de você esquecer o Hanzi.</li>
          <li><strong>Dificuldade (D):</strong> Complexidade intrínseca de cada caractere (escala de 1 a 10).</li>
          <li><strong>Recuperabilidade (R):</strong> Probabilidade de lembrança instantânea durante o teste.</li>
        </ul>
      </div>
    </div>
  );
};

import { useMemo, useState } from 'react';
import { ArrowRight, Check, Droplets } from 'lucide-react';
import { ChartCanvas } from '../components/ChartCanvas';
import { RiskIndicator } from '../components/RiskIndicator';
import { PageId } from '../components/Sidebar';
import { WorkspacePayload } from '../types/api';
import {
  formatAlertHeadline,
  formatAlertSummary,
  formatHouseholdStatus,
} from '../utils/plainLanguage';

interface DashboardPageProps {
  workspace: WorkspacePayload;
  onNavigate: (page: PageId) => void;
  onAcknowledgeAlert: (alertId: number) => Promise<void>;
  onLoadDemo: () => Promise<void>;
}

export function DashboardPage({
  workspace,
  onNavigate,
  onAcknowledgeAlert,
  onLoadDemo,
}: DashboardPageProps) {
  const { summary, forecast, leakAnalysis, conservation, alerts, readings } = workspace;
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [pendingAlertId, setPendingAlertId] = useState<number | null>(null);

  const recent30 = useMemo(() => forecast.historical.slice(-30), [forecast.historical]);
  const activeAlerts = useMemo(
    () => alerts.filter((a) => a.status === 'Active'),
    [alerts]
  );

  const statusText = formatHouseholdStatus(
    leakAnalysis.overallRiskLevel,
    leakAnalysis.activeAlertsCount
  );

  const todayDiff = Math.round(summary.todayLiters - conservation.goal.dailyTargetLiters);
  const monthlyUsed = Math.round(conservation.recentThirtyDayTotalLiters);
  const monthlyDiff = Math.round(conservation.goal.monthlyLimitLiters - monthlyUsed);

  const usageChartData = useMemo(
    () => ({
      labels: recent30.map((p) => p.date.slice(5)),
      datasets: [
        {
          label: 'Water Used (L)',
          data: recent30.map((p) => p.actualLiters),
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#0284C7',
          pointHoverBorderColor: '#FFFFFF',
          pointHoverBorderWidth: 2,
          tension: 0.28,
          fill: true,
        },
        {
          label: `Daily Goal (${conservation.goal.dailyTargetLiters} L)`,
          data: recent30.map(() => conservation.goal.dailyTargetLiters),
          borderColor: '#0F766E',
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        },
      ],
    }),
    [recent30, conservation.goal.dailyTargetLiters]
  );

  const usageChartOptions = useMemo(
    () => ({
      plugins: {
        legend: {
          position: 'top' as const,
          align: 'end' as const,
        },
        tooltip: {
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
              `${ctx.dataset.label ?? 'Usage'}: ${Math.round(ctx.parsed.y ?? 0).toLocaleString()} L`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          border: { display: false },
          grid: { color: '#EEF2F6' },
          ticks: {
            color: '#64748B',
            font: { family: '"IBM Plex Mono", monospace', size: 11 },
            callback: (value: string | number) => `${value} L`,
          },
        },
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: '#64748B',
            maxTicksLimit: 8,
            font: { family: '"IBM Plex Mono", monospace', size: 11 },
          },
        },
      },
    }),
    []
  );

  if (readings.length === 0) {
    return (
      <div className="surface-card p-10 text-center max-w-xl mx-auto mt-10">
        <div className="w-10 h-10 rounded-lg bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1] flex items-center justify-center mx-auto mb-4">
          <Droplets className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="font-display text-lg font-semibold text-[#0F172A]">
          Welcome to Your Home Water Tracker
        </h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-md mx-auto">
          You have not added any water readings yet. Log your first daily meter reading or load sample household data to see trends, forecasts, and leak checks.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('monitoring')}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-md shadow-xs hover:bg-[#0D625B]"
          >
            Add First Reading
          </button>
          <button
            type="button"
            disabled={loadingDemo}
            onClick={async () => {
              if (loadingDemo) return;
              setLoadingDemo(true);
              try {
                await onLoadDemo();
              } finally {
                setLoadingDemo(false);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-[#0F172A] bg-white border border-slate-200 rounded-md shadow-2xs hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50"
          >
            {loadingDemo ? 'Loading...' : 'Load Sample Data'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unified 4-metric KPI Bar */}
      <section
        aria-label="Household water summary"
        className="surface-card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80"
      >
        <div className="p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-500">Today's Water Usage</div>
          <div className="mt-2 font-mono-tabular text-[26px] leading-tight font-semibold text-[#0F172A] tracking-tight whitespace-nowrap">
            {summary.todayLiters.toLocaleString()} L
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {todayDiff <= 0
              ? `${Math.abs(todayDiff).toLocaleString()} L under ${conservation.goal.dailyTargetLiters.toLocaleString()} L goal`
              : `${todayDiff.toLocaleString()} L over ${conservation.goal.dailyTargetLiters.toLocaleString()} L goal`}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-500">Your Monthly Usage</div>
          <div className="mt-2 font-mono-tabular text-[26px] leading-tight font-semibold text-[#0F172A] tracking-tight whitespace-nowrap">
            {monthlyUsed.toLocaleString()} L
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {monthlyDiff >= 0
              ? `${monthlyDiff.toLocaleString()} L left of ${conservation.goal.monthlyLimitLiters.toLocaleString()} L limit`
              : `${Math.abs(monthlyDiff).toLocaleString()} L over ${conservation.goal.monthlyLimitLiters.toLocaleString()} L limit`}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-500">Current Water Status</div>
          <div className="mt-2.5">
            <RiskIndicator level={leakAnalysis.overallRiskLevel} plain />
          </div>
          <div className="mt-2 text-xs text-slate-600 leading-snug">{statusText.headline}</div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="text-xs font-medium text-slate-500">Your Water-Saving Goal</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono-tabular text-[26px] leading-tight font-semibold text-[#0F766E] tracking-tight whitespace-nowrap">
              {conservation.targetAdherencePercent}%
            </span>
            <span className="text-xs text-slate-500 font-mono-tabular whitespace-nowrap">
              {conservation.daysWithinDailyTarget}/{conservation.totalEvaluatedDays} days
            </span>
          </div>
          <div className="mt-2.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0F766E] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, conservation.targetAdherencePercent)}%` }}
            />
          </div>
        </div>
      </section>

      {/* Main Water Usage Trend Visualization */}
      <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Water Usage Trends (Last 30 Days)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hover over any day to compare your household usage with your {conservation.goal.dailyTargetLiters} L daily goal
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('monitoring')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F766E] hover:text-[#0D625B] whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <span>See All Readings</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <ChartCanvas
          type="line"
          data={usageChartData}
          heightClass="h-72"
          testId="dashboard-usage-chart"
          ariaLabel="Daily water usage over the last 30 days"
          options={usageChartOptions}
        />
      </section>

      {/* Important Leak Alerts (only shown when active alerts exist) */}
      {activeAlerts.length > 0 && (
        <section className="surface-card overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-200/80 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A]">
                Possible Leak Detected ({activeAlerts.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Days where water use looked unusually high or kept running overnight
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('leaks')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F766E] hover:text-[#0D625B] whitespace-nowrap shrink-0"
            >
              <span>Review All</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {activeAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <RiskIndicator level={alert.riskLevel} plain />
                    <span className="text-xs text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-xs text-slate-500">{alert.date}</span>
                    <span className="text-xs text-slate-300" aria-hidden="true">·</span>
                    <span className="text-sm font-medium text-[#0F172A]">
                      {formatAlertHeadline(alert)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {formatAlertSummary(alert)}
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-semibold text-[#0F172A]">What to do:</span>{' '}
                    {alert.recommendedAction}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={pendingAlertId === alert.id}
                  onClick={async () => {
                    if (pendingAlertId === alert.id) return;
                    setPendingAlertId(alert.id);
                    try {
                      await onAcknowledgeAlert(alert.id);
                    } finally {
                      setPendingAlertId(null);
                    }
                  }}
                  aria-label={`Mark alert on ${alert.date} as checked`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-2xs hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  <Check className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span>{pendingAlertId === alert.id ? 'Updating...' : 'Mark as Checked'}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { ChartCanvas } from '../components/ChartCanvas';
import { RiskIndicator } from '../components/RiskIndicator';
import { PageId } from '../components/Sidebar';
import { WorkspacePayload } from '../types/api';

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
  const { summary, forecast, leakAnalysis, conservation, alerts, weekly, monthly, readings } = workspace;

  const recent30 = useMemo(() => forecast.historical.slice(-30), [forecast.historical]);
  const lastActual = recent30[recent30.length - 1];
  const actualVsPredDiff = lastActual
    ? Number((lastActual.actualLiters - lastActual.predictedLiters).toFixed(1))
    : 0;

  const actualVsPredictedChartData = useMemo(
    () => ({
      labels: recent30.map((p) => p.date.slice(5)),
      datasets: [
        {
          label: 'Actual Usage (L)',
          data: recent30.map((p) => p.actualLiters),
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          borderWidth: 2,
          pointRadius: 2.5,
          tension: 0.2,
          fill: true,
        },
        {
          label: 'Predicted Baseline (L)',
          data: recent30.map((p) => p.predictedLiters),
          borderColor: '#0F766E',
          borderDash: [5, 4],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
          fill: false,
        },
      ],
    }),
    [recent30]
  );

  const weeklyChartData = useMemo(() => {
    const slice = weekly.slice(-8);
    return {
      labels: slice.map((w) => w.period),
      datasets: [
        {
          label: 'Weekly Total (L)',
          data: slice.map((w) => w.totalLiters),
          backgroundColor: '#0F766E',
          borderRadius: 4,
        },
      ],
    };
  }, [weekly]);

  const monthlyChartData = useMemo(
    () => ({
      labels: monthly.map((m) => m.label),
      datasets: [
        {
          label: 'Monthly Total (L)',
          data: monthly.map((m) => m.totalLiters),
          backgroundColor: '#0284C7',
          borderRadius: 4,
        },
      ],
    }),
    [monthly]
  );

  if (readings.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center max-w-2xl mx-auto mt-6">
        <h2 className="font-display text-xl font-semibold text-[#0F172A]">
          No Water Meter Readings Recorded Yet
        </h2>
        <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
          Start by adding your first simulated meter reading manually, or load the deterministic 92-day sample dataset to test forecasting, leak detection, and conservation tracking.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('monitoring')}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B]"
          >
            Log First Reading
          </button>
          <button
            type="button"
            onClick={onLoadDemo}
            className="px-4 py-2 text-sm font-medium text-[#0F172A] bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Load 90-Day Sample Data
          </button>
        </div>
      </div>
    );
  }

  const recentAlerts = alerts.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <section aria-label="Key water metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Latest Daily Consumption</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono-tabular text-2xl font-semibold text-[#0F172A] whitespace-nowrap">
              {summary.todayLiters.toLocaleString()} L
            </span>
            <span className="text-xs text-slate-500 font-mono-tabular whitespace-nowrap">
              {summary.latestDate}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Daily target: <span className="font-mono-tabular font-medium">{conservation.goal.dailyTargetLiters} L</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Average Daily Usage</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono-tabular text-2xl font-semibold text-[#0F172A] whitespace-nowrap">
              {summary.averageDailyLiters.toLocaleString()} L
            </span>
            <span className="text-xs text-slate-500 font-mono-tabular whitespace-nowrap">
              {summary.totalReadings} days
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Weekday {summary.weekdayAverageLiters} L · Weekend {summary.weekendAverageLiters} L
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Next-Day Predicted Usage</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono-tabular text-2xl font-semibold text-[#0284C7] whitespace-nowrap">
              {forecast.nextDayPredictedLiters.toLocaleString()} L
            </span>
            <span
              className={`text-xs font-mono-tabular font-medium whitespace-nowrap ${
                actualVsPredDiff > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
              }`}
            >
              {actualVsPredDiff >= 0 ? '+' : ''}
              {actualVsPredDiff} L vs pred
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600 truncate">
            {forecast.methodName}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Leak Risk & Goal Progress</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <RiskIndicator level={leakAnalysis.overallRiskLevel} />
            <span className="font-mono-tabular text-sm font-semibold text-[#15803D] whitespace-nowrap">
              {conservation.targetAdherencePercent}% on target
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            {leakAnalysis.activeAlertsCount} active alert{leakAnalysis.activeAlertsCount === 1 ? '' : 's'} ·{' '}
            {conservation.estimatedDailySavingsLiters >= 0
              ? `${conservation.estimatedDailySavingsLiters} L/day saved`
              : `${Math.abs(conservation.estimatedDailySavingsLiters)} L/day over baseline`}
          </div>
        </div>
      </section>

      {/* Primary Chart: Actual vs Predicted */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Actual vs Predicted Consumption (Last 30 Days)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compares recorded meter readings against expected baseline from {forecast.methodName}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('prediction')}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap shrink-0"
          >
            <span>Open Full Forecast</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
        <ChartCanvas
          type="line"
          data={actualVsPredictedChartData}
          heightClass="h-72"
          testId="dashboard-actual-vs-predicted-chart"
          ariaLabel="Actual versus predicted water consumption over the last 30 days"
          options={{
            plugins: {
              legend: { position: 'top', align: 'end', labels: { boxWidth: 12, usePointStyle: true } },
            },
            scales: {
              y: {
                beginAtZero: false,
                title: { display: true, text: 'Volume (Liters)', color: '#64748B', font: { size: 11 } },
                grid: { color: '#F1F5F9' },
              },
              x: { grid: { display: false } },
            },
          }}
        />
      </section>

      {/* Weekly & Monthly Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A]">Weekly Consumption</h2>
              <p className="text-xs text-slate-500 mt-0.5">Total liters per ISO calendar week</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('monitoring')}
              className="text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap"
            >
              Manage Readings
            </button>
          </div>
          <ChartCanvas
            type="bar"
            data={weeklyChartData}
            heightClass="h-60"
            testId="dashboard-weekly-chart"
            ariaLabel="Weekly water consumption bar chart"
            options={{
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                x: { grid: { display: false } },
              },
            }}
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A]">Monthly Consumption</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Monthly limit: <span className="font-mono-tabular">{conservation.goal.monthlyLimitLiters.toLocaleString()} L</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap"
            >
              View Reports
            </button>
          </div>
          <ChartCanvas
            type="bar"
            data={monthlyChartData}
            heightClass="h-60"
            testId="dashboard-monthly-chart"
            ariaLabel="Monthly water consumption bar chart"
            options={{
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                x: { grid: { display: false } },
              },
            }}
          />
        </div>
      </section>

      {/* Bottom Split: Conservation Progress & Recent Alerts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#0F172A]">
                Conservation Goal Progress
              </h2>
              <span
                className={`text-xs font-semibold ${
                  conservation.statusLabel === 'On Track'
                    ? 'text-[#15803D]'
                    : conservation.statusLabel === 'Needs Attention'
                    ? 'text-[#B45309]'
                    : 'text-[#DC2626]'
                }`}
              >
                {conservation.statusLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{conservation.goal.actionLabel}</p>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-600">30-Day Monthly Limit Utilization</span>
                <span className="font-mono-tabular font-semibold text-[#0F172A]">
                  {conservation.recentThirtyDayTotalLiters.toLocaleString()} /{' '}
                  {conservation.goal.monthlyLimitLiters.toLocaleString()} L ({conservation.monthlyLimitUtilizationPercent}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    conservation.monthlyLimitUtilizationPercent > 100
                      ? 'bg-[#DC2626]'
                      : conservation.monthlyLimitUtilizationPercent > 85
                      ? 'bg-[#D97706]'
                      : 'bg-[#16A34A]'
                  }`}
                  style={{ width: `${Math.min(100, conservation.monthlyLimitUtilizationPercent)}%` }}
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <div>
                <div className="text-xs text-slate-500">Before Action Avg</div>
                <div className="font-mono-tabular text-lg font-semibold text-[#0F172A] mt-0.5">
                  {conservation.beforeAvgLiters} L/d
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">After Action Avg</div>
                <div className="font-mono-tabular text-lg font-semibold text-[#15803D] mt-0.5">
                  {conservation.afterAvgLiters} L/d
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('conservation')}
            className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline self-start"
          >
            <span>Manage Targets & Recommendations</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A]">
                Recent Suspected Leak Alerts
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Software-simulated anomaly detection (never claims physical confirmation)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('leaks')}
              className="text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap"
            >
              View All ({alerts.length})
            </button>
          </div>

          {recentAlerts.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No possible leak patterns detected across current readings.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <RiskIndicator level={alert.riskLevel} />
                      <span className="text-xs text-slate-400">·</span>
                      <span className="font-mono-tabular text-xs font-medium text-[#0F172A]">{alert.date}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-600">{alert.ruleTriggered}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Actual <span className="font-mono-tabular font-semibold">{alert.actualLiters} L</span> vs expected{' '}
                      <span className="font-mono-tabular">{alert.expectedLiters} L</span> · Night flow{' '}
                      <span className="font-mono-tabular">{alert.nightFlowLph} L/h</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">{alert.status}</span>
                    {alert.status === 'Active' && (
                      <button
                        type="button"
                        onClick={() => onAcknowledgeAlert(alert.id)}
                        aria-label={`Acknowledge alert on ${alert.date}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0F172A] bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 whitespace-nowrap"
                      >
                        <Check className="w-3 h-3" aria-hidden="true" />
                        <span>Acknowledge</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

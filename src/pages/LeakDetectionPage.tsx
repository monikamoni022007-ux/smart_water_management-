import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, RotateCcw } from 'lucide-react';
import { ChartCanvas } from '../components/ChartCanvas';
import { RiskIndicator } from '../components/RiskIndicator';
import { AlertStatus, UserSettings, WorkspacePayload } from '../types/api';

interface LeakDetectionPageProps {
  workspace: WorkspacePayload;
  onUpdateThresholds: (patch: Partial<UserSettings>) => Promise<void>;
  onUpdateAlertStatus: (alertId: number, status: AlertStatus) => Promise<void>;
}

export function LeakDetectionPage({
  workspace,
  onUpdateThresholds,
  onUpdateAlertStatus,
}: LeakDetectionPageProps) {
  const { settings, alerts, leakAnalysis, readings } = workspace;

  const [spikePct, setSpikePct] = useState(String(settings.spikePercentThreshold));
  const [highRiskPct, setHighRiskPct] = useState(String(settings.highRiskPercentThreshold));
  const [nightFlowLph, setNightFlowLph] = useState(String(settings.nightFlowThresholdLph));
  const [consecutiveDays, setConsecutiveDays] = useState(String(settings.consecutiveAbnormalDays));
  const [zThresh, setZThresh] = useState(String(settings.historicalZThreshold));
  const [thresholdError, setThresholdError] = useState('');
  const [thresholdSaved, setThresholdSaved] = useState('');
  const [saving, setSaving] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'all' | AlertStatus>('all');

  useEffect(() => {
    setSpikePct(String(settings.spikePercentThreshold));
    setHighRiskPct(String(settings.highRiskPercentThreshold));
    setNightFlowLph(String(settings.nightFlowThresholdLph));
    setConsecutiveDays(String(settings.consecutiveAbnormalDays));
    setZThresh(String(settings.historicalZThreshold));
  }, [settings]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => (statusFilter === 'all' ? true : a.status === statusFilter));
  }, [alerts, statusFilter]);

  const recentNightFlow = useMemo(() => readings.slice(-45), [readings]);

  const nightFlowChartData = useMemo(
    () => ({
      labels: recentNightFlow.map((r) => r.date.slice(5)),
      datasets: [
        {
          label: 'Simulated Night Flow (L/h)',
          data: recentNightFlow.map((r) => r.nightFlowLph),
          backgroundColor: recentNightFlow.map((r) =>
            r.nightFlowLph >= settings.nightFlowThresholdLph ? '#DC2626' : '#0284C7'
          ),
          borderRadius: 3,
        },
        {
          label: `Threshold (${settings.nightFlowThresholdLph} L/h)`,
          data: recentNightFlow.map(() => settings.nightFlowThresholdLph),
          type: 'line' as const,
          borderColor: '#D97706',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    }),
    [recentNightFlow, settings.nightFlowThresholdLph]
  );

  async function handleSaveThresholds(e: React.FormEvent) {
    e.preventDefault();
    setThresholdError('');
    setThresholdSaved('');

    const s = Number(spikePct);
    const h = Number(highRiskPct);
    const n = Number(nightFlowLph);
    const c = Number(consecutiveDays);
    const z = Number(zThresh);

    if (Number.isNaN(s) || s < 5 || s > 300) {
      setThresholdError('Spike threshold must be between 5% and 300%.');
      return;
    }
    if (Number.isNaN(h) || h <= s || h > 500) {
      setThresholdError('High-risk threshold must be greater than spike threshold and up to 500%.');
      return;
    }
    if (Number.isNaN(n) || n < 1 || n > 500) {
      setThresholdError('Nighttime flow threshold must be between 1 and 500 L/h.');
      return;
    }
    if (Number.isNaN(c) || c < 1 || c > 14) {
      setThresholdError('Consecutive abnormal days must be between 1 and 14.');
      return;
    }
    if (Number.isNaN(z) || z < 1 || z > 6) {
      setThresholdError('Historical Z-score threshold must be between 1.0 and 6.0.');
      return;
    }

    setSaving(true);
    try {
      await onUpdateThresholds({
        spikePercentThreshold: s,
        highRiskPercentThreshold: h,
        nightFlowThresholdLph: n,
        consecutiveAbnormalDays: Math.round(c),
        historicalZThreshold: z,
      });
      setThresholdSaved('Detection thresholds updated and readings re-analyzed via LeakDetector.');
    } catch (err) {
      setThresholdError(err instanceof Error ? err.message : 'Failed to update thresholds.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Overview + Configurable Thresholds */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">Current System Risk Assessment</div>
            <div className="mt-2">
              <RiskIndicator level={leakAnalysis.overallRiskLevel} />
            </div>
            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              Evaluated using the <span className="font-mono-tabular">LeakDetector</span> subject and{' '}
              <span className="font-mono-tabular">AlertObserver</span> pattern. All detections indicate a{' '}
              <strong>Possible Leak</strong> or <strong>Suspected Leak</strong> from software patterns—never a physically confirmed fault.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="font-mono-tabular text-lg font-semibold text-[#DC2626]">
                {alerts.filter((a) => a.status === 'Active').length}
              </div>
              <div className="text-xs text-slate-500">Active</div>
            </div>
            <div>
              <div className="font-mono-tabular text-lg font-semibold text-[#B45309]">
                {alerts.filter((a) => a.status === 'Acknowledged').length}
              </div>
              <div className="text-xs text-slate-500">Acked</div>
            </div>
            <div>
              <div className="font-mono-tabular text-lg font-semibold text-[#15803D]">
                {alerts.filter((a) => a.status === 'Resolved').length}
              </div>
              <div className="text-xs text-slate-500">Resolved</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Configurable Leak Detection Thresholds
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Adjust sensitivity rules. Saving triggers immediate re-evaluation across stored readings.
          </p>

          {thresholdError && (
            <div className="mb-3 p-3 text-xs text-[#DC2626] bg-red-50 border border-red-200 rounded-md" role="alert">
              {thresholdError}
            </div>
          )}
          {thresholdSaved && (
            <div className="mb-3 p-3 text-xs text-[#15803D] bg-emerald-50 border border-emerald-200 rounded-md" role="status">
              {thresholdSaved}
            </div>
          )}

          <form onSubmit={handleSaveThresholds} noValidate className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="thresh-spike" className="block text-xs font-medium text-slate-700 mb-1">
                Surge Above Expected (%)
              </label>
              <input
                id="thresh-spike"
                type="number"
                step="1"
                value={spikePct}
                onChange={(e) => setSpikePct(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md font-mono-tabular"
              />
            </div>

            <div>
              <label htmlFor="thresh-high" className="block text-xs font-medium text-slate-700 mb-1">
                High-Risk Surge (%)
              </label>
              <input
                id="thresh-high"
                type="number"
                step="1"
                value={highRiskPct}
                onChange={(e) => setHighRiskPct(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md font-mono-tabular"
              />
            </div>

            <div>
              <label htmlFor="thresh-night" className="block text-xs font-medium text-slate-700 mb-1">
                Night Flow Limit (L/h)
              </label>
              <input
                id="thresh-night"
                type="number"
                step="0.5"
                value={nightFlowLph}
                onChange={(e) => setNightFlowLph(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md font-mono-tabular"
              />
            </div>

            <div>
              <label htmlFor="thresh-consec" className="block text-xs font-medium text-slate-700 mb-1">
                Consecutive Abnormal Days
              </label>
              <input
                id="thresh-consec"
                type="number"
                step="1"
                value={consecutiveDays}
                onChange={(e) => setConsecutiveDays(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md font-mono-tabular"
              />
            </div>

            <div>
              <label htmlFor="thresh-z" className="block text-xs font-medium text-slate-700 mb-1">
                Historical Outlier (Z-Score)
              </label>
              <input
                id="thresh-z"
                type="number"
                step="0.1"
                value={zThresh}
                onChange={(e) => setZThresh(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md font-mono-tabular"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] disabled:opacity-50 whitespace-nowrap"
              >
                {saving ? 'Applying...' : 'Apply & Re-Analyze'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Simulated Continuous Nighttime Flow Chart */}
      {recentNightFlow.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="mb-3">
            <h3 className="font-display text-base font-semibold text-[#0F172A]">
              Simulated Continuous Nighttime Flow (Last 45 Days)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Bars in crimson exceed your {settings.nightFlowThresholdLph} L/h overnight threshold, flagging suspected leakage.
            </p>
          </div>
          <ChartCanvas
            type="bar"
            data={nightFlowChartData as never}
            heightClass="h-56"
            testId="leaks-nightflow-chart"
            ariaLabel="Simulated continuous nighttime flow rate chart"
            options={{
              plugins: { legend: { position: 'top', align: 'end' } },
              scales: {
                y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                x: { grid: { display: false } },
              },
            }}
          />
        </section>
      )}

      {/* Alerts History & Investigation List */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Suspected Leak Alert History
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review explanation, expected vs actual consumption, and recommended investigation steps.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
            {(['all', 'Active', 'Acknowledged', 'Resolved'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No suspected leak alerts match the selected status filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className="p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-2 max-w-3xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <RiskIndicator level={alert.riskLevel} />
                    <span className="text-xs text-slate-400">·</span>
                    <span className="font-mono-tabular text-xs font-semibold text-[#0F172A]">
                      {alert.date}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs font-medium text-slate-700">{alert.ruleTriggered}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span
                      className={`text-xs font-semibold ${
                        alert.status === 'Resolved'
                          ? 'text-[#15803D]'
                          : alert.status === 'Acknowledged'
                          ? 'text-[#B45309]'
                          : 'text-[#DC2626]'
                      }`}
                    >
                      {alert.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
                    <span>
                      Actual:{' '}
                      <strong className="font-mono-tabular text-[#0F172A]">
                        {alert.actualLiters.toLocaleString()} L
                      </strong>
                    </span>
                    <span>
                      Expected:{' '}
                      <strong className="font-mono-tabular text-[#0F172A]">
                        {alert.expectedLiters.toLocaleString()} L
                      </strong>
                    </span>
                    <span>
                      Excess:{' '}
                      <strong className="font-mono-tabular text-[#DC2626]">
                        +{(alert.actualLiters - alert.expectedLiters).toFixed(1)} L
                      </strong>
                    </span>
                    <span>
                      Night Flow:{' '}
                      <strong className="font-mono-tabular text-[#0F172A]">
                        {alert.nightFlowLph.toFixed(1)} L/h
                      </strong>
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed">{alert.reason}</p>
                  <p className="text-xs text-slate-600">
                    <strong className="text-[#0F172A]">Recommended Action:</strong> {alert.recommendedAction}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'Active' && (
                    <button
                      type="button"
                      onClick={() => onUpdateAlertStatus(alert.id, 'Acknowledged')}
                      aria-label={`Acknowledge alert ${alert.date} (${alert.id})`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0F172A] bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Acknowledge</span>
                    </button>
                  )}
                  {alert.status !== 'Resolved' && (
                    <button
                      type="button"
                      onClick={() => onUpdateAlertStatus(alert.id, 'Resolved')}
                      aria-label={`Resolve alert ${alert.date} (${alert.id})`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] whitespace-nowrap"
                    >
                      <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Resolve</span>
                    </button>
                  )}
                  {alert.status === 'Resolved' && (
                    <button
                      type="button"
                      onClick={() => onUpdateAlertStatus(alert.id, 'Active')}
                      aria-label={`Reopen alert ${alert.date} (${alert.id})`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Reopen</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

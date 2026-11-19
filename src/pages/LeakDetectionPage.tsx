import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, RotateCcw } from 'lucide-react';
import { ChartCanvas } from '../components/ChartCanvas';
import { RiskIndicator } from '../components/RiskIndicator';
import { AlertStatus, UserSettings, WorkspacePayload } from '../types/api';
import {
  formatAlertHeadline,
  formatAlertSummary,
  formatHouseholdStatus,
} from '../utils/plainLanguage';

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
  const [pendingAlertId, setPendingAlertId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

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
          label: 'Overnight Flow (L/hour)',
          data: recentNightFlow.map((r) => r.nightFlowLph),
          backgroundColor: recentNightFlow.map((r) =>
            r.nightFlowLph >= settings.nightFlowThresholdLph ? '#DC2626' : '#0284C7'
          ),
          borderRadius: 3,
        },
        {
          label: `Normal Limit (${settings.nightFlowThresholdLph} L/hour)`,
          data: recentNightFlow.map(() => settings.nightFlowThresholdLph),
          type: 'line' as const,
          borderColor: '#D97706',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        },
      ],
    }),
    [recentNightFlow, settings.nightFlowThresholdLph]
  );

  const nightFlowChartOptions = useMemo(
    () => ({
      plugins: {
        legend: { position: 'top' as const, align: 'end' as const },
        tooltip: {
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
              `${ctx.dataset.label ?? 'Flow'}: ${(ctx.parsed.y ?? 0).toFixed(1)} L/h`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#EEF2F6' },
          ticks: {
            color: '#64748B',
            font: { family: '"IBM Plex Mono", monospace', size: 11 },
            callback: (val: string | number) => `${val} L/h`,
          },
        },
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: '#64748B',
            maxTicksLimit: 9,
            font: { family: '"IBM Plex Mono", monospace', size: 11 },
          },
        },
      },
    }),
    []
  );

  const statusText = formatHouseholdStatus(
    leakAnalysis.overallRiskLevel,
    leakAnalysis.activeAlertsCount
  );

  async function handleAlertAction(alertId: number, status: AlertStatus) {
    if (pendingAlertId === alertId) return;
    setActionError('');
    setPendingAlertId(alertId);
    try {
      await onUpdateAlertStatus(alertId, status);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update alert status.');
    } finally {
      setPendingAlertId(null);
    }
  }

  async function handleSaveThresholds(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setThresholdError('');
    setThresholdSaved('');

    const s = Number(spikePct);
    const h = Number(highRiskPct);
    const n = Number(nightFlowLph);
    const c = Number(consecutiveDays);
    const z = Number(zThresh);

    if (Number.isNaN(s) || s < 5 || s > 300) {
      setThresholdError('Daily spike alert % must be between 5% and 300%.');
      return;
    }
    if (Number.isNaN(h) || h <= s || h > 500) {
      setThresholdError('Urgent spike % must be higher than the daily spike % and up to 500%.');
      return;
    }
    if (Number.isNaN(n) || n < 1 || n > 500) {
      setThresholdError('Overnight flow limit must be between 1 and 500 L/hour.');
      return;
    }
    if (Number.isNaN(c) || c < 1 || c > 14) {
      setThresholdError('Consecutive days must be between 1 and 14.');
      return;
    }
    if (Number.isNaN(z) || z < 1 || z > 6) {
      setThresholdError('Unusual variation score must be between 1.0 and 6.0.');
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
      setThresholdSaved('Settings saved and water readings re-checked.');
    } catch (err) {
      setThresholdError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Overview Banner */}
      <section className="surface-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <RiskIndicator level={leakAnalysis.overallRiskLevel} plain />
            <span className="text-xs text-slate-300" aria-hidden="true">·</span>
            <span className="text-sm font-semibold text-[#0F172A]">{statusText.headline}</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{statusText.detail}</p>
        </div>

        <div className="flex items-center gap-6 text-xs shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <div>
            <span className="font-mono-tabular font-semibold text-lg text-[#DC2626]">
              {alerts.filter((a) => a.status === 'Active').length}
            </span>{' '}
            <span className="text-slate-500">Needs Check</span>
          </div>
          <div>
            <span className="font-mono-tabular font-semibold text-lg text-[#B45309]">
              {alerts.filter((a) => a.status === 'Acknowledged').length}
            </span>{' '}
            <span className="text-slate-500">Checked</span>
          </div>
          <div>
            <span className="font-mono-tabular font-semibold text-lg text-[#15803D]">
              {alerts.filter((a) => a.status === 'Resolved').length}
            </span>{' '}
            <span className="text-slate-500">Resolved</span>
          </div>
        </div>
      </section>

      {/* Plain-Language Alerts Triage Feed */}
      <section className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Possible Leak Alerts
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              These notices highlight unusual patterns that could be a leak — always confirm visually around your home.
            </p>
          </div>

          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
            {(
              [
                ['all', 'All'],
                ['Active', 'Needs Check'],
                ['Acknowledged', 'Checked'],
                ['Resolved', 'Resolved'],
              ] as const
            ).map(([status, label]) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-white text-[#0F172A] shadow-2xs'
                    : 'text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {actionError && (
          <div className="mx-6 mt-4 p-3 text-xs text-[#DC2626] bg-red-50/90 border border-red-200 rounded-md" role="alert">
            {actionError}
          </div>
        )}

        {filteredAlerts.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {readings.length === 0
              ? 'No water readings available to check yet.'
              : 'No alerts in this category.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <RiskIndicator level={alert.riskLevel} plain />
                    <span className="text-xs text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-xs font-medium text-slate-600">
                      {alert.date}
                    </span>
                    <span className="text-xs text-slate-300" aria-hidden="true">·</span>
                    <span
                      className={`text-xs font-medium ${
                        alert.status === 'Resolved'
                          ? 'text-[#15803D]'
                          : alert.status === 'Acknowledged'
                          ? 'text-[#B45309]'
                          : 'text-[#DC2626]'
                      }`}
                    >
                      {alert.status === 'Active'
                        ? 'Needs check'
                        : alert.status === 'Acknowledged'
                        ? 'Checked'
                        : 'Resolved'}
                    </span>
                  </div>

                  <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                    {formatAlertHeadline(alert)}
                  </h3>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    {formatAlertSummary(alert)}
                  </p>

                  <p className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-semibold text-[#0F172A]">What to do:</span>{' '}
                    {alert.recommendedAction}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {alert.status === 'Active' && (
                    <button
                      type="button"
                      disabled={pendingAlertId === alert.id}
                      onClick={() => handleAlertAction(alert.id, 'Acknowledged')}
                      aria-label={`Mark alert ${alert.date} (${alert.id}) as checked`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-2xs hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                      <span>{pendingAlertId === alert.id ? 'Updating...' : 'Mark as Checked'}</span>
                    </button>
                  )}
                  {alert.status !== 'Resolved' && (
                    <button
                      type="button"
                      disabled={pendingAlertId === alert.id}
                      onClick={() => handleAlertAction(alert.id, 'Resolved')}
                      aria-label={`Resolve alert ${alert.date} (${alert.id})`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0F766E] rounded-md shadow-xs hover:bg-[#0D625B] disabled:opacity-50 whitespace-nowrap"
                    >
                      <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Mark Fixed</span>
                    </button>
                  )}
                  {alert.status === 'Resolved' && (
                    <button
                      type="button"
                      disabled={pendingAlertId === alert.id}
                      onClick={() => handleAlertAction(alert.id, 'Active')}
                      aria-label={`Reopen alert ${alert.date} (${alert.id})`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md shadow-2xs hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
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

      {/* Overnight Flow Chart */}
      {recentNightFlow.length > 0 && (
        <section className="surface-card p-6">
          <div className="mb-4">
            <h3 className="font-display text-base font-semibold text-[#0F172A]">
              Overnight Water Flow (Last 45 Days)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Red bars show nights where water kept flowing above {settings.nightFlowThresholdLph} L/hour when taps are normally off.
            </p>
          </div>
          <ChartCanvas
            type="bar"
            data={nightFlowChartData as never}
            heightClass="h-60"
            testId="leaks-nightflow-chart"
            ariaLabel="Overnight water flow chart"
            options={nightFlowChartOptions}
          />
        </section>
      )}

      {/* Collapsible Sensitivity Settings */}
      <details className="surface-card p-6">
        <summary className="text-sm font-semibold text-[#0F172A] cursor-pointer select-none">
          Adjust leak detection sensitivity settings
        </summary>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Fine-tune how sensitive the system is before flagging a possible leak.
        </p>

        {thresholdError && (
          <div className="mb-3 p-3 text-xs text-[#DC2626] bg-red-50/90 border border-red-200 rounded-md" role="alert">
            {thresholdError}
          </div>
        )}
        {thresholdSaved && (
          <div className="mb-3 p-3 text-xs text-[#15803D] bg-emerald-50/90 border border-emerald-200 rounded-md" role="status">
            {thresholdSaved}
          </div>
        )}

        <form onSubmit={handleSaveThresholds} noValidate className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="thresh-spike" className="block text-xs font-medium text-slate-700 mb-1.5">
              Daily Spike Notice (% above usual)
            </label>
            <input
              id="thresh-spike"
              type="number"
              step="1"
              value={spikePct}
              onChange={(e) => setSpikePct(e.target.value)}
              className="field-input font-mono-tabular"
            />
          </div>

          <div>
            <label htmlFor="thresh-high" className="block text-xs font-medium text-slate-700 mb-1.5">
              Urgent Spike (% above usual)
            </label>
            <input
              id="thresh-high"
              type="number"
              step="1"
              value={highRiskPct}
              onChange={(e) => setHighRiskPct(e.target.value)}
              className="field-input font-mono-tabular"
            />
          </div>

          <div>
            <label htmlFor="thresh-night" className="block text-xs font-medium text-slate-700 mb-1.5">
              Overnight Flow Limit (L/hour)
            </label>
            <input
              id="thresh-night"
              type="number"
              step="0.5"
              value={nightFlowLph}
              onChange={(e) => setNightFlowLph(e.target.value)}
              className="field-input font-mono-tabular"
            />
          </div>

          <div>
            <label htmlFor="thresh-consec" className="block text-xs font-medium text-slate-700 mb-1.5">
              Repeated High-Use Days
            </label>
            <input
              id="thresh-consec"
              type="number"
              step="1"
              value={consecutiveDays}
              onChange={(e) => setConsecutiveDays(e.target.value)}
              className="field-input font-mono-tabular"
            />
          </div>

          <div>
            <label htmlFor="thresh-z" className="block text-xs font-medium text-slate-700 mb-1.5">
              Variation Sensitivity (Z-Score)
            </label>
            <input
              id="thresh-z"
              type="number"
              step="0.1"
              value={zThresh}
              onChange={(e) => setZThresh(e.target.value)}
              className="field-input font-mono-tabular"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md shadow-xs hover:bg-[#0D625B] disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? 'Updating...' : 'Save & Re-Check'}
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

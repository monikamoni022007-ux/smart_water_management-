import { useMemo, useState } from 'react';
import { ChartCanvas } from '../components/ChartCanvas';
import { ForecastMethodKey, WorkspacePayload } from '../types/api';

interface PredictionPageProps {
  workspace: WorkspacePayload;
  activeStrategy: ForecastMethodKey;
  activeHorizon: number;
  onChangePredictionConfig: (strategy: ForecastMethodKey, horizon: number) => Promise<void>;
}

export function PredictionPage({
  workspace,
  activeStrategy,
  activeHorizon,
  onChangePredictionConfig,
}: PredictionPageProps) {
  const { forecast } = workspace;
  const [updatingConfig, setUpdatingConfig] = useState(false);
  const [configError, setConfigError] = useState('');

  async function applyConfig(strategy: ForecastMethodKey, horizon: number) {
    if (updatingConfig) return;
    if (strategy === activeStrategy && horizon === activeHorizon) return;
    setConfigError('');
    setUpdatingConfig(true);
    try {
      await onChangePredictionConfig(strategy, horizon);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Could not update prediction settings.');
    } finally {
      setUpdatingConfig(false);
    }
  }

  const recentHistorical = useMemo(() => forecast.historical.slice(-45), [forecast.historical]);

  const combinedChartData = useMemo(() => {
    const labels = [
      ...recentHistorical.map((h) => h.date.slice(5)),
      ...forecast.future.map((f) => f.date.slice(5)),
    ];

    const actualSeries = [
      ...recentHistorical.map((h) => h.actualLiters),
      ...forecast.future.map(() => null),
    ];

    const predictedSeries = [
      ...recentHistorical.map((h) => h.predictedLiters),
      ...forecast.future.map((f) => f.predictedLiters),
    ];

    return {
      labels,
      datasets: [
        {
          label: 'Actual Water Used (L)',
          data: actualSeries,
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2, 132, 199, 0.06)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#0284C7',
          pointHoverBorderColor: '#FFFFFF',
          pointHoverBorderWidth: 2,
          tension: 0.25,
          spanGaps: false,
        },
        {
          label: 'Expected Usage (L)',
          data: predictedSeries,
          borderColor: '#0F766E',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#0F766E',
          pointHoverBorderColor: '#FFFFFF',
          pointHoverBorderWidth: 2,
          tension: 0.25,
        },
      ],
    };
  }, [recentHistorical, forecast.future]);

  const combinedChartOptions = useMemo(
    () => ({
      plugins: {
        legend: {
          position: 'top' as const,
          align: 'end' as const,
        },
        tooltip: {
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
              ctx.parsed.y === null
                ? ''
                : `${ctx.dataset.label ?? 'Usage'}: ${Math.round(ctx.parsed.y).toLocaleString()} L`,
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
            callback: (val: string | number) => `${val} L`,
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

  if (forecast.historical.length === 0) {
    return (
      <div className="surface-card p-10 text-center max-w-xl mx-auto mt-8">
        <h2 className="font-display text-lg font-semibold text-[#0F172A]">No Readings Available Yet</h2>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
          Add daily water readings or load sample data on the Water Usage page to generate household predictions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Outlook Summary & Controls */}
      <section className="surface-card p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex flex-wrap items-baseline gap-8">
            <div>
              <div className="text-xs font-medium text-slate-500">Expected Tomorrow</div>
              <div className="font-mono-tabular text-[26px] leading-tight font-semibold text-[#0F766E] mt-1 whitespace-nowrap">
                {forecast.nextDayPredictedLiters.toLocaleString()} L
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Expected Next {activeHorizon} Days</div>
              <div className="font-mono-tabular text-[26px] leading-tight font-semibold text-[#0F172A] mt-1 whitespace-nowrap">
                {Math.round(forecast.horizonTotalPredictedLiters).toLocaleString()} L
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Daily Trend</div>
              <div className="font-mono-tabular text-sm font-medium text-slate-700 mt-2 whitespace-nowrap">
                {forecast.slopeLitersPerDay >= 0 ? '+' : ''}
                {forecast.slopeLitersPerDay} L/day
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="block text-[11px] font-medium text-slate-500 mb-1.5">Prediction Method</span>
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md max-w-full">
                <button
                  type="button"
                  disabled={updatingConfig}
                  onClick={() => applyConfig('linear_regression', activeHorizon)}
                  className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap disabled:opacity-60 ${
                    activeStrategy === 'linear_regression'
                      ? 'bg-white text-[#0F172A] shadow-2xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  Trend Forecast (Linear Regression)
                </button>
                <button
                  type="button"
                  disabled={updatingConfig}
                  onClick={() => applyConfig('moving_average', activeHorizon)}
                  className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap disabled:opacity-60 ${
                    activeStrategy === 'moving_average'
                      ? 'bg-white text-[#0F172A] shadow-2xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  Recent Average (7-Day)
                </button>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-500 mb-1.5">Time Range</span>
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    disabled={updatingConfig}
                    onClick={() => applyConfig(activeStrategy, days)}
                    className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap disabled:opacity-60 ${
                      activeHorizon === days
                        ? 'bg-white text-[#0F172A] shadow-2xs'
                        : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {configError && (
          <div className="p-3 text-xs text-[#DC2626] bg-red-50/90 border border-red-200 rounded-md" role="alert">
            {configError}
          </div>
        )}
      </section>

      {/* Split Analytics Chart + Side-by-Side Forecast Table */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 surface-card p-6 flex flex-col">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Actual vs Expected Water Usage
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Blue shows past household usage; the dashed teal line shows estimated usage for past and upcoming days.
            </p>
          </div>
          <div className="flex-1 min-h-[280px]">
            <ChartCanvas
              type="line"
              data={combinedChartData}
              heightClass="h-80"
              testId="prediction-main-chart"
              ariaLabel="Actual versus expected water usage and forecast"
              options={combinedChartOptions}
            />
          </div>
        </div>

        <div className="lg:col-span-4 surface-card overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200/80">
            <h3 className="font-display text-base font-semibold text-[#0F172A]">
              Daily Estimates (Next {activeHorizon} Days)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Expected range based on past daily variation
            </p>
          </div>
          <div className="overflow-y-auto max-h-[340px] flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs">
                <tr className="border-b border-slate-200/80 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Expected</th>
                  <th className="py-2.5 px-4 text-right">Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {forecast.future.map((f) => (
                  <tr key={f.date} className="hover:bg-slate-50/70">
                    <td className="py-2 px-4 font-mono-tabular text-xs text-[#0F172A] whitespace-nowrap">
                      {f.date}
                    </td>
                    <td className="py-2 px-4 text-right font-mono-tabular font-semibold text-[#0F766E] whitespace-nowrap">
                      {f.predictedLiters.toLocaleString()} L
                    </td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs text-slate-500 whitespace-nowrap">
                      {Math.round(f.lowerBoundLiters)}–{Math.round(f.upperBoundLiters)} L
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Collapsible Plain-Language Calculation Notes */}
      <details className="surface-card p-5">
        <summary className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
          How is this prediction calculated?
        </summary>
        <div className="mt-3 space-y-2.5 text-xs text-slate-600 leading-relaxed">
          <p>{forecast.explanation}</p>
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-md font-mono-tabular text-[#0F172A]">
            {forecast.formulaSummary}
          </div>
          <p>
            Average error on past days: <span className="font-mono-tabular">{forecast.maeLiters} L</span> (MAE) ·{' '}
            Daily trend:{' '}
            <span className="font-mono-tabular">
              {forecast.slopeLitersPerDay >= 0 ? '+' : ''}
              {forecast.slopeLitersPerDay} L/day
            </span>
            {forecast.rSquared !== null ? ` · Fit R² = ${forecast.rSquared}` : ''}
          </p>
        </div>
      </details>
    </div>
  );
}

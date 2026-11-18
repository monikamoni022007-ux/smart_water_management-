import { useMemo } from 'react';
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

    const upperBand = [
      ...recentHistorical.map(() => null),
      ...forecast.future.map((f) => f.upperBoundLiters),
    ];

    const lowerBand = [
      ...recentHistorical.map(() => null),
      ...forecast.future.map((f) => f.lowerBoundLiters),
    ];

    return {
      labels,
      datasets: [
        {
          label: 'Actual Consumption (L)',
          data: actualSeries,
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
          spanGaps: false,
        },
        {
          label: 'Predicted / Forecast (L)',
          data: predictedSeries,
          borderColor: '#0F766E',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
        },
        {
          label: 'Upper Expected Range (L)',
          data: upperBand,
          borderColor: 'rgba(15, 118, 110, 0.25)',
          borderDash: [2, 2],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Lower Expected Range (L)',
          data: lowerBand,
          borderColor: 'rgba(15, 118, 110, 0.25)',
          backgroundColor: 'rgba(15, 118, 110, 0.08)',
          borderDash: [2, 2],
          borderWidth: 1,
          pointRadius: 0,
          fill: '-1',
        },
      ],
    };
  }, [recentHistorical, forecast.future]);

  if (forecast.historical.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <h2 className="font-display text-lg font-semibold text-[#0F172A]">No Data to Forecast</h2>
        <p className="text-sm text-slate-600 mt-1">
          Log readings or load sample data in Usage Monitoring to generate usage predictions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Strategy Pattern Controls */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Forecasting Engine & Strategy Selection
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Uses the OOAD Strategy Pattern (<span className="font-mono-tabular">UsagePredictor</span> +{' '}
              <span className="font-mono-tabular">Forecaster</span> interface) to swap forecasting algorithms dynamically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="block text-xs font-medium text-slate-600 mb-1">Forecasting Strategy</span>
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => onChangePredictionConfig('linear_regression', activeHorizon)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    activeStrategy === 'linear_regression'
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  Linear Regression (OLS)
                </button>
                <button
                  type="button"
                  onClick={() => onChangePredictionConfig('moving_average', activeHorizon)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    activeStrategy === 'moving_average'
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  7-Day Moving Average
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 mb-1">Forecast Horizon</span>
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => onChangePredictionConfig(activeStrategy, days)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      activeHorizon === days
                        ? 'bg-white text-[#0F172A] shadow-xs'
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
      </section>

      {/* Metrics Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Next Day Forecast</div>
          <div className="font-mono-tabular text-2xl font-semibold text-[#0F766E] mt-1.5">
            {forecast.nextDayPredictedLiters.toLocaleString()} L
          </div>
          <div className="text-xs text-slate-500 mt-1">Projected tomorrow</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">{activeHorizon}-Day Projected Total</div>
          <div className="font-mono-tabular text-2xl font-semibold text-[#0F172A] mt-1.5">
            {forecast.horizonTotalPredictedLiters.toLocaleString()} L
          </div>
          <div className="text-xs text-slate-500 mt-1">Cumulative forecast volume</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Model Error (MAE / RMSE)</div>
          <div className="font-mono-tabular text-2xl font-semibold text-[#0F172A] mt-1.5">
            {forecast.maeLiters} / {forecast.rmseLiters} L
          </div>
          <div className="text-xs text-slate-500 mt-1">Mean absolute & root sq error</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Daily Trend Slope</div>
          <div className="font-mono-tabular text-2xl font-semibold text-[#0284C7] mt-1.5">
            {forecast.slopeLitersPerDay >= 0 ? '+' : ''}
            {forecast.slopeLitersPerDay} L/d
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {forecast.rSquared !== null ? `R² = ${forecast.rSquared}` : 'Weighted trailing slope'}
          </div>
        </div>
      </section>

      {/* Main Forecast Chart */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="mb-4">
          <h3 className="font-display text-base font-semibold text-[#0F172A]">
            Historical Actual vs Predicted & {activeHorizon}-Day Forecast
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Solid blue line shows actual recorded consumption; dashed teal line shows calculated predictions and future range.
          </p>
        </div>
        <ChartCanvas
          type="line"
          data={combinedChartData}
          heightClass="h-80"
          testId="prediction-main-chart"
          ariaLabel="Historical actual versus predicted water usage and future forecast"
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

      {/* Methodology Explanation + Upcoming Forecast Table */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-[#0F172A]">
            How This Prediction Is Calculated
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">{forecast.explanation}</p>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs font-medium text-slate-500 mb-1">Active Formula</div>
            <div className="font-mono-tabular text-xs text-[#0F172A] break-words">
              {forecast.formulaSummary}
            </div>
          </div>
          <div className="text-xs text-slate-500 leading-relaxed">
            Outlier resistance: extreme leak spikes above the upper interquartile fence are dampened during model fitting so abnormal plumbing events do not artificially raise future baselines and mask recurring leaks.
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-display text-base font-semibold text-[#0F172A]">
              Upcoming {activeHorizon}-Day Forecast Schedule
            </h3>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Predicted (L)</th>
                  <th className="py-2.5 px-4 text-right">Expected Low (L)</th>
                  <th className="py-2.5 px-4 text-right">Expected High (L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {forecast.future.map((f) => (
                  <tr key={f.date} className="hover:bg-slate-50/60">
                    <td className="py-2 px-4 font-mono-tabular text-xs text-[#0F172A]">{f.date}</td>
                    <td className="py-2 px-4 text-right font-mono-tabular font-semibold text-[#0F766E]">
                      {f.predictedLiters.toLocaleString()} L
                    </td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs text-slate-600">
                      {f.lowerBoundLiters.toLocaleString()} L
                    </td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs text-slate-600">
                      {f.upperBoundLiters.toLocaleString()} L
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

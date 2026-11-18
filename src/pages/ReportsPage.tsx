import { useState } from 'react';
import { Download } from 'lucide-react';
import { RiskIndicator } from '../components/RiskIndicator';
import { WorkspacePayload } from '../types/api';
import { downloadCsvFile } from '../utils/apiClient';

interface ReportsPageProps {
  workspace: WorkspacePayload;
}

type ReportTab = 'daily' | 'weekly' | 'monthly' | 'forecast' | 'leaks' | 'conservation';

export function ReportsPage({ workspace }: ReportsPageProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('daily');

  const { readings, weekly, monthly, forecast, alerts, conservation, user } = workspace;

  function handleExportCsv() {
    const prefix = `aqualedger_${user.householdName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    if (activeTab === 'daily') {
      downloadCsvFile(
        `${prefix}_daily_usage.csv`,
        ['Date', 'Meter ID', 'Volume (L)', 'Night Flow (L/h)', 'Source', 'Notes'],
        readings.map((r) => [r.date, r.meterId, r.volumeLiters, r.nightFlowLph, r.source, r.notes])
      );
      return;
    }
    if (activeTab === 'weekly') {
      downloadCsvFile(
        `${prefix}_weekly_summary.csv`,
        ['ISO Week', 'Days Recorded', 'Total (L)', 'Avg Daily (L)', 'Min (L)', 'Max (L)'],
        weekly.map((w) => [w.period, w.readingCount, w.totalLiters, w.averageDailyLiters, w.minLiters, w.maxLiters])
      );
      return;
    }
    if (activeTab === 'monthly') {
      downloadCsvFile(
        `${prefix}_monthly_summary.csv`,
        ['Month', 'Days Recorded', 'Total (L)', 'Avg Daily (L)', 'Min (L)', 'Max (L)'],
        monthly.map((m) => [m.label, m.readingCount, m.totalLiters, m.averageDailyLiters, m.minLiters, m.maxLiters])
      );
      return;
    }
    if (activeTab === 'forecast') {
      downloadCsvFile(
        `${prefix}_predicted_vs_actual.csv`,
        ['Date', 'Actual (L)', 'Predicted (L)', 'Deviation (L)', 'Deviation (%)', 'Method'],
        forecast.historical.map((h) => [
          h.date,
          h.actualLiters,
          h.predictedLiters,
          h.deviationLiters,
          h.deviationPercent,
          forecast.methodName,
        ])
      );
      return;
    }
    if (activeTab === 'leaks') {
      downloadCsvFile(
        `${prefix}_leak_alert_history.csv`,
        ['Date', 'Risk Level', 'Rule Triggered', 'Expected (L)', 'Actual (L)', 'Night Flow (L/h)', 'Status', 'Reason'],
        alerts.map((a) => [
          a.date,
          a.riskLevel,
          a.ruleTriggered,
          a.expectedLiters,
          a.actualLiters,
          a.nightFlowLph,
          a.status,
          a.reason,
        ])
      );
      return;
    }
    downloadCsvFile(
      `${prefix}_conservation_report.csv`,
      ['Metric', 'Value'],
      [
        ['Household', user.householdName],
        ['Conservation Action', conservation.goal.actionLabel],
        ['Action Start Date', conservation.goal.actionStartDate],
        ['Daily Target (L)', conservation.goal.dailyTargetLiters],
        ['Monthly Limit (L)', conservation.goal.monthlyLimitLiters],
        ['Before Action Average (L/day)', conservation.beforeAvgLiters],
        ['After Action Average (L/day)', conservation.afterAvgLiters],
        ['Estimated Daily Savings (L/day)', conservation.estimatedDailySavingsLiters],
        ['Estimated Total Saved (L)', conservation.estimatedTotalSavedLiters],
        ['Target Adherence (%)', conservation.targetAdherencePercent],
      ]
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Analytics Reports & CSV Export
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select a report view below and download structured CSV records for {user.householdName}.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#0D625B] whitespace-nowrap self-start lg:self-auto"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Export Current Report (CSV)</span>
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md w-fit max-w-full overflow-x-auto">
        {(
          [
            ['daily', 'Daily Usage'],
            ['weekly', 'Weekly Summary'],
            ['monthly', 'Monthly Summary'],
            ['forecast', 'Predicted vs Actual'],
            ['leaks', 'Leak Alert History'],
            ['conservation', 'Conservation Report'],
          ] as Array<[ReportTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === id ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600 hover:text-[#0F172A]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {activeTab === 'daily' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Volume (L)</th>
                  <th className="py-2.5 px-4 text-right">Night Flow (L/h)</th>
                  <th className="py-2.5 px-4">Source</th>
                  <th className="py-2.5 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {[...readings].reverse().map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 px-4 font-mono-tabular text-xs">{r.date}</td>
                    <td className="py-2 px-4 text-right font-mono-tabular font-medium">{r.volumeLiters} L</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs">{r.nightFlowLph.toFixed(1)} L/h</td>
                    <td className="py-2 px-4 text-xs capitalize text-slate-600">{r.source}</td>
                    <td className="py-2 px-4 text-xs text-slate-600">{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'weekly' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">ISO Week</th>
                  <th className="py-2.5 px-4 text-right">Readings</th>
                  <th className="py-2.5 px-4 text-right">Total (L)</th>
                  <th className="py-2.5 px-4 text-right">Avg Daily (L)</th>
                  <th className="py-2.5 px-4 text-right">Min (L)</th>
                  <th className="py-2.5 px-4 text-right">Max (L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {[...weekly].reverse().map((w) => (
                  <tr key={w.period}>
                    <td className="py-2 px-4 font-mono-tabular text-xs font-medium">{w.period}</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs">{w.readingCount}</td>
                    <td className="py-2 px-4 text-right font-mono-tabular font-medium">{w.totalLiters.toLocaleString()} L</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs">{w.averageDailyLiters} L</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs text-slate-600">{w.minLiters} L</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs text-slate-600">{w.maxLiters} L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'monthly' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Month</th>
                  <th className="py-2.5 px-4 text-right">Readings</th>
                  <th className="py-2.5 px-4 text-right">Total (L)</th>
                  <th className="py-2.5 px-4 text-right">Avg Daily (L)</th>
                  <th className="py-2.5 px-4 text-right">Min (L)</th>
                  <th className="py-2.5 px-4 text-right">Max (L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {[...monthly].reverse().map((m) => (
                  <tr key={m.period}>
                    <td className="py-2 px-4 text-xs font-medium">{m.label}</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs">{m.readingCount}</td>
                    <td className="py-2 px-4 text-right font-mono-tabular font-medium">{m.totalLiters.toLocaleString()} L</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs">{m.averageDailyLiters} L</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs text-slate-600">{m.minLiters} L</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs text-slate-600">{m.maxLiters} L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'forecast' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Actual (L)</th>
                  <th className="py-2.5 px-4 text-right">Predicted (L)</th>
                  <th className="py-2.5 px-4 text-right">Deviation (L)</th>
                  <th className="py-2.5 px-4 text-right">Deviation (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {[...forecast.historical].reverse().map((h) => (
                  <tr key={h.date}>
                    <td className="py-2 px-4 font-mono-tabular text-xs">{h.date}</td>
                    <td className="py-2 px-4 text-right font-mono-tabular font-medium">{h.actualLiters} L</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs text-[#0F766E]">{h.predictedLiters} L</td>
                    <td
                      className={`py-2 px-4 text-right font-mono-tabular text-xs ${
                        h.deviationPercent > 25 ? 'text-[#DC2626] font-semibold' : 'text-slate-600'
                      }`}
                    >
                      {h.deviationLiters >= 0 ? '+' : ''}
                      {h.deviationLiters} L
                    </td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs">
                      {h.deviationPercent >= 0 ? '+' : ''}
                      {h.deviationPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'leaks' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Risk Level</th>
                  <th className="py-2.5 px-4">Rule Triggered</th>
                  <th className="py-2.5 px-4 text-right">Actual / Expected</th>
                  <th className="py-2.5 px-4 text-right">Night Flow</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 px-4 font-mono-tabular text-xs">{a.date}</td>
                    <td className="py-2 px-4">
                      <RiskIndicator level={a.riskLevel} />
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-700">{a.ruleTriggered}</td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs">
                      {a.actualLiters} / {a.expectedLiters} L
                    </td>
                    <td className="py-2 px-4 text-right font-mono-tabular text-xs">{a.nightFlowLph} L/h</td>
                    <td className="py-2 px-4 text-xs font-medium text-slate-700">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'conservation' && (
          <div className="p-6 space-y-4">
            <h3 className="font-display text-sm font-semibold text-[#0F172A]">
              Conservation Summary — {user.householdName}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="p-4 border border-slate-200 rounded-md">
                <div className="text-xs text-slate-500">Action Implemented</div>
                <div className="font-medium text-[#0F172A] mt-1">{conservation.goal.actionLabel}</div>
                <div className="text-xs text-slate-500 font-mono-tabular mt-1">
                  Started {conservation.goal.actionStartDate}
                </div>
              </div>
              <div className="p-4 border border-slate-200 rounded-md">
                <div className="text-xs text-slate-500">Before vs After Daily Average</div>
                <div className="font-mono-tabular font-semibold text-[#0F172A] mt-1">
                  {conservation.beforeAvgLiters} L/d → {conservation.afterAvgLiters} L/d
                </div>
                <div className="text-xs text-[#15803D] font-mono-tabular mt-1">
                  {conservation.estimatedDailySavingsLiters} L/day saved ({conservation.savingsPercent}%)
                </div>
              </div>
              <div className="p-4 border border-slate-200 rounded-md">
                <div className="text-xs text-slate-500">30-Day Target Adherence</div>
                <div className="font-mono-tabular font-semibold text-[#0F172A] mt-1">
                  {conservation.daysWithinDailyTarget} of {conservation.totalEvaluatedDays} days ({conservation.targetAdherencePercent}%)
                </div>
                <div className="text-xs text-slate-500 font-mono-tabular mt-1">
                  Total estimated saved: {conservation.estimatedTotalSavedLiters.toLocaleString()} L
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

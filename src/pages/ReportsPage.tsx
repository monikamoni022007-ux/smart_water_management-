import { useState } from 'react';
import { Download } from 'lucide-react';
import { RiskIndicator } from '../components/RiskIndicator';
import { WorkspacePayload } from '../types/api';
import { downloadCsvFile } from '../utils/apiClient';
import { formatAlertHeadline } from '../utils/plainLanguage';

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
        ['Date', 'Meter ID', 'Volume (L)', 'Overnight Flow (L/h)', 'Entry Type', 'Notes'],
        readings.map((r) => [r.date, r.meterId, r.volumeLiters, r.nightFlowLph, r.source, r.notes])
      );
      return;
    }
    if (activeTab === 'weekly') {
      downloadCsvFile(
        `${prefix}_weekly_summary.csv`,
        ['Week', 'Days Recorded', 'Total (L)', 'Avg Daily (L)', 'Min (L)', 'Max (L)'],
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
        `${prefix}_expected_vs_actual.csv`,
        ['Date', 'Actual (L)', 'Expected (L)', 'Difference (L)', 'Difference (%)'],
        forecast.historical.map((h) => [
          h.date,
          h.actualLiters,
          h.predictedLiters,
          h.deviationLiters,
          h.deviationPercent,
        ])
      );
      return;
    }
    if (activeTab === 'leaks') {
      downloadCsvFile(
        `${prefix}_leak_alerts.csv`,
        ['Date', 'Risk Level', 'Summary', 'Expected (L)', 'Actual (L)', 'Overnight Flow (L/h)', 'Status'],
        alerts.map((a) => [
          a.date,
          a.riskLevel,
          formatAlertHeadline(a),
          a.expectedLiters,
          a.actualLiters,
          a.nightFlowLph,
          a.status,
        ])
      );
      return;
    }
    downloadCsvFile(
      `${prefix}_conservation_report.csv`,
      ['Item', 'Value'],
      [
        ['Household', user.householdName],
        ['Change Made', conservation.goal.actionLabel],
        ['Started On', conservation.goal.actionStartDate],
        ['Daily Goal (L)', conservation.goal.dailyTargetLiters],
        ['Monthly Limit (L)', conservation.goal.monthlyLimitLiters],
        ['Before Average (L/day)', conservation.beforeAvgLiters],
        ['Current Average (L/day)', conservation.afterAvgLiters],
        ['Daily Savings (L/day)', conservation.estimatedDailySavingsLiters],
        ['Total Saved (L)', conservation.estimatedTotalSavedLiters],
      ]
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md w-fit max-w-full overflow-x-auto">
          {(
            [
              ['daily', 'Daily Usage'],
              ['weekly', 'Weekly'],
              ['monthly', 'Monthly'],
              ['forecast', 'Expected vs Actual'],
              ['leaks', 'Leak Alerts'],
              ['conservation', 'Conservation'],
            ] as Array<[ReportTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap ${
                activeTab === id
                  ? 'bg-white text-[#0F172A] shadow-2xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F766E] rounded-md shadow-xs hover:bg-[#0D625B] whitespace-nowrap self-start sm:self-auto"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Download CSV</span>
        </button>
      </div>

      <section className="surface-card overflow-hidden">
        {activeTab === 'daily' &&
          (readings.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No daily readings stored yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-5">Date</th>
                    <th className="py-2.5 px-5 text-right">Water Used</th>
                    <th className="py-2.5 px-5 text-right">Overnight Flow</th>
                    <th className="py-2.5 px-5">Entry Type</th>
                    <th className="py-2.5 px-5">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {[...readings].reverse().map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 font-mono-tabular text-xs">{r.date}</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular font-medium">{r.volumeLiters} L</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs">{r.nightFlowLph.toFixed(1)} L/h</td>
                      <td className="py-2.5 px-5 text-xs text-slate-600">
                        {r.source === 'manual' ? 'Added by you' : 'Sample data'}
                      </td>
                      <td className="py-2.5 px-5 text-xs text-slate-600">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {activeTab === 'weekly' &&
          (weekly.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No weekly summaries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-5">Week</th>
                    <th className="py-2.5 px-5 text-right">Days</th>
                    <th className="py-2.5 px-5 text-right">Total Used</th>
                    <th className="py-2.5 px-5 text-right">Daily Average</th>
                    <th className="py-2.5 px-5 text-right">Lowest Day</th>
                    <th className="py-2.5 px-5 text-right">Highest Day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {[...weekly].reverse().map((w) => (
                    <tr key={w.period} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 font-mono-tabular text-xs font-medium">{w.period}</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs">{w.readingCount}</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular font-medium">{w.totalLiters.toLocaleString()} L</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs">{w.averageDailyLiters} L</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs text-slate-600">{w.minLiters} L</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs text-slate-600">{w.maxLiters} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {activeTab === 'monthly' &&
          (monthly.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No monthly summaries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-5">Month</th>
                    <th className="py-2.5 px-5 text-right">Days</th>
                    <th className="py-2.5 px-5 text-right">Total Used</th>
                    <th className="py-2.5 px-5 text-right">Daily Average</th>
                    <th className="py-2.5 px-5 text-right">Lowest Day</th>
                    <th className="py-2.5 px-5 text-right">Highest Day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {[...monthly].reverse().map((m) => (
                    <tr key={m.period} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 text-xs font-medium">{m.label}</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs">{m.readingCount}</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular font-medium">{m.totalLiters.toLocaleString()} L</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs">{m.averageDailyLiters} L</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs text-slate-600">{m.minLiters} L</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs text-slate-600">{m.maxLiters} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {activeTab === 'forecast' &&
          (forecast.historical.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No prediction comparisons yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-5">Date</th>
                    <th className="py-2.5 px-5 text-right">Actual Used</th>
                    <th className="py-2.5 px-5 text-right">Expected</th>
                    <th className="py-2.5 px-5 text-right">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {[...forecast.historical].reverse().map((h) => (
                    <tr key={h.date} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 font-mono-tabular text-xs">{h.date}</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular font-medium">{h.actualLiters} L</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs text-[#0F766E]">{h.predictedLiters} L</td>
                      <td
                        className={`py-2.5 px-5 text-right font-mono-tabular text-xs ${
                          h.deviationPercent > 25 ? 'text-[#DC2626] font-semibold' : 'text-slate-600'
                        }`}
                      >
                        {h.deviationLiters >= 0 ? '+' : ''}
                        {h.deviationLiters} L ({h.deviationPercent >= 0 ? '+' : ''}
                        {h.deviationPercent}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {activeTab === 'leaks' &&
          (alerts.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No leak alerts have been triggered.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-5">Date</th>
                    <th className="py-2.5 px-5">Priority</th>
                    <th className="py-2.5 px-5">What Happened</th>
                    <th className="py-2.5 px-5 text-right">Used / Usual</th>
                    <th className="py-2.5 px-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {alerts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 font-mono-tabular text-xs">{a.date}</td>
                      <td className="py-2.5 px-5">
                        <RiskIndicator level={a.riskLevel} plain />
                      </td>
                      <td className="py-2.5 px-5 text-xs text-slate-700">{formatAlertHeadline(a)}</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-xs">
                        {a.actualLiters} / {a.expectedLiters} L
                      </td>
                      <td className="py-2.5 px-5 text-xs font-medium text-slate-700">
                        {a.status === 'Active' ? 'Needs check' : a.status === 'Acknowledged' ? 'Checked' : 'Resolved'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {activeTab === 'conservation' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 text-sm">
            <div className="p-6">
              <div className="text-xs font-medium text-slate-500">Change Made</div>
              <div className="font-semibold text-[#0F172A] mt-1.5 leading-snug">{conservation.goal.actionLabel}</div>
              <div className="text-xs text-slate-500 font-mono-tabular mt-1.5">
                Started {conservation.goal.actionStartDate}
              </div>
            </div>
            <div className="p-6">
              <div className="text-xs font-medium text-slate-500">Daily Average (Before → After)</div>
              <div className="font-mono-tabular font-semibold text-[#0F172A] mt-1.5">
                {conservation.beforeAvgLiters} L → {conservation.afterAvgLiters} L
              </div>
              <div className="text-xs text-[#15803D] font-mono-tabular mt-1.5">
                {conservation.estimatedDailySavingsLiters} L/day saved
              </div>
            </div>
            <div className="p-6">
              <div className="text-xs font-medium text-slate-500">Days Within Daily Goal</div>
              <div className="font-mono-tabular font-semibold text-[#0F172A] mt-1.5">
                {conservation.daysWithinDailyTarget} of {conservation.totalEvaluatedDays} days ({conservation.targetAdherencePercent}%)
              </div>
              <div className="text-xs text-slate-500 font-mono-tabular mt-1.5">
                Total saved: {conservation.estimatedTotalSavedLiters.toLocaleString()} L
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

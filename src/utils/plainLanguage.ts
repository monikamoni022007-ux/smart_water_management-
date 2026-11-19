import { AlertItem, AlertRiskLevel } from '../types/api';

export function formatAlertHeadline(alert: AlertItem): string {
  const rule = alert.ruleTriggered.toLowerCase();
  if (rule.includes('nighttime') && rule.includes('surge')) {
    return 'High water use and overnight flow detected';
  }
  if (rule.includes('nighttime')) {
    return 'Water kept running overnight';
  }
  if (rule.includes('surge')) {
    return 'Unusually high water use for the day';
  }
  if (rule.includes('sustained')) {
    return 'Water use stayed high for multiple days';
  }
  return 'Unusual water use pattern noticed';
}

export function formatAlertSummary(alert: AlertItem): string {
  const diff = Math.round(alert.actualLiters - alert.expectedLiters);
  const actual = Math.round(alert.actualLiters);
  const expected = Math.round(alert.expectedLiters);
  const parts: string[] = [];

  if (diff > 0) {
    parts.push(`Your home used ${actual} L, which is ${diff} L more than the usual ${expected} L.`);
  } else {
    parts.push(`Daily usage was ${actual} L (usual is around ${expected} L).`);
  }

  if (alert.nightFlowLph >= 10) {
    parts.push(
      `Overnight flow stayed at ${alert.nightFlowLph.toFixed(1)} L per hour when taps are normally off.`
    );
  }

  return `${parts.join(' ')} This suggests a possible leak.`;
}

export function formatAlertRiskLabel(level: AlertRiskLevel): string {
  switch (level) {
    case 'High Risk':
      return 'Needs urgent check';
    case 'Medium Risk':
      return 'Worth checking soon';
    case 'Low Risk':
      return 'Minor notice';
    default:
      return 'All normal';
  }
}

export function formatHouseholdStatus(
  overallRisk: AlertRiskLevel,
  activeCount: number
): { headline: string; detail: string } {
  if (activeCount === 0 || overallRisk === 'Normal') {
    return {
      headline: 'All normal',
      detail: 'No unusual water use or possible leaks detected recently.',
    };
  }
  if (overallRisk === 'High Risk') {
    return {
      headline: 'Check for a possible leak',
      detail: `${activeCount} active alert${activeCount === 1 ? '' : 's'} — high usage or overnight flow needs attention.`,
    };
  }
  return {
    headline: 'Possible leak notice',
    detail: `${activeCount} active alert${activeCount === 1 ? '' : 's'} — review recent overnight or high-usage days.`,
  };
}

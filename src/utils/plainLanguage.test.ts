import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAlertHeadline,
  formatAlertSummary,
  formatHouseholdStatus,
} from './plainLanguage';
import { AlertItem } from '../types/api';

const sampleAlert: AlertItem = {
  id: 1,
  userId: 1,
  date: '2026-11-15',
  riskLevel: 'Medium Risk',
  ruleTriggered: 'Continuous Nighttime Flow + Multi-Period Sustained Elevation',
  reason: 'Raw technical reason',
  expectedLiters: 347.3,
  actualLiters: 402,
  nightFlowLph: 15.4,
  recommendedAction: 'Check toilet cistern flapper valves.',
  status: 'Active',
  createdAt: '2026-11-15T00:00:00Z',
};

test('plainLanguage formats clear household alert text', () => {
  assert.equal(formatAlertHeadline(sampleAlert), 'Water kept running overnight');
  const summary = formatAlertSummary(sampleAlert);
  assert.ok(summary.includes('402 L'));
  assert.ok(summary.includes('possible leak'));
});

test('formatHouseholdStatus returns calm plain-English summary', () => {
  assert.equal(formatHouseholdStatus('Normal', 0).headline, 'All normal');
  assert.equal(formatHouseholdStatus('High Risk', 2).headline, 'Check for a possible leak');
});

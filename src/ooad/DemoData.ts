import { ReadingInput } from './Reading';

function addDays(dateStr: string, offsetDays: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Generates a 92-day deterministic dataset (no Math.random()) ending at anchorDate.
 * Contains:
 * - Realistic weekday vs weekend cadence (+16% weekends)
 * - Gradual upward drift in middle period before conservation measures
 * - Conservation improvement in the most recent 21 days
 * - Three distinct abnormal leak-simulation periods (sustained night flow, sudden daytime spike, multi-day elevation)
 */
export function generateDeterministicDemoDataset(anchorDate: string): ReadingInput[] {
  const totalDays = 92;
  const records: ReadingInput[] = [];

  for (let i = 0; i < totalDays; i++) {
    const daysAgo = totalDays - 1 - i;
    const date = addDays(anchorDate, -daysAgo);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;

    // Deterministic cyclical variation using sine wave
    const microWave = Math.sin(i * 0.72) * 11 + Math.cos(i * 0.31) * 7;

    // Gradual upward trend for days 0..69, then conservation drop for days 70..91
    let baseline = 298;
    if (i < 70) {
      baseline += i * 0.5;
    } else {
      // Conservation action implemented 22 days ago
      baseline = 278 - (i - 69) * 0.95;
      baseline = Math.max(baseline, 248);
    }

    const weekendBoost = isWeekend ? 44 : 0;
    let volumeLiters = baseline + weekendBoost + microWave;
    let nightFlowLph = 2.2 + ((i * 7) % 13) * 0.2;
    let notes = isWeekend ? 'Weekend laundry & garden routine' : 'Normal household daily flow';

    // Abnormal Period 1: Continuous nighttime flow leak (daysAgo 44..42)
    if (daysAgo === 44) {
      volumeLiters += 115;
      nightFlowLph = 18.5;
      notes = 'Simulated night-flow leak onset (cistern trickle)';
    } else if (daysAgo === 43) {
      volumeLiters += 145;
      nightFlowLph = 23.2;
      notes = 'Simulated continuous night flow (unrepaired valve)';
    } else if (daysAgo === 42) {
      volumeLiters += 98;
      nightFlowLph = 15.8;
      notes = 'Simulated night-flow leak prior to valve shutoff';
    }

    // Abnormal Period 2: Sudden high-volume burst/irrigation spike (daysAgo 26, prior to conservation upgrades)
    if (daysAgo === 26) {
      volumeLiters = 562;
      nightFlowLph = 8.4;
      notes = 'Simulated sudden daytime surge (stuck outdoor valve)';
    }

    // Abnormal Period 3: Recent moderate multi-day abnormal elevation (daysAgo 4..3)
    if (daysAgo === 4) {
      volumeLiters = 388;
      nightFlowLph = 14.2;
      notes = 'Simulated overnight trickle + elevated morning flow';
    } else if (daysAgo === 3) {
      volumeLiters = 402;
      nightFlowLph = 15.4;
      notes = 'Simulated consecutive elevated period';
    }

    records.push({
      date,
      volumeLiters: Number(volumeLiters.toFixed(1)),
      nightFlowLph: Number(nightFlowLph.toFixed(1)),
      source: 'demo',
      notes,
    });
  }

  return records;
}

export function generateSecondaryApartmentDataset(anchorDate: string): ReadingInput[] {
  const totalDays = 14;
  const records: ReadingInput[] = [];
  for (let i = 0; i < totalDays; i++) {
    const daysAgo = totalDays - 1 - i;
    const date = addDays(anchorDate, -daysAgo);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const wave = Math.sin(i * 0.8) * 9;
    const volumeLiters = 178 + (isWeekend ? 26 : 0) + wave;
    const nightFlowLph = 1.8 + (i % 4) * 0.3;
    records.push({
      date,
      volumeLiters: Number(volumeLiters.toFixed(1)),
      nightFlowLph: Number(nightFlowLph.toFixed(1)),
      source: 'demo',
      notes: isWeekend ? 'Weekend apartment usage' : 'Standard weekday usage',
    });
  }
  return records;
}

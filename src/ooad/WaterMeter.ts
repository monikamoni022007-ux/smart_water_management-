import { DataSource, Reading } from './Reading';
import { FlowSensor, Sensor } from './Sensor';

export interface AggregatedPeriod {
  period: string;
  label: string;
  totalLiters: number;
  averageDailyLiters: number;
  readingCount: number;
  maxLiters: number;
  minLiters: number;
}

export interface UsageSummaryMetrics {
  totalReadings: number;
  latestDate: string | null;
  todayLiters: number;
  averageDailyLiters: number;
  sevenDayAverageLiters: number;
  thirtyDayAverageLiters: number;
  weekdayAverageLiters: number;
  weekendAverageLiters: number;
  stdDevLiters: number;
  totalVolumeLiters: number;
}

export class WaterMeter {
  public readonly meterId: string;
  public readonly userId: number;
  private readonly sensor: Sensor;
  private readings: Reading[];

  constructor(meterId: string, userId: number, sensor?: Sensor, initialReadings: Reading[] = []) {
    this.meterId = meterId;
    this.userId = userId;
    this.sensor = sensor ?? new FlowSensor(`FS-${meterId}`);
    this.readings = [...initialReadings].sort((a, b) => a.date.localeCompare(b.date));
  }

  public getSensor(): Sensor {
    return this.sensor;
  }

  public getReadings(): Reading[] {
    return [...this.readings];
  }

  public recordUsage(params: {
    id: number;
    date: string;
    volumeLiters: number;
    nightFlowLph: number;
    source: DataSource;
    notes?: string;
  }): Reading {
    const reading = this.sensor.captureReading({
      id: params.id,
      userId: this.userId,
      meterId: this.meterId,
      date: params.date,
      volumeLiters: params.volumeLiters,
      nightFlowLph: params.nightFlowLph,
      source: params.source,
      notes: params.notes,
    });
    this.readings.push(reading);
    this.readings.sort((a, b) => a.date.localeCompare(b.date));
    return reading;
  }

  public getSummaryMetrics(): UsageSummaryMetrics {
    if (this.readings.length === 0) {
      return {
        totalReadings: 0,
        latestDate: null,
        todayLiters: 0,
        averageDailyLiters: 0,
        sevenDayAverageLiters: 0,
        thirtyDayAverageLiters: 0,
        weekdayAverageLiters: 0,
        weekendAverageLiters: 0,
        stdDevLiters: 0,
        totalVolumeLiters: 0,
      };
    }

    const sorted = [...this.readings].sort((a, b) => a.date.localeCompare(b.date));
    const totalVolumeLiters = sorted.reduce((acc, r) => acc + r.volumeLiters, 0);
    const averageDailyLiters = totalVolumeLiters / sorted.length;

    const latest = sorted[sorted.length - 1];
    const last7 = sorted.slice(-7);
    const last30 = sorted.slice(-30);

    const weekdays = sorted.filter((r) => !r.isWeekend());
    const weekends = sorted.filter((r) => r.isWeekend());

    const variance =
      sorted.reduce((acc, r) => acc + Math.pow(r.volumeLiters - averageDailyLiters, 2), 0) / sorted.length;

    return {
      totalReadings: sorted.length,
      latestDate: latest.date,
      todayLiters: Number(latest.volumeLiters.toFixed(1)),
      averageDailyLiters: Number(averageDailyLiters.toFixed(1)),
      sevenDayAverageLiters: Number(
        (last7.reduce((acc, r) => acc + r.volumeLiters, 0) / last7.length).toFixed(1)
      ),
      thirtyDayAverageLiters: Number(
        (last30.reduce((acc, r) => acc + r.volumeLiters, 0) / last30.length).toFixed(1)
      ),
      weekdayAverageLiters:
        weekdays.length > 0
          ? Number((weekdays.reduce((acc, r) => acc + r.volumeLiters, 0) / weekdays.length).toFixed(1))
          : 0,
      weekendAverageLiters:
        weekends.length > 0
          ? Number((weekends.reduce((acc, r) => acc + r.volumeLiters, 0) / weekends.length).toFixed(1))
          : 0,
      stdDevLiters: Number(Math.sqrt(variance).toFixed(1)),
      totalVolumeLiters: Number(totalVolumeLiters.toFixed(1)),
    };
  }

  public getWeeklyAggregation(): AggregatedPeriod[] {
    const groups = new Map<string, Reading[]>();
    for (const reading of this.readings) {
      const weekKey = getISOWeekKey(reading.date);
      const list = groups.get(weekKey) ?? [];
      list.push(reading);
      groups.set(weekKey, list);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, items]) => {
        const total = items.reduce((s, r) => s + r.volumeLiters, 0);
        const vols = items.map((r) => r.volumeLiters);
        return {
          period,
          label: period,
          totalLiters: Number(total.toFixed(1)),
          averageDailyLiters: Number((total / items.length).toFixed(1)),
          readingCount: items.length,
          maxLiters: Math.max(...vols),
          minLiters: Math.min(...vols),
        };
      });
  }

  public getMonthlyAggregation(): AggregatedPeriod[] {
    const groups = new Map<string, Reading[]>();
    for (const reading of this.readings) {
      const monthKey = reading.date.slice(0, 7);
      const list = groups.get(monthKey) ?? [];
      list.push(reading);
      groups.set(monthKey, list);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, items]) => {
        const total = items.reduce((s, r) => s + r.volumeLiters, 0);
        const vols = items.map((r) => r.volumeLiters);
        const [y, m] = period.split('-');
        const monthDate = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
        const label = monthDate.toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
        return {
          period,
          label,
          totalLiters: Number(total.toFixed(1)),
          averageDailyLiters: Number((total / items.length).toFixed(1)),
          readingCount: items.length,
          maxLiters: Math.max(...vols),
          minLiters: Math.min(...vols),
        };
      });
  }
}

function getISOWeekKey(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

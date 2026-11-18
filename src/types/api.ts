export type DataSource = 'demo' | 'manual';
export type ForecastMethodKey = 'linear_regression' | 'moving_average';
export type AlertRiskLevel = 'Normal' | 'Low Risk' | 'Medium Risk' | 'High Risk';
export type AlertStatus = 'Active' | 'Acknowledged' | 'Resolved';

export interface UserAccount {
  id: number;
  name: string;
  email: string;
  householdName: string;
  householdSize: number;
  createdAt: string;
}

export interface ReadingItem {
  id: number;
  userId: number;
  meterId: string;
  date: string;
  volumeLiters: number;
  nightFlowLph: number;
  source: DataSource;
  notes: string;
  createdAt: string;
}

export interface AlertItem {
  id: number;
  userId: number;
  date: string;
  riskLevel: AlertRiskLevel;
  ruleTriggered: string;
  reason: string;
  expectedLiters: number;
  actualLiters: number;
  nightFlowLph: number;
  recommendedAction: string;
  status: AlertStatus;
  createdAt: string;
}

export interface AggregatedPeriod {
  period: string;
  label: string;
  totalLiters: number;
  averageDailyLiters: number;
  readingCount: number;
  maxLiters: number;
  minLiters: number;
}

export interface HistoricalComparisonPoint {
  date: string;
  actualLiters: number;
  predictedLiters: number;
  deviationLiters: number;
  deviationPercent: number;
  source: DataSource;
}

export interface FutureForecastPoint {
  date: string;
  predictedLiters: number;
  lowerBoundLiters: number;
  upperBoundLiters: number;
}

export interface ForecastResult {
  methodKey: ForecastMethodKey;
  methodName: string;
  explanation: string;
  formulaSummary: string;
  historical: HistoricalComparisonPoint[];
  future: FutureForecastPoint[];
  nextDayPredictedLiters: number;
  horizonTotalPredictedLiters: number;
  maeLiters: number;
  rmseLiters: number;
  slopeLitersPerDay: number;
  rSquared: number | null;
}

export interface ConservationGoal {
  id?: number;
  userId: number;
  dailyTargetLiters: number;
  monthlyLimitLiters: number;
  baselineDailyLiters: number;
  actionStartDate: string;
  actionLabel: string;
}

export interface ConservationRecommendation {
  id: string;
  title: string;
  category: 'Fixture' | 'Behavior' | 'Night Flow' | 'Outdoor';
  estimatedDailySavingsLiters: number;
  rationale: string;
}

export interface ConservationProgress {
  goal: ConservationGoal;
  currentAvgDailyLiters: number;
  recentThirtyDayTotalLiters: number;
  monthlyLimitRemainingLiters: number;
  monthlyLimitUtilizationPercent: number;
  daysWithinDailyTarget: number;
  totalEvaluatedDays: number;
  targetAdherencePercent: number;
  beforeAvgLiters: number;
  afterAvgLiters: number;
  estimatedDailySavingsLiters: number;
  estimatedTotalSavedLiters: number;
  savingsPercent: number;
  statusLabel: 'On Track' | 'Needs Attention' | 'Over Limit';
  recommendations: ConservationRecommendation[];
}

export interface UserSettings {
  userId: number;
  forecastStrategy: ForecastMethodKey;
  forecastHorizonDays: number;
  spikePercentThreshold: number;
  highRiskPercentThreshold: number;
  nightFlowThresholdLph: number;
  consecutiveAbnormalDays: number;
  historicalZThreshold: number;
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

export interface WorkspacePayload {
  user: UserAccount;
  meterId: string;
  sensorInfo: {
    sensorId: string;
    location: string;
    pipeDiameterMm: number;
    unit: string;
  };
  settings: UserSettings;
  summary: UsageSummaryMetrics;
  readings: ReadingItem[];
  weekly: AggregatedPeriod[];
  monthly: AggregatedPeriod[];
  forecast: ForecastResult;
  leakAnalysis: {
    overallRiskLevel: AlertRiskLevel;
    activeAlertsCount: number;
    lastAnalyzedDate: string | null;
  };
  alerts: AlertItem[];
  conservation: ConservationProgress;
}

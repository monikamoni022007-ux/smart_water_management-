import {
  Forecaster,
  ForecastMethodKey,
  ForecastResult,
  LinearRegressionForecaster,
  MovingAverageForecaster,
} from './Forecaster';
import { Reading } from './Reading';

/**
 * Context class in the Strategy Pattern.
 * Delegates forecasting calculations to an interchangeable Forecaster implementation.
 */
export class UsagePredictor {
  private strategy: Forecaster;

  constructor(strategy?: Forecaster) {
    this.strategy = strategy ?? new LinearRegressionForecaster();
  }

  public static createStrategy(methodKey: ForecastMethodKey): Forecaster {
    if (methodKey === 'moving_average') {
      return new MovingAverageForecaster(7);
    }
    return new LinearRegressionForecaster();
  }

  public setStrategy(strategy: Forecaster): void {
    this.strategy = strategy;
  }

  public getStrategy(): Forecaster {
    return this.strategy;
  }

  public predict(readings: Reading[], horizonDays = 14): ForecastResult {
    const safeHorizon = Math.max(1, Math.min(90, Math.round(horizonDays)));
    return this.strategy.fitAndPredict(readings, safeHorizon);
  }
}

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, timedelta
import math
from typing import Dict, List, Optional

try:
    import numpy as np
    import pandas as pd
    from sklearn.linear_model import LinearRegression as SkLinearRegression
    HAS_ML_LIBS = True
except ImportError:
    HAS_ML_LIBS = False

from models.domain import Reading


class Forecaster(ABC):
    """Strategy interface for interchangeable water usage forecasting methods."""

    method_key: str
    name: str

    @abstractmethod
    def explain(self) -> str:
        pass

    @abstractmethod
    def fit_and_predict(self, readings: List[Reading], horizon_days: int) -> Dict:
        pass


def _compute_errors(historical: List[Dict]) -> Dict[str, float]:
    if not historical:
        return {"mae": 0.0, "rmse": 0.0}
    abs_err = sum(abs(p["actual_liters"] - p["predicted_liters"]) for p in historical)
    sq_err = sum((p["actual_liters"] - p["predicted_liters"]) ** 2 for p in historical)
    return {
        "mae": round(abs_err / len(historical), 1),
        "rmse": round(math.sqrt(sq_err / len(historical)), 1),
    }


class LinearRegressionForecaster(Forecaster):
    method_key = "linear_regression"
    name = "Linear Regression (OLS + Weekly Seasonality)"

    def explain(self) -> str:
        return (
            "Fits an Ordinary Least Squares (OLS) trend line y = m*x + b across chronological daily readings "
            "using IQR outlier dampening, then applies day-of-week seasonal multipliers computed from "
            "historical weekday versus weekend consumption."
        )

    def fit_and_predict(self, readings: List[Reading], horizon_days: int) -> Dict:
        sorted_r = sorted(readings, key=lambda r: r.date)
        if not sorted_r:
            return {
                "method_key": self.method_key,
                "method_name": self.name,
                "explanation": self.explain(),
                "formula_summary": "Insufficient readings to fit regression model.",
                "historical": [],
                "future": [],
                "next_day_predicted_liters": 0.0,
                "horizon_total_predicted_liters": 0.0,
                "mae_liters": 0.0,
                "rmse_liters": 0.0,
                "slope_liters_per_day": 0.0,
                "r_squared": None,
            }

        if len(sorted_r) == 1:
            only = sorted_r[0]
            last_dt = date.fromisoformat(only.date)
            historical = [{
                "date": only.date,
                "actual_liters": only.volume_liters,
                "predicted_liters": only.volume_liters,
                "deviation_liters": 0.0,
                "deviation_percent": 0.0,
                "source": only.source,
            }]
            future = [{
                "date": (last_dt + timedelta(days=i + 1)).isoformat(),
                "predicted_liters": only.volume_liters,
                "lower_bound_liters": round(only.volume_liters * 0.9, 1),
                "upper_bound_liters": round(only.volume_liters * 1.1, 1),
            } for i in range(horizon_days)]
            return {
                "method_key": self.method_key,
                "method_name": self.name,
                "explanation": self.explain(),
                "formula_summary": f"y = {only.volume_liters:.1f} L (single baseline reading)",
                "historical": historical,
                "future": future,
                "next_day_predicted_liters": only.volume_liters,
                "horizon_total_predicted_liters": round(only.volume_liters * horizon_days, 1),
                "mae_liters": 0.0,
                "rmse_liters": 0.0,
                "slope_liters_per_day": 0.0,
                "r_squared": None,
            }

        vols = sorted(r.volume_liters for r in sorted_r)
        q1 = vols[int(len(vols) * 0.25)]
        q3 = vols[int(len(vols) * 0.75)]
        iqr = max(q3 - q1, 1.0)
        upper_fence = q3 + 1.5 * iqr
        y_fit = [min(r.volume_liters, upper_fence) for r in sorted_r]
        n = len(sorted_r)

        if HAS_ML_LIBS:
            x_arr = np.arange(n).reshape(-1, 1)
            y_arr = np.array(y_fit, dtype=float)
            model = SkLinearRegression()
            model.fit(x_arr, y_arr)
            slope = float(model.coef_[0])
            intercept = float(model.intercept_)
        else:
            x_vals = list(range(n))
            mean_x = sum(x_vals) / n
            mean_y = sum(y_fit) / n
            num = sum((x_vals[i] - mean_x) * (y_fit[i] - mean_y) for i in range(n))
            den = sum((x_vals[i] - mean_x) ** 2 for i in range(n))
            slope = 0.0 if den == 0 else num / den
            intercept = mean_y - slope * mean_x

        dow_buckets: List[List[float]] = [[] for _ in range(7)]
        for i, r in enumerate(sorted_r):
            base = max(intercept + slope * i, 1.0)
            dow_buckets[r.day_of_week()].append(y_fit[i] / base)

        dow_factor = [
            min(max(sum(b) / len(b), 0.8), 1.25) if b else 1.0
            for b in dow_buckets
        ]

        historical: List[Dict] = []
        for i, r in enumerate(sorted_r):
            trend = max(intercept + slope * i, 10.0)
            predicted = round(trend * dow_factor[r.day_of_week()], 1)
            dev = round(r.volume_liters - predicted, 1)
            dev_pct = round((dev / predicted) * 100.0, 1) if predicted > 0 else 0.0
            historical.append({
                "date": r.date,
                "actual_liters": r.volume_liters,
                "predicted_liters": predicted,
                "deviation_liters": dev,
                "deviation_percent": dev_pct,
                "source": r.source,
            })

        errs = _compute_errors(historical)
        mean_y = sum(y_fit) / n
        ss_tot = sum((y_fit[i] - mean_y) ** 2 for i in range(n))
        ss_res = sum(
            (y_fit[i] - max(intercept + slope * i, 10.0) * dow_factor[sorted_r[i].day_of_week()]) ** 2
            for i in range(n)
        )
        r_squared: Optional[float] = round(max(0.0, 1.0 - ss_res / ss_tot), 3) if ss_tot > 0 else None

        last_dt = date.fromisoformat(sorted_r[-1].date)
        band = max(errs["rmse"] * 1.28, mean_y * 0.08)
        future: List[Dict] = []
        for step in range(1, horizon_days + 1):
            f_dt = last_dt + timedelta(days=step)
            dow = (f_dt.weekday() + 1) % 7
            trend = max(intercept + slope * (n - 1 + step), 20.0)
            predicted = round(trend * dow_factor[dow], 1)
            future.append({
                "date": f_dt.isoformat(),
                "predicted_liters": predicted,
                "lower_bound_liters": round(max(0.0, predicted - band), 1),
                "upper_bound_liters": round(predicted + band, 1),
            })

        return {
            "method_key": self.method_key,
            "method_name": self.name,
            "explanation": self.explain(),
            "formula_summary": f"y = ({slope:+.2f} * dayIndex + {intercept:.1f}) * DOW_Factor",
            "historical": historical,
            "future": future,
            "next_day_predicted_liters": future[0]["predicted_liters"] if future else 0.0,
            "horizon_total_predicted_liters": round(sum(f["predicted_liters"] for f in future), 1),
            "mae_liters": errs["mae"],
            "rmse_liters": errs["rmse"],
            "slope_liters_per_day": round(slope, 2),
            "r_squared": r_squared,
        }


class MovingAverageForecaster(Forecaster):
    method_key = "moving_average"

    def __init__(self, window_size: int = 7) -> None:
        self.window_size = window_size
        self.name = f"{window_size}-Day Moving Average"

    def explain(self) -> str:
        return (
            f"Computes the weighted rolling {self.window_size}-day average of preceding consumption "
            "using Pandas/NumPy dampening on extreme outliers so isolated spikes do not distort baseline expectations."
        )

    def fit_and_predict(self, readings: List[Reading], horizon_days: int) -> Dict:
        sorted_r = sorted(readings, key=lambda r: r.date)
        if not sorted_r:
            return {
                "method_key": self.method_key,
                "method_name": self.name,
                "explanation": self.explain(),
                "formula_summary": "Insufficient readings for moving average.",
                "historical": [],
                "future": [],
                "next_day_predicted_liters": 0.0,
                "horizon_total_predicted_liters": 0.0,
                "mae_liters": 0.0,
                "rmse_liters": 0.0,
                "slope_liters_per_day": 0.0,
                "r_squared": None,
            }

        vols = [r.volume_liters for r in sorted_r]
        if HAS_ML_LIBS:
            series = pd.Series(vols, dtype=float)
            median = float(series.median())
            dampened = series.apply(lambda v: median * 1.25 if v > median * 1.45 else v).tolist()
        else:
            sorted_v = sorted(vols)
            median = sorted_v[len(sorted_v) // 2]
            dampened = [median * 1.25 if v > median * 1.45 else v for v in vols]

        historical: List[Dict] = []
        for idx, r in enumerate(sorted_r):
            if idx == 0:
                predicted = r.volume_liters
            else:
                start = max(0, idx - self.window_size)
                window = dampened[start:idx]
                w_sum = sum(window[j] * (j + 1) for j in range(len(window)))
                w_tot = sum(j + 1 for j in range(len(window)))
                predicted = round(w_sum / w_tot, 1)
            dev = round(r.volume_liters - predicted, 1)
            dev_pct = round((dev / predicted) * 100.0, 1) if predicted > 0 else 0.0
            historical.append({
                "date": r.date,
                "actual_liters": r.volume_liters,
                "predicted_liters": predicted,
                "deviation_liters": dev,
                "deviation_percent": dev_pct,
                "source": r.source,
            })

        errs = _compute_errors(historical)
        tail = dampened[-self.window_size:]
        tail_w_sum = sum(tail[j] * (j + 1) for j in range(len(tail)))
        tail_w_tot = sum(j + 1 for j in range(len(tail)))
        base_next = tail_w_sum / tail_w_tot if tail_w_tot > 0 else sorted_r[-1].volume_liters

        prev_window = dampened[-self.window_size * 2:-self.window_size]
        prev_avg = sum(prev_window) / len(prev_window) if prev_window else base_next
        recent_avg = sum(tail) / len(tail)
        daily_drift = round((recent_avg - prev_avg) / self.window_size, 2)

        last_dt = date.fromisoformat(sorted_r[-1].date)
        band = max(errs["rmse"] * 1.28, base_next * 0.08)
        future: List[Dict] = []
        for step in range(1, horizon_days + 1):
            predicted = round(max(20.0, base_next + daily_drift * step * 0.35), 1)
            future.append({
                "date": (last_dt + timedelta(days=step)).isoformat(),
                "predicted_liters": predicted,
                "lower_bound_liters": round(max(0.0, predicted - band), 1),
                "upper_bound_liters": round(predicted + band, 1),
            })

        return {
            "method_key": self.method_key,
            "method_name": self.name,
            "explanation": self.explain(),
            "formula_summary": f"MA_{self.window_size}(t) = sum(w_i * y_{{t-i}}) / sum(w_i) (base = {base_next:.1f} L/d)",
            "historical": historical,
            "future": future,
            "next_day_predicted_liters": future[0]["predicted_liters"] if future else 0.0,
            "horizon_total_predicted_liters": round(sum(f["predicted_liters"] for f in future), 1),
            "mae_liters": errs["mae"],
            "rmse_liters": errs["rmse"],
            "slope_liters_per_day": daily_drift,
            "r_squared": None,
        }


class UsagePredictor:
    """Strategy Pattern context delegating forecast logic to a Forecaster."""

    def __init__(self, strategy: Optional[Forecaster] = None) -> None:
        self._strategy: Forecaster = strategy or LinearRegressionForecaster()

    @staticmethod
    def create_strategy(method_key: str) -> Forecaster:
        if method_key == "moving_average":
            return MovingAverageForecaster(7)
        return LinearRegressionForecaster()

    def set_strategy(self, strategy: Forecaster) -> None:
        self._strategy = strategy

    def get_strategy(self) -> Forecaster:
        return self._strategy

    def predict(self, readings: List[Reading], horizon_days: int = 14) -> Dict:
        safe_horizon = max(1, min(90, int(horizon_days)))
        return self._strategy.fit_and_predict(readings, safe_horizon)

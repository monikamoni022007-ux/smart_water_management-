from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Dict, List

from models.domain import Alert, AlertObserver, Reading


@dataclass
class LeakThresholds:
    spike_percent_threshold: float = 30.0
    high_risk_percent_threshold: float = 60.0
    night_flow_threshold_lph: float = 12.0
    consecutive_abnormal_days: int = 2
    historical_z_threshold: float = 2.0


class AlertCollectorObserver(AlertObserver):
    def __init__(self) -> None:
        self.collected: List[Alert] = []

    def update(self, alert: Alert) -> None:
        self.collected.append(alert)


class LeakDetector:
    """Subject (Observable) in the Observer Pattern for Possible Leak analysis."""

    def __init__(self, thresholds: Optional[LeakThresholds] = None) -> None:
        self._observers: List[AlertObserver] = []
        self.thresholds = thresholds or LeakThresholds()

    def attach(self, observer: AlertObserver) -> None:
        if observer not in self._observers:
            self._observers.append(observer)

    def detach(self, observer: AlertObserver) -> None:
        self._observers = [o for o in self._observers if o is not observer]

    def notify(self, alert: Alert) -> None:
        for observer in self._observers:
            observer.update(alert)

    def analyze_readings(
        self,
        user_id: int,
        readings: List[Reading],
        predicted_by_date: Dict[str, float],
    ) -> Dict:
        sorted_r = sorted(readings, key=lambda r: r.date)
        if not sorted_r:
            return {
                "overall_risk_level": "Normal",
                "active_alerts_count": 0,
                "generated_alerts": [],
                "last_analyzed_date": None,
            }

        collector = AlertCollectorObserver()
        self.attach(collector)

        vols = sorted(r.volume_liters for r in sorted_r)
        cutoff = max(1, int(len(vols) * 0.9))
        trimmed = vols[:cutoff]
        baseline_mean = sum(trimmed) / len(trimmed)
        baseline_var = sum((v - baseline_mean) ** 2 for v in trimmed) / len(trimmed)
        baseline_std = max(math.sqrt(baseline_var), 20.0)

        consecutive_elevated = 0

        for r in sorted_r:
            expected = predicted_by_date.get(r.date, round(baseline_mean, 1))
            deviation_pct = ((r.volume_liters - expected) / expected) * 100.0 if expected > 0 else 0.0
            z_score = (r.volume_liters - baseline_mean) / baseline_std

            night_elevated = r.night_flow_lph >= self.thresholds.night_flow_threshold_lph
            night_severe = r.night_flow_lph >= self.thresholds.night_flow_threshold_lph * 1.6
            spike_exceeded = deviation_pct >= self.thresholds.spike_percent_threshold
            high_spike = deviation_pct >= self.thresholds.high_risk_percent_threshold
            stat_outlier = len(sorted_r) >= 7 and z_score >= self.thresholds.historical_z_threshold

            if spike_exceeded or night_elevated or stat_outlier:
                consecutive_elevated += 1
            else:
                consecutive_elevated = 0

            consecutive_pattern = consecutive_elevated >= self.thresholds.consecutive_abnormal_days

            if not (spike_exceeded or night_elevated or stat_outlier or consecutive_pattern):
                continue

            rules: List[str] = []
            reasons: List[str] = []

            if spike_exceeded:
                rules.append("Expected vs Actual Surge")
                reasons.append(
                    f"Possible Leak: daily usage of {r.volume_liters:.0f} L exceeded expected {expected:.0f} L "
                    f"by {deviation_pct:.1f}% (threshold {self.thresholds.spike_percent_threshold:.0f}%)."
                )
            if night_elevated:
                rules.append("Continuous Nighttime Flow")
                reasons.append(
                    f"Suspected Leak: simulated continuous nighttime flow reached {r.night_flow_lph:.1f} L/h "
                    f"(threshold {self.thresholds.night_flow_threshold_lph:.1f} L/h)."
                )
            if consecutive_pattern:
                rules.append("Multi-Period Sustained Elevation")
                reasons.append(
                    f"Possible Leak: abnormal elevation persisted across {consecutive_elevated} consecutive daily periods."
                )
            if stat_outlier and not spike_exceeded:
                rules.append("Historical Variance Outlier")
                reasons.append(
                    f"Suspected Leak: reading sits {z_score:.1f} sigma above historical baseline ({baseline_mean:.0f} L/day)."
                )

            risk_level = "Low Risk"
            if high_spike or night_severe or (consecutive_pattern and night_elevated and spike_exceeded):
                risk_level = "High Risk"
            elif (spike_exceeded and night_elevated) or consecutive_pattern or night_elevated or spike_exceeded:
                risk_level = "Medium Risk"

            if night_elevated:
                action = (
                    "Inspect toilet cistern flapper valves, shut off all taps overnight, "
                    "and compare meter reading before sleep and at dawn."
                )
            elif high_spike:
                action = (
                    "Check garden irrigation timers, pressurized supply lines, "
                    "and water heater relief valves for a possible burst or stuck valve."
                )
            else:
                action = (
                    "Monitor the next 24-hour reading and inspect visible plumbing joints "
                    "and under-sink traps for dampness."
                )

            alert = Alert(
                id=0,
                user_id=user_id,
                date=r.date,
                risk_level=risk_level,
                rule_triggered=" + ".join(rules),
                reason=" ".join(reasons),
                expected_liters=round(expected, 1),
                actual_liters=round(r.volume_liters, 1),
                night_flow_lph=round(r.night_flow_lph, 1),
                recommended_action=action,
                status="Active",
            )
            self.notify(alert)

        self.detach(collector)

        recent_cutoff = sorted_r[max(0, len(sorted_r) - 14)].date
        recent_alerts = [a for a in collector.collected if a.date >= recent_cutoff]
        overall = "Normal"
        if any(a.risk_level == "High Risk" for a in recent_alerts):
            overall = "High Risk"
        elif any(a.risk_level == "Medium Risk" for a in recent_alerts):
            overall = "Medium Risk"
        elif any(a.risk_level == "Low Risk" for a in recent_alerts):
            overall = "Low Risk"

        return {
            "overall_risk_level": overall,
            "active_alerts_count": len(collector.collected),
            "generated_alerts": collector.collected,
            "last_analyzed_date": sorted_r[-1].date,
        }

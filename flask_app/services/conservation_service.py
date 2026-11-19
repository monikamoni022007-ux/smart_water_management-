from __future__ import annotations

from typing import Dict, List
from models.domain import Reading


class ConservationManager:
    """Manages water conservation targets, before/after comparisons, and recommendations."""

    @staticmethod
    def validate_goal(goal: Dict) -> tuple[bool, List[str]]:
        errors: List[str] = []
        try:
            dt = float(goal.get("daily_target_liters", 0))
            if dt < 50 or dt > 20000:
                errors.append("Daily target must be between 50 and 20,000 liters.")
        except (TypeError, ValueError):
            errors.append("Daily target must be a valid number.")

        try:
            ml = float(goal.get("monthly_limit_liters", 0))
            if ml < 1000 or ml > 600000:
                errors.append("Monthly limit must be between 1,000 and 600,000 liters.")
        except (TypeError, ValueError):
            errors.append("Monthly limit must be a valid number.")

        try:
            bl = float(goal.get("baseline_daily_liters", 0))
            if bl < 50 or bl > 25000:
                errors.append("Baseline daily usage must be between 50 and 25,000 liters.")
        except (TypeError, ValueError):
            errors.append("Baseline daily usage must be a valid number.")

        action_start = str(goal.get("action_start_date", "")).strip()
        if len(action_start) != 10 or action_start[4] != "-" or action_start[7] != "-":
            errors.append("Action start date must be a valid YYYY-MM-DD value.")

        action_label = str(goal.get("action_label", "")).strip()
        if len(action_label) < 3:
            errors.append("Action description must be at least 3 characters.")

        return (len(errors) == 0, errors)

    def evaluate_progress(self, readings: List[Reading], goal: Dict) -> Dict:
        sorted_r = sorted(readings, key=lambda r: r.date)
        recent_30 = sorted_r[-30:]
        recent_total = round(sum(r.volume_liters for r in recent_30), 1)
        current_avg = round(recent_total / len(recent_30), 1) if recent_30 else 0.0

        monthly_limit = float(goal["monthly_limit_liters"])
        daily_target = float(goal["daily_target_liters"])
        baseline_daily = float(goal["baseline_daily_liters"])
        action_start = goal["action_start_date"]

        remaining = round(monthly_limit - recent_total, 1)
        utilization_pct = round((recent_total / monthly_limit) * 100.0, 1) if monthly_limit > 0 else 0.0

        within_target = sum(1 for r in recent_30 if r.volume_liters <= daily_target)
        evaluated_days = len(recent_30)
        adherence_pct = round((within_target / evaluated_days) * 100.0, 1) if evaluated_days > 0 else 0.0

        before_r = [r for r in sorted_r if r.date < action_start]
        after_r = [r for r in sorted_r if r.date >= action_start]

        has_readings = len(sorted_r) > 0
        before_avg = (
            0.0
            if not has_readings
            else round(sum(r.volume_liters for r in before_r) / len(before_r), 1)
            if before_r
            else baseline_daily
        )
        after_avg = (
            0.0
            if not has_readings
            else round(sum(r.volume_liters for r in after_r) / len(after_r), 1)
            if after_r
            else current_avg
        )

        daily_savings = round(before_avg - after_avg, 1) if has_readings else 0.0
        active_days = max(len(after_r), len(recent_30)) if has_readings else 0
        total_saved = round(max(0.0, daily_savings * active_days), 1) if has_readings else 0.0
        savings_pct = round((daily_savings / before_avg) * 100.0, 1) if (has_readings and before_avg > 0) else 0.0

        status_label = "On Track"
        if utilization_pct > 100 or current_avg > daily_target * 1.15:
            status_label = "Over Limit"
        elif current_avg > daily_target or adherence_pct < 60:
            status_label = "Needs Attention"

        return {
            "goal": goal,
            "current_avg_daily_liters": current_avg,
            "recent_thirty_day_total_liters": recent_total,
            "monthly_limit_remaining_liters": remaining,
            "monthly_limit_utilization_percent": utilization_pct,
            "days_within_daily_target": within_target,
            "total_evaluated_days": evaluated_days,
            "target_adherence_percent": adherence_pct,
            "before_avg_liters": before_avg,
            "after_avg_liters": after_avg,
            "estimated_daily_savings_liters": daily_savings,
            "estimated_total_saved_liters": total_saved,
            "savings_percent": savings_pct,
            "status_label": status_label,
            "recommendations": self._build_recommendations(sorted_r, daily_target, current_avg),
        }

    def _build_recommendations(
        self, readings: List[Reading], daily_target: float, current_avg: float
    ) -> List[Dict]:
        recs: List[Dict] = []
        avg_night = sum(r.night_flow_lph for r in readings) / len(readings) if readings else 0.0
        weekdays = [r for r in readings if not r.is_weekend()]
        weekends = [r for r in readings if r.is_weekend()]
        wd_avg = sum(r.volume_liters for r in weekdays) / len(weekdays) if weekdays else 0.0
        we_avg = sum(r.volume_liters for r in weekends) / len(weekends) if weekends else 0.0

        if avg_night >= 6.0:
            recs.append({
                "id": "rec-night-flow",
                "title": "Audit overnight baseline flow and cistern seals",
                "category": "Night Flow",
                "estimated_daily_savings_liters": round(avg_night * 6.0),
                "rationale": f"Average nighttime flow is {avg_night:.1f} L/h. Eliminating flapper seepage saves continuous overnight loss.",
            })

        if wd_avg > 0 and we_avg > wd_avg * 1.12:
            recs.append({
                "id": "rec-weekend",
                "title": "Consolidate weekend laundry and outdoor watering",
                "category": "Outdoor",
                "estimated_daily_savings_liters": round((we_avg - wd_avg) * 0.45),
                "rationale": f"Weekend usage ({we_avg:.0f} L/day) exceeds weekdays ({wd_avg:.0f} L/day).",
            })

        if current_avg > daily_target:
            gap = current_avg - daily_target
            recs.append({
                "id": "rec-aerators",
                "title": "Install low-flow faucet aerators and 6 L/min showerheads",
                "category": "Fixture",
                "estimated_daily_savings_liters": round(max(25.0, gap * 0.6)),
                "rationale": f"30-day average ({current_avg:.0f} L/day) exceeds daily target by {gap:.0f} L.",
            })

        recs.append({
            "id": "rec-behavior",
            "title": "Adopt a 5-minute shower timer and full-load dishwasher schedule",
            "category": "Behavior",
            "estimated_daily_savings_liters": 28,
            "rationale": "Shortening daily showers by 2 minutes saves roughly 28 L/day.",
        })
        return recs

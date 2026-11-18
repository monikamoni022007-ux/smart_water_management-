from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple


@dataclass
class User:
    id: int
    name: str
    email: str
    household_name: str
    household_size: int
    created_at: str = ""

    def get_meter_id(self) -> str:
        return f"WM-{self.id:04d}"

    def recommended_daily_target(self) -> float:
        return float(self.household_size * 105)


@dataclass
class Reading:
    id: int
    user_id: int
    meter_id: str
    date: str
    volume_liters: float
    night_flow_lph: float
    source: str = "manual"
    notes: str = ""
    created_at: str = ""

    def is_weekend(self) -> bool:
        dt = datetime.strptime(self.date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return dt.weekday() >= 5

    def day_of_week(self) -> int:
        # 0 = Sunday .. 6 = Saturday
        dt = datetime.strptime(self.date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return (dt.weekday() + 1) % 7

    @staticmethod
    def validate_input(date_str: str, volume_liters: float, night_flow_lph: float, notes: str = "") -> Tuple[bool, List[str]]:
        errors: List[str] = []
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except (TypeError, ValueError):
            errors.append("Date must be a valid YYYY-MM-DD value.")

        if volume_liters is None or volume_liters <= 0 or volume_liters > 50000:
            errors.append("Water volume must be between 1 and 50,000 liters.")

        if night_flow_lph is None or night_flow_lph < 0 or night_flow_lph > 2000:
            errors.append("Nighttime flow must be between 0 and 2,000 L/h.")

        if notes and len(notes) > 240:
            errors.append("Notes must be 240 characters or fewer.")

        return (len(errors) == 0, errors)

    def to_dict(self) -> Dict:
        return asdict(self)


class Sensor(ABC):
    """Abstract base class for simulated water sensors."""

    def __init__(self, sensor_id: str, location: str, unit: str = "Liters") -> None:
        self.sensor_id = sensor_id
        self.location = location
        self.unit = unit

    @abstractmethod
    def validate(self) -> bool:
        pass

    @abstractmethod
    def capture_reading(
        self,
        reading_id: int,
        user_id: int,
        meter_id: str,
        date_str: str,
        volume_liters: float,
        night_flow_lph: float,
        source: str = "manual",
        notes: str = "",
    ) -> Reading:
        pass


class FlowSensor(Sensor):
    """Software-simulated volumetric flow sensor."""

    def __init__(
        self,
        sensor_id: str = "SIM-FLOW-01",
        location: str = "Main Supply Line (Software Simulation)",
        pipe_diameter_mm: int = 25,
        max_rated_flow_lph: float = 2500.0,
    ) -> None:
        super().__init__(sensor_id, location, "Liters")
        self.pipe_diameter_mm = pipe_diameter_mm
        self.max_rated_flow_lph = max_rated_flow_lph

    def validate(self) -> bool:
        return self.pipe_diameter_mm > 0 and self.max_rated_flow_lph > 0 and bool(self.sensor_id.strip())

    def capture_reading(
        self,
        reading_id: int,
        user_id: int,
        meter_id: str,
        date_str: str,
        volume_liters: float,
        night_flow_lph: float,
        source: str = "manual",
        notes: str = "",
    ) -> Reading:
        if not self.validate():
            raise ValueError(f"FlowSensor {self.sensor_id} configuration is invalid.")
        valid, errors = Reading.validate_input(date_str, volume_liters, night_flow_lph, notes)
        if not valid:
            raise ValueError(" ".join(errors))
        return Reading(
            id=reading_id,
            user_id=user_id,
            meter_id=meter_id,
            date=date_str,
            volume_liters=round(float(volume_liters), 1),
            night_flow_lph=round(float(night_flow_lph), 1),
            source=source,
            notes=notes or "",
        )


class WaterMeter:
    """Composes a Sensor and manages historical water usage readings."""

    def __init__(
        self,
        meter_id: str,
        user_id: int,
        sensor: Optional[Sensor] = None,
        readings: Optional[List[Reading]] = None,
    ) -> None:
        self.meter_id = meter_id
        self.user_id = user_id
        self.sensor = sensor or FlowSensor(sensor_id=f"FS-{meter_id}")
        self.readings: List[Reading] = sorted(readings or [], key=lambda r: r.date)

    def record_usage(
        self,
        reading_id: int,
        date_str: str,
        volume_liters: float,
        night_flow_lph: float,
        source: str = "manual",
        notes: str = "",
    ) -> Reading:
        reading = self.sensor.capture_reading(
            reading_id=reading_id,
            user_id=self.user_id,
            meter_id=self.meter_id,
            date_str=date_str,
            volume_liters=volume_liters,
            night_flow_lph=night_flow_lph,
            source=source,
            notes=notes,
        )
        self.readings.append(reading)
        self.readings.sort(key=lambda r: r.date)
        return reading

    def get_summary_metrics(self) -> Dict:
        if not self.readings:
            return {
                "total_readings": 0,
                "latest_date": None,
                "today_liters": 0.0,
                "average_daily_liters": 0.0,
                "seven_day_average_liters": 0.0,
                "thirty_day_average_liters": 0.0,
                "weekday_average_liters": 0.0,
                "weekend_average_liters": 0.0,
                "std_dev_liters": 0.0,
                "total_volume_liters": 0.0,
            }

        sorted_r = sorted(self.readings, key=lambda r: r.date)
        total = sum(r.volume_liters for r in sorted_r)
        avg = total / len(sorted_r)
        last7 = sorted_r[-7:]
        last30 = sorted_r[-30:]
        weekdays = [r for r in sorted_r if not r.is_weekend()]
        weekends = [r for r in sorted_r if r.is_weekend()]
        var = sum((r.volume_liters - avg) ** 2 for r in sorted_r) / len(sorted_r)

        return {
            "total_readings": len(sorted_r),
            "latest_date": sorted_r[-1].date,
            "today_liters": round(sorted_r[-1].volume_liters, 1),
            "average_daily_liters": round(avg, 1),
            "seven_day_average_liters": round(sum(r.volume_liters for r in last7) / len(last7), 1),
            "thirty_day_average_liters": round(sum(r.volume_liters for r in last30) / len(last30), 1),
            "weekday_average_liters": round(sum(r.volume_liters for r in weekdays) / len(weekdays), 1) if weekdays else 0.0,
            "weekend_average_liters": round(sum(r.volume_liters for r in weekends) / len(weekends), 1) if weekends else 0.0,
            "std_dev_liters": round(var ** 0.5, 1),
            "total_volume_liters": round(total, 1),
        }

    def get_weekly_aggregation(self) -> List[Dict]:
        groups: Dict[str, List[Reading]] = {}
        for r in self.readings:
            dt = datetime.strptime(r.date, "%Y-%m-%d").date()
            iso_year, iso_week, _ = dt.isocalendar()
            key = f"{iso_year}-W{iso_week:02d}"
            groups.setdefault(key, []).append(r)

        out = []
        for period in sorted(groups.keys()):
            items = groups[period]
            vols = [x.volume_liters for x in items]
            total = sum(vols)
            out.append({
                "period": period,
                "label": period,
                "total_liters": round(total, 1),
                "average_daily_liters": round(total / len(items), 1),
                "reading_count": len(items),
                "max_liters": max(vols),
                "min_liters": min(vols),
            })
        return out

    def get_monthly_aggregation(self) -> List[Dict]:
        groups: Dict[str, List[Reading]] = {}
        for r in self.readings:
            key = r.date[:7]
            groups.setdefault(key, []).append(r)

        out = []
        for period in sorted(groups.keys()):
            items = groups[period]
            vols = [x.volume_liters for x in items]
            total = sum(vols)
            dt = datetime.strptime(f"{period}-01", "%Y-%m-%d")
            out.append({
                "period": period,
                "label": dt.strftime("%b %Y"),
                "total_liters": round(total, 1),
                "average_daily_liters": round(total / len(items), 1),
                "reading_count": len(items),
                "max_liters": max(vols),
                "min_liters": min(vols),
            })
        return out


@dataclass
class Alert:
    id: int
    user_id: int
    date: str
    risk_level: str
    rule_triggered: str
    reason: str
    expected_liters: float
    actual_liters: float
    night_flow_lph: float
    recommended_action: str
    status: str = "Active"
    created_at: str = ""

    def acknowledge(self) -> None:
        if self.status == "Active":
            self.status = "Acknowledged"

    def resolve(self) -> None:
        self.status = "Resolved"

    def to_dict(self) -> Dict:
        return asdict(self)


class AlertObserver(ABC):
    """Observer Pattern interface for suspected leak alert notifications."""

    @abstractmethod
    def update(self, alert: Alert) -> None:
        pass

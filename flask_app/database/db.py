from __future__ import annotations

from datetime import date, timedelta
import hashlib
import os
import sqlite3
from typing import Dict, List, Optional

from models.domain import Alert, AlertObserver, FlowSensor, Reading, User, WaterMeter
from services.conservation_service import ConservationManager
from services.demo_data import (
    generate_deterministic_demo_dataset,
    generate_secondary_apartment_dataset,
)
from services.leak_service import LeakDetector, LeakThresholds
from services.prediction_service import UsagePredictor


def _hash_password(password: str) -> str:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=b"aqualedger-capstone-salt",
        n=16384,
        r=8,
        p=1,
    ).hex()


class SqliteAlertCollector(AlertObserver):
    def __init__(self) -> None:
        self.alerts: List[Alert] = []

    def update(self, alert: Alert) -> None:
        self.alerts.append(alert)


class WaterDatabase:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "water_management.db",
        )
        self._init_schema()
        self._seed_initial_users()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    household_name TEXT NOT NULL,
                    household_size INTEGER NOT NULL DEFAULT 3,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS water_readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    meter_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    volume_liters REAL NOT NULL,
                    night_flow_lph REAL NOT NULL DEFAULT 2.0,
                    source TEXT NOT NULL DEFAULT 'manual',
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_readings_user_date
                    ON water_readings (user_id, date);

                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    rule_triggered TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    expected_liters REAL NOT NULL,
                    actual_liters REAL NOT NULL,
                    night_flow_lph REAL NOT NULL DEFAULT 0,
                    recommended_action TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'Active',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS conservation_goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL UNIQUE,
                    daily_target_liters REAL NOT NULL,
                    monthly_limit_liters REAL NOT NULL,
                    baseline_daily_liters REAL NOT NULL,
                    action_start_date TEXT NOT NULL,
                    action_label TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id INTEGER PRIMARY KEY,
                    forecast_strategy TEXT NOT NULL DEFAULT 'linear_regression',
                    forecast_horizon_days INTEGER NOT NULL DEFAULT 14,
                    spike_percent_threshold REAL NOT NULL DEFAULT 30,
                    high_risk_percent_threshold REAL NOT NULL DEFAULT 60,
                    night_flow_threshold_lph REAL NOT NULL DEFAULT 12,
                    consecutive_abnormal_days INTEGER NOT NULL DEFAULT 2,
                    historical_z_threshold REAL NOT NULL DEFAULT 2.0,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )

    def _seed_initial_users(self) -> None:
        with self._connect() as conn:
            cnt = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if cnt > 0:
                return

        today = date.today().isoformat()
        u1 = self.create_user(
            "Alex Mercer", "alex@aqualedger.edu", "demo123", "Mercer Residence", 3
        )
        self.update_conservation_goal(
            u1.id,
            {
                "daily_target_liters": 310,
                "monthly_limit_liters": 9400,
                "baseline_daily_liters": 342,
                "action_start_date": (date.today() - timedelta(days=22)).isoformat(),
                "action_label": "Installed low-flow faucet aerators and replaced toilet cistern seal",
            },
        )
        self.load_sample_dataset(u1.id, "full90", today)

        u2 = self.create_user(
            "Priya Nair", "priya@aqualedger.edu", "demo123", "Nair Apartment", 2
        )
        self.update_conservation_goal(
            u2.id,
            {
                "daily_target_liters": 210,
                "monthly_limit_liters": 6300,
                "baseline_daily_liters": 225,
                "action_start_date": (date.today() - timedelta(days=10)).isoformat(),
                "action_label": "Switched to eco-cycle washing program",
            },
        )
        self.load_sample_dataset(u2.id, "apartment14", today)

    def list_users(self) -> List[User]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, name, email, household_name, household_size, created_at FROM users ORDER BY id ASC"
            ).fetchall()
        return [
            User(
                id=r["id"],
                name=r["name"],
                email=r["email"],
                household_name=r["household_name"],
                household_size=r["household_size"],
                created_at=r["created_at"],
            )
            for r in rows
        ]

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        with self._connect() as conn:
            r = conn.execute(
                "SELECT id, name, email, household_name, household_size, created_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        if not r:
            return None
        return User(
            id=r["id"],
            name=r["name"],
            email=r["email"],
            household_name=r["household_name"],
            household_size=r["household_size"],
            created_at=r["created_at"],
        )

    def authenticate_user(self, email: str, password: str) -> Optional[User]:
        with self._connect() as conn:
            r = conn.execute(
                "SELECT id, name, email, password_hash, household_name, household_size, created_at FROM users WHERE lower(email) = ?",
                (email.strip().lower(),),
            ).fetchone()
        if not r or r["password_hash"] != _hash_password(password):
            return None
        return User(
            id=r["id"],
            name=r["name"],
            email=r["email"],
            household_name=r["household_name"],
            household_size=r["household_size"],
            created_at=r["created_at"],
        )

    def create_user(
        self,
        name: str,
        email: str,
        password: str,
        household_name: str,
        household_size: int = 3,
    ) -> User:
        pw_hash = _hash_password(password)
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO users (name, email, password_hash, household_name, household_size) VALUES (?, ?, ?, ?, ?)",
                (name.strip(), email.strip().lower(), pw_hash, household_name.strip(), max(1, int(household_size))),
            )
            uid = int(cur.lastrowid)
            conn.execute("INSERT INTO user_settings (user_id) VALUES (?)", (uid,))
            target = uid and max(1, int(household_size)) * 105
            conn.execute(
                """INSERT INTO conservation_goals
                   (user_id, daily_target_liters, monthly_limit_liters, baseline_daily_liters, action_start_date, action_label)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    uid,
                    target,
                    target * 30,
                    round(target * 1.15),
                    (date.today() - timedelta(days=14)).isoformat(),
                    "Baseline conservation monitoring plan",
                ),
            )
        return self.get_user_by_id(uid)  # type: ignore

    def get_user_settings(self, user_id: int) -> Dict:
        with self._connect() as conn:
            r = conn.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
        return dict(r) if r else {"user_id": user_id, "forecast_strategy": "linear_regression", "forecast_horizon_days": 14}

    def update_user_settings(self, user_id: int, patch: Dict) -> Dict:
        current = self.get_user_settings(user_id)
        current.update({k: v for k, v in patch.items() if v is not None})
        with self._connect() as conn:
            conn.execute(
                """UPDATE user_settings
                   SET forecast_strategy = ?, forecast_horizon_days = ?,
                       spike_percent_threshold = ?, high_risk_percent_threshold = ?,
                       night_flow_threshold_lph = ?, consecutive_abnormal_days = ?,
                       historical_z_threshold = ?
                   WHERE user_id = ?""",
                (
                    current["forecast_strategy"],
                    int(current["forecast_horizon_days"]),
                    float(current["spike_percent_threshold"]),
                    float(current["high_risk_percent_threshold"]),
                    float(current["night_flow_threshold_lph"]),
                    int(current["consecutive_abnormal_days"]),
                    float(current["historical_z_threshold"]),
                    user_id,
                ),
            )
        self.recompute_alerts(user_id)
        return self.get_user_settings(user_id)

    def get_readings(self, user_id: int) -> List[Reading]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM water_readings WHERE user_id = ? ORDER BY date ASC, id ASC",
                (user_id,),
            ).fetchall()
        return [
            Reading(
                id=r["id"],
                user_id=r["user_id"],
                meter_id=r["meter_id"],
                date=r["date"],
                volume_liters=r["volume_liters"],
                night_flow_lph=r["night_flow_lph"],
                source=r["source"],
                notes=r["notes"],
                created_at=r["created_at"],
            )
            for r in rows
        ]

    def add_reading(
        self,
        user_id: int,
        date_str: str,
        volume_liters: float,
        night_flow_lph: float,
        notes: str = "",
        source: str = "manual",
    ) -> Reading:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found.")
        sensor = FlowSensor(sensor_id=f"FS-{user.get_meter_id()}")
        validated = sensor.capture_reading(
            0, user_id, user.get_meter_id(), date_str, volume_liters, night_flow_lph, source, notes
        )
        with self._connect() as conn:
            cur = conn.execute(
                """INSERT INTO water_readings (user_id, meter_id, date, volume_liters, night_flow_lph, source, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id,
                    validated.meter_id,
                    validated.date,
                    validated.volume_liters,
                    validated.night_flow_lph,
                    validated.source,
                    validated.notes,
                ),
            )
            new_id = int(cur.lastrowid)
        self.recompute_alerts(user_id)
        validated.id = new_id
        return validated

    def update_reading(
        self,
        user_id: int,
        reading_id: int,
        date_str: str,
        volume_liters: float,
        night_flow_lph: float,
        notes: str = "",
    ) -> bool:
        valid, errs = Reading.validate_input(date_str, volume_liters, night_flow_lph, notes)
        if not valid:
            raise ValueError(" ".join(errs))
        with self._connect() as conn:
            cur = conn.execute(
                """UPDATE water_readings
                   SET date = ?, volume_liters = ?, night_flow_lph = ?, notes = ?
                   WHERE id = ? AND user_id = ?""",
                (date_str, round(float(volume_liters), 1), round(float(night_flow_lph), 1), notes, reading_id, user_id),
            )
            changed = cur.rowcount > 0
        if changed:
            self.recompute_alerts(user_id)
        return changed

    def delete_reading(self, user_id: int, reading_id: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM water_readings WHERE id = ? AND user_id = ?",
                (reading_id, user_id),
            )
            changed = cur.rowcount > 0
        if changed:
            self.recompute_alerts(user_id)
        return changed

    def load_sample_dataset(
        self, user_id: int, variant: str = "full90", anchor_date: Optional[str] = None
    ) -> int:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found.")
        anchor = anchor_date or date.today().isoformat()
        data = (
            generate_secondary_apartment_dataset(anchor)
            if variant == "apartment14"
            else generate_deterministic_demo_dataset(anchor)
        )
        meter_id = user.get_meter_id()
        with self._connect() as conn:
            conn.execute("DELETE FROM water_readings WHERE user_id = ? AND source = 'demo'", (user_id,))
            conn.executemany(
                """INSERT INTO water_readings (user_id, meter_id, date, volume_liters, night_flow_lph, source, notes)
                   VALUES (?, ?, ?, ?, ?, 'demo', ?)""",
                [
                    (user_id, meter_id, item["date"], item["volume_liters"], item["night_flow_lph"], item["notes"])
                    for item in data
                ],
            )
        self.recompute_alerts(user_id)
        return len(data)

    def clear_demo_dataset(self, user_id: int) -> int:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM water_readings WHERE user_id = ? AND source = 'demo'", (user_id,))
            count = cur.rowcount
        self.recompute_alerts(user_id)
        return count

    def recompute_alerts(self, user_id: int) -> None:
        readings = self.get_readings(user_id)
        settings = self.get_user_settings(user_id)
        predictor = UsagePredictor(UsagePredictor.create_strategy(settings["forecast_strategy"]))
        forecast = predictor.predict(readings, int(settings["forecast_horizon_days"]))
        pred_map = {h["date"]: h["predicted_liters"] for h in forecast["historical"]}

        detector = LeakDetector(
            LeakThresholds(
                spike_percent_threshold=float(settings["spike_percent_threshold"]),
                high_risk_percent_threshold=float(settings["high_risk_percent_threshold"]),
                night_flow_threshold_lph=float(settings["night_flow_threshold_lph"]),
                consecutive_abnormal_days=int(settings["consecutive_abnormal_days"]),
                historical_z_threshold=float(settings["historical_z_threshold"]),
            )
        )
        observer = SqliteAlertCollector()
        detector.attach(observer)
        detector.analyze_readings(user_id, readings, pred_map)

        with self._connect() as conn:
            existing = conn.execute(
                "SELECT date, rule_triggered, status FROM alerts WHERE user_id = ?", (user_id,)
            ).fetchall()
            status_map = {f"{r['date']}::{r['rule_triggered']}": r["status"] for r in existing}
            conn.execute("DELETE FROM alerts WHERE user_id = ?", (user_id,))
            for alert in observer.alerts:
                status = status_map.get(f"{alert.date}::{alert.rule_triggered}", "Active")
                conn.execute(
                    """INSERT INTO alerts
                       (user_id, date, risk_level, rule_triggered, reason, expected_liters, actual_liters, night_flow_lph, recommended_action, status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        user_id,
                        alert.date,
                        alert.risk_level,
                        alert.rule_triggered,
                        alert.reason,
                        alert.expected_liters,
                        alert.actual_liters,
                        alert.night_flow_lph,
                        alert.recommended_action,
                        status,
                    ),
                )

    def get_alerts(self, user_id: int) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM alerts WHERE user_id = ? ORDER BY date DESC, id DESC",
                (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def update_alert_status(self, user_id: int, alert_id: int, status: str) -> bool:
        if status not in ("Active", "Acknowledged", "Resolved"):
            raise ValueError("Invalid alert status.")
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE alerts SET status = ? WHERE id = ? AND user_id = ?",
                (status, alert_id, user_id),
            )
            return cur.rowcount > 0

    def get_conservation_goal(self, user_id: int) -> Dict:
        with self._connect() as conn:
            r = conn.execute("SELECT * FROM conservation_goals WHERE user_id = ?", (user_id,)).fetchone()
        return dict(r) if r else {
            "user_id": user_id,
            "daily_target_liters": 300.0,
            "monthly_limit_liters": 9000.0,
            "baseline_daily_liters": 340.0,
            "action_start_date": (date.today() - timedelta(days=14)).isoformat(),
            "action_label": "Daily conservation goal",
        }

    def update_conservation_goal(self, user_id: int, goal: Dict) -> Dict:
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO conservation_goals
                   (user_id, daily_target_liters, monthly_limit_liters, baseline_daily_liters, action_start_date, action_label)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET
                     daily_target_liters = excluded.daily_target_liters,
                     monthly_limit_liters = excluded.monthly_limit_liters,
                     baseline_daily_liters = excluded.baseline_daily_liters,
                     action_start_date = excluded.action_start_date,
                     action_label = excluded.action_label,
                     updated_at = datetime('now')""",
                (
                    user_id,
                    float(goal["daily_target_liters"]),
                    float(goal["monthly_limit_liters"]),
                    float(goal["baseline_daily_liters"]),
                    goal["action_start_date"],
                    goal["action_label"],
                ),
            )
        return self.get_conservation_goal(user_id)

    def get_workspace_payload(
        self,
        user_id: int,
        override_strategy: Optional[str] = None,
        override_horizon: Optional[int] = None,
    ) -> Dict:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found.")
        readings = self.get_readings(user_id)
        settings = self.get_user_settings(user_id)
        strategy = override_strategy or settings["forecast_strategy"]
        horizon = override_horizon or int(settings["forecast_horizon_days"])

        sensor = FlowSensor(sensor_id=f"FS-{user.get_meter_id()}")
        meter = WaterMeter(user.get_meter_id(), user.id, sensor, readings)
        predictor = UsagePredictor(UsagePredictor.create_strategy(strategy))
        forecast = predictor.predict(readings, horizon)

        alerts = self.get_alerts(user_id)
        active_alerts = [a for a in alerts if a["status"] == "Active"]
        cutoff = readings[max(0, len(readings) - 14)].date if readings else ""
        recent_active = [a for a in active_alerts if a["date"] >= cutoff]

        overall_risk = "Normal"
        if any(a["risk_level"] == "High Risk" for a in recent_active):
            overall_risk = "High Risk"
        elif any(a["risk_level"] == "Medium Risk" for a in recent_active):
            overall_risk = "Medium Risk"
        elif any(a["risk_level"] == "Low Risk" for a in recent_active):
            overall_risk = "Low Risk"

        goal = self.get_conservation_goal(user_id)
        conservation = ConservationManager().evaluate_progress(readings, goal)

        return {
            "user": user,
            "meter_id": user.get_meter_id(),
            "settings": settings,
            "summary": meter.get_summary_metrics(),
            "readings": [r.to_dict() for r in readings],
            "weekly": meter.get_weekly_aggregation(),
            "monthly": meter.get_monthly_aggregation(),
            "forecast": forecast,
            "leak_analysis": {
                "overall_risk_level": overall_risk,
                "active_alerts_count": len(active_alerts),
            },
            "alerts": alerts,
            "conservation": conservation,
        }

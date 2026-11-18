import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import WaterDatabase
from models.domain import Alert, AlertObserver, FlowSensor, Reading, WaterMeter
from services.conservation_service import ConservationManager
from services.demo_data import generate_deterministic_demo_dataset
from services.leak_service import LeakDetector
from services.prediction_service import (
    LinearRegressionForecaster,
    MovingAverageForecaster,
    UsagePredictor,
)


class SpyObserver(AlertObserver):
    def __init__(self) -> None:
        self.received: list[Alert] = []

    def update(self, alert: Alert) -> None:
        self.received.append(alert)


class TestWaterManagementOOAD(unittest.TestCase):
    def test_reading_validation_and_meter_aggregation(self):
        valid, _ = Reading.validate_input("2026-11-18", 320.0, 2.5, "Normal")
        self.assertTrue(valid)

        invalid, errs = Reading.validate_input("bad-date", -5.0, -1.0, "")
        self.assertFalse(invalid)
        self.assertGreaterEqual(len(errs), 3)

        sensor = FlowSensor("FS-TEST", "Main Pipe")
        meter = WaterMeter("WM-0001", 1, sensor)
        meter.record_usage(1, "2026-11-12", 300.0, 2.0, "manual")
        meter.record_usage(2, "2026-11-14", 350.0, 2.5, "manual")
        metrics = meter.get_summary_metrics()
        self.assertEqual(metrics["total_readings"], 2)
        self.assertEqual(metrics["today_liters"], 350.0)

    def test_strategy_pattern_forecasting(self):
        raw = generate_deterministic_demo_dataset("2026-11-18")
        self.assertEqual(len(raw), 92)
        readings = [
            Reading(i + 1, 1, "WM-0001", r["date"], r["volume_liters"], r["night_flow_lph"], "demo", r["notes"])
            for i, r in enumerate(raw)
        ]

        predictor = UsagePredictor(LinearRegressionForecaster())
        lr = predictor.predict(readings, 14)
        self.assertEqual(lr["method_key"], "linear_regression")
        self.assertEqual(len(lr["future"]), 14)

        predictor.set_strategy(MovingAverageForecaster(7))
        ma = predictor.predict(readings, 7)
        self.assertEqual(ma["method_key"], "moving_average")
        self.assertEqual(len(ma["future"]), 7)
        self.assertNotEqual(lr["next_day_predicted_liters"], ma["next_day_predicted_liters"])

    def test_observer_pattern_leak_detection(self):
        raw = generate_deterministic_demo_dataset("2026-11-18")
        readings = [
            Reading(i + 1, 1, "WM-0001", r["date"], r["volume_liters"], r["night_flow_lph"], "demo", r["notes"])
            for i, r in enumerate(raw)
        ]
        lr = UsagePredictor(LinearRegressionForecaster()).predict(readings, 7)
        pred_map = {h["date"]: h["predicted_liters"] for h in lr["historical"]}

        spy = SpyObserver()
        detector = LeakDetector()
        detector.attach(spy)
        res = detector.analyze_readings(1, readings, pred_map)

        self.assertGreaterEqual(len(spy.received), 4)
        self.assertTrue(any(a.risk_level == "High Risk" for a in spy.received))
        self.assertTrue(all("Possible Leak" in a.reason or "Suspected Leak" in a.reason for a in spy.received))
        self.assertNotEqual(res["overall_risk_level"], "Normal")

    def test_conservation_and_sqlite_isolation(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            db_path = tf.name
        try:
            db = WaterDatabase(db_path)
            users = db.list_users()
            self.assertEqual(len(users), 2)
            alex, priya = users[0], users[1]

            created = db.add_reading(priya.id, "2026-11-19", 490.0, 18.0, "Leak check", "manual")
            self.assertEqual(len(db.get_readings(alex.id)), 92)
            self.assertEqual(len(db.get_readings(priya.id)), 15)
            self.assertFalse(db.delete_reading(alex.id, created.id))

            ws = db.get_workspace_payload(alex.id)
            self.assertGreater(ws["conservation"]["estimated_daily_savings_liters"], 0)
        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)


if __name__ == "__main__":
    unittest.main()

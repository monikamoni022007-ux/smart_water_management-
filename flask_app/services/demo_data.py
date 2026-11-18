from __future__ import annotations

from datetime import date, timedelta
import math
from typing import Dict, List


def generate_deterministic_demo_dataset(anchor_date: str) -> List[Dict]:
    anchor = date.fromisoformat(anchor_date)
    total_days = 92
    records: List[Dict] = []

    for i in range(total_days):
        days_ago = total_days - 1 - i
        dt = anchor - timedelta(days=days_ago)
        is_weekend = dt.weekday() >= 5

        micro_wave = math.sin(i * 0.72) * 11.0 + math.cos(i * 0.31) * 7.0
        baseline = 298.0
        if i < 70:
            baseline += i * 0.5
        else:
            baseline = max(248.0, 278.0 - (i - 69) * 0.95)

        weekend_boost = 44.0 if is_weekend else 0.0
        volume_liters = baseline + weekend_boost + micro_wave
        night_flow_lph = 2.2 + ((i * 7) % 13) * 0.2
        notes = "Weekend laundry & garden routine" if is_weekend else "Normal household daily flow"

        if days_ago == 44:
            volume_liters += 115.0
            night_flow_lph = 18.5
            notes = "Simulated night-flow leak onset (cistern trickle)"
        elif days_ago == 43:
            volume_liters += 145.0
            night_flow_lph = 23.2
            notes = "Simulated continuous night flow (unrepaired valve)"
        elif days_ago == 42:
            volume_liters += 98.0
            night_flow_lph = 15.8
            notes = "Simulated night-flow leak prior to valve shutoff"

        if days_ago == 26:
            volume_liters = 562.0
            night_flow_lph = 8.4
            notes = "Simulated sudden daytime surge (stuck outdoor valve)"

        if days_ago == 4:
            volume_liters = 388.0
            night_flow_lph = 14.2
            notes = "Simulated overnight trickle + elevated morning flow"
        elif days_ago == 3:
            volume_liters = 402.0
            night_flow_lph = 15.4
            notes = "Simulated consecutive elevated period"

        records.append({
            "date": dt.isoformat(),
            "volume_liters": round(volume_liters, 1),
            "night_flow_lph": round(night_flow_lph, 1),
            "source": "demo",
            "notes": notes,
        })

    return records


def generate_secondary_apartment_dataset(anchor_date: str) -> List[Dict]:
    anchor = date.fromisoformat(anchor_date)
    total_days = 14
    records: List[Dict] = []

    for i in range(total_days):
        days_ago = total_days - 1 - i
        dt = anchor - timedelta(days=days_ago)
        is_weekend = dt.weekday() >= 5
        wave = math.sin(i * 0.8) * 9.0
        volume_liters = 178.0 + (26.0 if is_weekend else 0.0) + wave
        night_flow_lph = 1.8 + (i % 4) * 0.3
        records.append({
            "date": dt.isoformat(),
            "volume_liters": round(volume_liters, 1),
            "night_flow_lph": round(night_flow_lph, 1),
            "source": "demo",
            "notes": "Weekend apartment usage" if is_weekend else "Standard weekday usage",
        })

    return records

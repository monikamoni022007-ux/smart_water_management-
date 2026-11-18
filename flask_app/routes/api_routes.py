from __future__ import annotations

import csv
import io
from flask import Blueprint, Response, current_app, jsonify, request, session
from database.db import WaterDatabase

api_bp = Blueprint("api", __name__, url_prefix="/api")


def _get_db() -> WaterDatabase:
    return current_app.config["WATER_DB"]


def _uid() -> int:
    return int(request.headers.get("X-User-Id") or session.get("user_id", 1))


@api_bp.route("/workspace")
def workspace():
    db = _get_db()
    uid = _uid()
    strategy = request.args.get("strategy")
    horizon = request.args.get("horizon", type=int)
    payload = db.get_workspace_payload(uid, strategy, horizon)
    payload["user"] = payload["user"].__dict__
    return jsonify(payload)


@api_bp.route("/export/<report_type>.csv")
def export_csv(report_type: str):
    db = _get_db()
    uid = _uid()
    ws = db.get_workspace_payload(uid)

    buf = io.StringIO()
    writer = csv.writer(buf)

    if report_type == "daily":
        writer.writerow(["Date", "Meter ID", "Volume (L)", "Night Flow (L/h)", "Source", "Notes"])
        for r in ws["readings"]:
            writer.writerow([r["date"], r["meter_id"], r["volume_liters"], r["night_flow_lph"], r["source"], r["notes"]])
    elif report_type == "weekly":
        writer.writerow(["ISO Week", "Days", "Total (L)", "Avg Daily (L)", "Min (L)", "Max (L)"])
        for w in ws["weekly"]:
            writer.writerow([w["period"], w["reading_count"], w["total_liters"], w["average_daily_liters"], w["min_liters"], w["max_liters"]])
    elif report_type == "monthly":
        writer.writerow(["Month", "Days", "Total (L)", "Avg Daily (L)", "Min (L)", "Max (L)"])
        for m in ws["monthly"]:
            writer.writerow([m["label"], m["reading_count"], m["total_liters"], m["average_daily_liters"], m["min_liters"], m["max_liters"]])
    elif report_type == "forecast":
        writer.writerow(["Date", "Actual (L)", "Predicted (L)", "Deviation (L)", "Deviation (%)"])
        for h in ws["forecast"]["historical"]:
            writer.writerow([h["date"], h["actual_liters"], h["predicted_liters"], h["deviation_liters"], h["deviation_percent"]])
    elif report_type == "leaks":
        writer.writerow(["Date", "Risk Level", "Rule Triggered", "Expected (L)", "Actual (L)", "Night Flow (L/h)", "Status", "Reason"])
        for a in ws["alerts"]:
            writer.writerow([a["date"], a["risk_level"], a["rule_triggered"], a["expected_liters"], a["actual_liters"], a["night_flow_lph"], a["status"], a["reason"]])
    else:
        c = ws["conservation"]
        writer.writerow(["Metric", "Value"])
        writer.writerow(["Before Avg (L/day)", c["before_avg_liters"]])
        writer.writerow(["After Avg (L/day)", c["after_avg_liters"]])
        writer.writerow(["Daily Savings (L/day)", c["estimated_daily_savings_liters"]])
        writer.writerow(["Total Saved (L)", c["estimated_total_saved_liters"]])

    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=aqualedger_{report_type}.csv"},
    )

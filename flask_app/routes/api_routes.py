from __future__ import annotations

import csv
import io
import re
from flask import Blueprint, Response, current_app, jsonify, request, session
from database.db import WaterDatabase

api_bp = Blueprint("api", __name__, url_prefix="/api")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _get_db() -> WaterDatabase:
    return current_app.config["WATER_DB"]


def _require_user_id() -> tuple[int | None, tuple | None]:
    raw = request.headers.get("X-User-Id")
    try:
        uid = int(raw) if raw is not None else int(session.get("user_id", 1))
    except (TypeError, ValueError):
        return None, (jsonify({"error": "Invalid user session."}), 401)
    if uid <= 0 or not _get_db().get_user_by_id(uid):
        return None, (jsonify({"error": "User account not found."}), 401)
    return uid, None


@api_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


@api_bp.route("/users", methods=["GET"])
def list_users():
    users = [u.__dict__ for u in _get_db().list_users()]
    return jsonify({"users": users})


@api_bp.route("/auth/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip()
    password = str(body.get("password", ""))
    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400
    user = _get_db().authenticate_user(email, password)
    if not user:
        return jsonify({"error": "Invalid email or password."}), 401
    session["user_id"] = user.id
    return jsonify({"user": user.__dict__})


@api_bp.route("/auth/register", methods=["POST"])
def register():
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()
    email = str(body.get("email", "")).strip()
    password = str(body.get("password", ""))
    household_name = str(body.get("householdName") or body.get("household_name") or "").strip()
    household_size = body.get("householdSize") or body.get("household_size") or 2

    if len(name) < 2:
        return jsonify({"error": "Full name must be at least 2 characters."}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Please provide a valid email address."}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters."}), 400
    if len(household_name) < 2:
        return jsonify({"error": "Household name is required."}), 400

    try:
        created = _get_db().create_user(name, email, password, household_name, int(household_size))
        session["user_id"] = created.id
        return jsonify({"user": created.__dict__}), 201
    except Exception as exc:
        msg = str(exc)
        if "UNIQUE" in msg.upper():
            return jsonify({"error": "An account with this email already exists."}), 409
        return jsonify({"error": msg}), 400


@api_bp.route("/workspace", methods=["GET"])
def workspace():
    uid, err = _require_user_id()
    if err:
        return err
    strategy = request.args.get("strategy")
    if strategy not in ("linear_regression", "moving_average"):
        strategy = None
    horizon = request.args.get("horizon", type=int)
    payload = _get_db().get_workspace_payload(uid, strategy, horizon)  # type: ignore[arg-type]
    payload["user"] = payload["user"].__dict__
    return jsonify(payload)


@api_bp.route("/dashboard", methods=["GET"])
def dashboard():
    uid, err = _require_user_id()
    if err:
        return err
    ws = _get_db().get_workspace_payload(uid)  # type: ignore[arg-type]
    return jsonify({
        "user": ws["user"].__dict__,
        "meter_id": ws["meter_id"],
        "summary": ws["summary"],
        "recent_chart": ws["forecast"]["historical"][-30:],
        "leak_analysis": ws["leak_analysis"],
        "active_alerts": [a for a in ws["alerts"] if a["status"] == "Active"],
        "conservation": ws["conservation"],
    })


@api_bp.route("/readings", methods=["GET", "POST"])
def readings():
    uid, err = _require_user_id()
    if err:
        return err
    db = _get_db()

    if request.method == "GET":
        start = request.args.get("start", "")
        end = request.args.get("end", "")
        source = request.args.get("source", "all")
        items = [
            r.to_dict()
            for r in db.get_readings(uid)  # type: ignore[arg-type]
            if (not start or r.date >= start)
            and (not end or r.date <= end)
            and (source == "all" or r.source == source)
        ]
        return jsonify({"readings": items})

    body = request.get_json(silent=True) or {}
    try:
        date_str = str(body.get("date", "")).strip()
        volume = float(body.get("volume_liters") if body.get("volume_liters") is not None else body.get("volumeLiters"))
        night_raw = body.get("night_flow_lph") if body.get("night_flow_lph") is not None else body.get("nightFlowLph", 2.0)
        night_flow = float(night_raw)
        notes = str(body.get("notes", ""))
        created = db.add_reading(uid, date_str, volume, night_flow, notes, "manual")  # type: ignore[arg-type]
        return jsonify({"reading": created.to_dict()}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@api_bp.route("/readings/<int:reading_id>", methods=["PUT", "DELETE"])
def reading_item(reading_id: int):
    uid, err = _require_user_id()
    if err:
        return err
    if reading_id <= 0:
        return jsonify({"error": "Invalid reading ID."}), 400
    db = _get_db()

    if request.method == "DELETE":
        deleted = db.delete_reading(uid, reading_id)  # type: ignore[arg-type]
        if not deleted:
            return jsonify({"error": "Reading not found."}), 404
        return jsonify({"deleted": True})

    body = request.get_json(silent=True) or {}
    try:
        date_str = str(body.get("date", "")).strip()
        volume = float(body.get("volume_liters") if body.get("volume_liters") is not None else body.get("volumeLiters"))
        night_raw = body.get("night_flow_lph") if body.get("night_flow_lph") is not None else body.get("nightFlowLph", 0.0)
        night_flow = float(night_raw)
        notes = str(body.get("notes", ""))
        updated = db.update_reading(uid, reading_id, date_str, volume, night_flow, notes)  # type: ignore[arg-type]
        if not updated:
            return jsonify({"error": "Reading not found."}), 404
        items = [r.to_dict() for r in db.get_readings(uid) if r.id == reading_id]  # type: ignore[arg-type]
        return jsonify({"reading": items[0] if items else None})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@api_bp.route("/demo/load", methods=["POST"])
def demo_load():
    uid, err = _require_user_id()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    variant = "apartment14" if body.get("variant") == "apartment14" else "full90"
    inserted = _get_db().load_sample_dataset(uid, variant)  # type: ignore[arg-type]
    return jsonify({"insertedCount": inserted})


@api_bp.route("/demo/clear", methods=["POST"])
def demo_clear():
    uid, err = _require_user_id()
    if err:
        return err
    removed = _get_db().clear_demo_dataset(uid)  # type: ignore[arg-type]
    return jsonify({"removedCount": removed})


@api_bp.route("/prediction", methods=["GET"])
def prediction():
    uid, err = _require_user_id()
    if err:
        return err
    strategy = request.args.get("strategy")
    if strategy not in ("linear_regression", "moving_average"):
        strategy = None
    horizon = request.args.get("horizon", type=int)
    ws = _get_db().get_workspace_payload(uid, strategy, horizon)  # type: ignore[arg-type]
    return jsonify({"settings": ws["settings"], "forecast": ws["forecast"]})


@api_bp.route("/settings", methods=["PUT"])
def update_settings():
    uid, err = _require_user_id()
    if err:
        return err
    db = _get_db()
    body = request.get_json(silent=True) or {}
    current = db.get_user_settings(uid)  # type: ignore[arg-type]

    patch: dict = {}
    strategy = body.get("forecast_strategy") or body.get("forecastStrategy")
    if strategy is not None:
        if strategy not in ("linear_regression", "moving_average"):
            return jsonify({"error": "Invalid forecast strategy."}), 400
        patch["forecast_strategy"] = strategy

    horizon_val = body.get("forecast_horizon_days") if body.get("forecast_horizon_days") is not None else body.get("forecastHorizonDays")
    if horizon_val is not None:
        try:
            h = int(horizon_val)
            if h < 1 or h > 90:
                raise ValueError
            patch["forecast_horizon_days"] = h
        except (TypeError, ValueError):
            return jsonify({"error": "Forecast horizon must be between 1 and 90 days."}), 400

    spike_val = body.get("spike_percent_threshold") if body.get("spike_percent_threshold") is not None else body.get("spikePercentThreshold")
    high_val = body.get("high_risk_percent_threshold") if body.get("high_risk_percent_threshold") is not None else body.get("highRiskPercentThreshold")
    night_val = body.get("night_flow_threshold_lph") if body.get("night_flow_threshold_lph") is not None else body.get("nightFlowThresholdLph")
    consec_val = body.get("consecutive_abnormal_days") if body.get("consecutive_abnormal_days") is not None else body.get("consecutiveAbnormalDays")
    z_val = body.get("historical_z_threshold") if body.get("historical_z_threshold") is not None else body.get("historicalZThreshold")

    try:
        eff_spike = float(spike_val) if spike_val is not None else float(current["spike_percent_threshold"])
        eff_high = float(high_val) if high_val is not None else float(current["high_risk_percent_threshold"])
        if spike_val is not None:
            if eff_spike < 5 or eff_spike > 300:
                return jsonify({"error": "Daily spike % must be between 5 and 300."}), 400
            patch["spike_percent_threshold"] = eff_spike
        if high_val is not None:
            if eff_high < 10 or eff_high > 500:
                return jsonify({"error": "Urgent spike % must be between 10 and 500."}), 400
            patch["high_risk_percent_threshold"] = eff_high
        if eff_high <= eff_spike:
            return jsonify({"error": "Urgent spike % must be higher than daily spike %."}), 400

        if night_val is not None:
            nf = float(night_val)
            if nf < 1 or nf > 500:
                return jsonify({"error": "Overnight flow limit must be between 1 and 500 L/h."}), 400
            patch["night_flow_threshold_lph"] = nf
        if consec_val is not None:
            cd = int(consec_val)
            if cd < 1 or cd > 14:
                return jsonify({"error": "Consecutive days must be between 1 and 14."}), 400
            patch["consecutive_abnormal_days"] = cd
        if z_val is not None:
            zt = float(z_val)
            if zt < 1.0 or zt > 6.0:
                return jsonify({"error": "Variation sensitivity must be between 1.0 and 6.0."}), 400
            patch["historical_z_threshold"] = zt
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid numeric threshold parameter."}), 400

    updated = db.update_user_settings(uid, patch)  # type: ignore[arg-type]
    return jsonify({"settings": updated})


@api_bp.route("/leaks", methods=["GET"])
def leaks():
    uid, err = _require_user_id()
    if err:
        return err
    ws = _get_db().get_workspace_payload(uid)  # type: ignore[arg-type]
    return jsonify({
        "settings": ws["settings"],
        "leak_analysis": ws["leak_analysis"],
        "alerts": ws["alerts"],
    })


@api_bp.route("/alerts/<int:alert_id>", methods=["PATCH"])
def update_alert(alert_id: int):
    uid, err = _require_user_id()
    if err:
        return err
    if alert_id <= 0:
        return jsonify({"error": "Invalid alert ID."}), 400
    body = request.get_json(silent=True) or {}
    status = body.get("status")
    if status not in ("Active", "Acknowledged", "Resolved"):
        return jsonify({"error": "Invalid alert status."}), 400
    db = _get_db()
    ok = db.update_alert_status(uid, alert_id, status)  # type: ignore[arg-type]
    if not ok:
        return jsonify({"error": "Alert not found."}), 404
    updated = [a for a in db.get_alerts(uid) if a["id"] == alert_id]  # type: ignore[arg-type]
    return jsonify({"alert": updated[0] if updated else None})


@api_bp.route("/conservation", methods=["GET", "PUT"])
def conservation():
    uid, err = _require_user_id()
    if err:
        return err
    db = _get_db()
    if request.method == "GET":
        ws = db.get_workspace_payload(uid)  # type: ignore[arg-type]
        return jsonify({"conservation": ws["conservation"]})

    body = request.get_json(silent=True) or {}
    try:
        goal = db.update_conservation_goal(
            uid,  # type: ignore[arg-type]
            {
                "daily_target_liters": body.get("daily_target_liters") if body.get("daily_target_liters") is not None else body.get("dailyTargetLiters"),
                "monthly_limit_liters": body.get("monthly_limit_liters") if body.get("monthly_limit_liters") is not None else body.get("monthlyLimitLiters"),
                "baseline_daily_liters": body.get("baseline_daily_liters") if body.get("baseline_daily_liters") is not None else body.get("baselineDailyLiters"),
                "action_start_date": body.get("action_start_date") or body.get("actionStartDate") or "",
                "action_label": body.get("action_label") or body.get("actionLabel") or "",
            },
        )
        return jsonify({"goal": goal})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@api_bp.route("/reports/<report_type>", methods=["GET"])
def reports_json(report_type: str):
    uid, err = _require_user_id()
    if err:
        return err
    ws = _get_db().get_workspace_payload(uid)  # type: ignore[arg-type]
    if report_type == "daily":
        return jsonify({"type": "daily", "rows": ws["readings"]})
    if report_type == "weekly":
        return jsonify({"type": "weekly", "rows": ws["weekly"]})
    if report_type == "monthly":
        return jsonify({"type": "monthly", "rows": ws["monthly"]})
    if report_type == "forecast":
        return jsonify({"type": "forecast", "rows": ws["forecast"]["historical"]})
    if report_type == "leaks":
        return jsonify({"type": "leaks", "rows": ws["alerts"]})
    if report_type == "conservation":
        return jsonify({"type": "conservation", "data": ws["conservation"]})
    return jsonify({"error": "Unknown report type."}), 400


@api_bp.route("/export/<report_type>.csv", methods=["GET"])
def export_csv(report_type: str):
    uid, err = _require_user_id()
    if err:
        return err
    ws = _get_db().get_workspace_payload(uid)  # type: ignore[arg-type]

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

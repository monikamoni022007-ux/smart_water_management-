from __future__ import annotations

from flask import Blueprint, flash, redirect, render_template, request, session, url_for
from database.db import WaterDatabase

web_bp = Blueprint("web", __name__)


def _get_db() -> WaterDatabase:
    from flask import current_app
    return current_app.config["WATER_DB"]


def _current_user_id() -> int:
    return int(session.get("user_id", 1))


@web_bp.route("/")
def dashboard():
    db = _get_db()
    uid = _current_user_id()
    ws = db.get_workspace_payload(uid)
    return render_template("dashboard.html", ws=ws, users=db.list_users(), active_page="dashboard")


@web_bp.route("/monitoring", methods=["GET", "POST"])
def monitoring():
    db = _get_db()
    uid = _current_user_id()
    if request.method == "POST":
        action = request.form.get("action", "create")
        try:
            if action == "create":
                db.add_reading(
                    uid,
                    request.form.get("date", ""),
                    float(request.form.get("volume_liters", 0)),
                    float(request.form.get("night_flow_lph", 0)),
                    request.form.get("notes", ""),
                    "manual",
                )
                flash("Water reading saved.", "success")
            elif action == "update":
                db.update_reading(
                    uid,
                    int(request.form.get("reading_id", 0)),
                    request.form.get("date", ""),
                    float(request.form.get("volume_liters", 0)),
                    float(request.form.get("night_flow_lph", 0)),
                    request.form.get("notes", ""),
                )
                flash("Water reading updated.", "success")
            elif action == "delete":
                db.delete_reading(uid, int(request.form.get("reading_id", 0)))
                flash("Water reading deleted.", "success")
            elif action == "load_demo":
                db.load_sample_dataset(uid, "full90")
                flash("Loaded 92-day sample dataset.", "success")
            elif action == "clear_demo":
                db.clear_demo_dataset(uid)
                flash("Cleared demo records while keeping manual entries.", "success")
        except Exception as exc:
            flash(str(exc), "error")
        return redirect(url_for("web.monitoring"))

    start_date = request.args.get("start", "")
    end_date = request.args.get("end", "")
    source = request.args.get("source", "all")
    ws = db.get_workspace_payload(uid)
    filtered = [
        r for r in ws["readings"]
        if (not start_date or r["date"] >= start_date)
        and (not end_date or r["date"] <= end_date)
        and (source == "all" or r["source"] == source)
    ]
    filtered.sort(key=lambda r: (r["date"], r["id"]), reverse=True)
    return render_template(
        "monitoring.html",
        ws=ws,
        users=db.list_users(),
        filtered_readings=filtered,
        start_date=start_date,
        end_date=end_date,
        source=source,
        active_page="monitoring",
    )


@web_bp.route("/prediction", methods=["GET", "POST"])
def prediction():
    db = _get_db()
    uid = _current_user_id()
    if request.method == "POST":
        strategy = request.form.get("strategy", "linear_regression")
        horizon = int(request.form.get("horizon", 14))
        db.update_user_settings(uid, {"forecast_strategy": strategy, "forecast_horizon_days": horizon})
        return redirect(url_for("web.prediction"))

    ws = db.get_workspace_payload(uid)
    return render_template("prediction.html", ws=ws, users=db.list_users(), active_page="prediction")


@web_bp.route("/leaks", methods=["GET", "POST"])
def leaks():
    db = _get_db()
    uid = _current_user_id()
    if request.method == "POST":
        action = request.form.get("action", "")
        if action == "thresholds":
            db.update_user_settings(
                uid,
                {
                    "spike_percent_threshold": float(request.form.get("spike_percent_threshold", 30)),
                    "high_risk_percent_threshold": float(request.form.get("high_risk_percent_threshold", 60)),
                    "night_flow_threshold_lph": float(request.form.get("night_flow_threshold_lph", 12)),
                    "consecutive_abnormal_days": int(request.form.get("consecutive_abnormal_days", 2)),
                    "historical_z_threshold": float(request.form.get("historical_z_threshold", 2.0)),
                },
            )
            flash("Thresholds updated and alerts recalculated.", "success")
        elif action == "alert_status":
            db.update_alert_status(
                uid, int(request.form.get("alert_id", 0)), request.form.get("status", "Acknowledged")
            )
            flash("Alert status updated.", "success")
        return redirect(url_for("web.leaks"))

    ws = db.get_workspace_payload(uid)
    return render_template("leaks.html", ws=ws, users=db.list_users(), active_page="leaks")


@web_bp.route("/conservation", methods=["GET", "POST"])
def conservation():
    db = _get_db()
    uid = _current_user_id()
    if request.method == "POST":
        db.update_conservation_goal(
            uid,
            {
                "daily_target_liters": float(request.form.get("daily_target_liters", 300)),
                "monthly_limit_liters": float(request.form.get("monthly_limit_liters", 9000)),
                "baseline_daily_liters": float(request.form.get("baseline_daily_liters", 340)),
                "action_start_date": request.form.get("action_start_date", ""),
                "action_label": request.form.get("action_label", ""),
            },
        )
        flash("Conservation targets updated.", "success")
        return redirect(url_for("web.conservation"))

    ws = db.get_workspace_payload(uid)
    return render_template("conservation.html", ws=ws, users=db.list_users(), active_page="conservation")


@web_bp.route("/reports")
def reports():
    db = _get_db()
    uid = _current_user_id()
    ws = db.get_workspace_payload(uid)
    tab = request.args.get("tab", "daily")
    return render_template("reports.html", ws=ws, users=db.list_users(), tab=tab, active_page="reports")


@web_bp.route("/switch-user", methods=["POST"])
def switch_user():
    db = _get_db()
    uid = int(request.form.get("user_id", 1))
    if db.get_user_by_id(uid):
        session["user_id"] = uid
    return redirect(request.referrer or url_for("web.dashboard"))


@web_bp.route("/login", methods=["GET", "POST"])
def login():
    db = _get_db()
    if request.method == "POST":
        mode = request.form.get("mode", "login")
        if mode == "register":
            try:
                user = db.create_user(
                    request.form.get("name", ""),
                    request.form.get("email", ""),
                    request.form.get("password", ""),
                    request.form.get("household_name", ""),
                    int(request.form.get("household_size", 2)),
                )
                session["user_id"] = user.id
                return redirect(url_for("web.dashboard"))
            except Exception as exc:
                flash(str(exc), "error")
        else:
            user = db.authenticate_user(request.form.get("email", ""), request.form.get("password", ""))
            if user:
                session["user_id"] = user.id
                return redirect(url_for("web.dashboard"))
            flash("Invalid email or password.", "error")
    return render_template("login.html", users=db.list_users())

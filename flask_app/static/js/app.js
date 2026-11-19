/* AquaLedger Flask Fetch API client & interactive module controllers */

const _chartInstances = new Map();
const _inFlightRequests = new Map();

function renderLineChart(canvasId, labels, datasets) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  if (_chartInstances.has(canvasId)) {
    _chartInstances.get(canvasId).destroy();
  }
  const chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: false, grid: { color: "#f1f5f9" } },
        x: { grid: { display: false } },
      },
    },
  });
  _chartInstances.set(canvasId, chart);
  return chart;
}

function renderBarChart(canvasId, labels, datasets) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  if (_chartInstances.has(canvasId)) {
    _chartInstances.get(canvasId).destroy();
  }
  const chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: "#f1f5f9" } },
        x: { grid: { display: false } },
      },
    },
  });
  _chartInstances.set(canvasId, chart);
  return chart;
}

async function apiFetch(url, options = {}, dedupeKey = "") {
  if (dedupeKey && _inFlightRequests.has(dedupeKey)) {
    return _inFlightRequests.get(dedupeKey);
  }
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const runner = (async () => {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  })();

  if (dedupeKey) {
    _inFlightRequests.set(dedupeKey, runner);
    runner.finally(() => _inFlightRequests.delete(dedupeKey));
  }
  return runner;
}

function showStatusBanner(containerId, message, isError) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!message) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.className = isError ? "flash flash-error" : "flash flash-success";
  el.textContent = message;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  // 1. Water Usage (Monitoring) Fetch CRUD + Filtering + Chart auto-update
  const monitoringForm = document.getElementById("monitoring-reading-form");
  if (monitoringForm) {
    let editingId = null;
    const dateInput = document.getElementById("mon-date");
    const volInput = document.getElementById("mon-volume");
    const nightInput = document.getElementById("mon-night");
    const notesInput = document.getElementById("mon-notes");
    const submitBtn = document.getElementById("mon-submit-btn");
    const cancelBtn = document.getElementById("mon-cancel-btn");
    const formTitle = document.getElementById("mon-form-title");

    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    async function refreshMonitoringTable() {
      const start = document.getElementById("mon-filter-start")?.value || "";
      const end = document.getElementById("mon-filter-end")?.value || "";
      const source = document.getElementById("mon-filter-source")?.value || "all";
      const qs = new URLSearchParams();
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      if (source !== "all") qs.set("source", source);

      const data = await apiFetch(`/api/readings?${qs.toString()}`);
      const tbody = document.getElementById("mon-readings-body");
      const countEl = document.getElementById("mon-count");
      if (countEl) countEl.textContent = `${data.readings.length} reading(s)`;
      if (!tbody) return;

      const sortedDesc = [...data.readings].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      if (sortedDesc.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:24px">No water readings found.</td></tr>';
      } else {
        tbody.innerHTML = sortedDesc
          .map(
            (r) => `<tr>
              <td class="mono">${escapeHtml(r.date)}</td>
              <td class="text-right mono">${r.volume_liters} L</td>
              <td class="text-right mono">${Number(r.night_flow_lph).toFixed(1)} L/h</td>
              <td>${r.source === "manual" ? "Added by you" : "Sample data"}</td>
              <td>${escapeHtml(r.notes || "—")}</td>
              <td class="text-right" style="white-space:nowrap">
                <button type="button" class="btn mon-edit-btn" data-id="${r.id}" data-date="${escapeHtml(r.date)}" data-vol="${r.volume_liters}" data-night="${r.night_flow_lph}" data-notes="${escapeHtml(r.notes)}" style="padding:4px 8px">Edit</button>
                <button type="button" class="btn mon-del-btn" data-id="${r.id}" style="padding:4px 8px;color:#dc2626">Delete</button>
              </td>
            </tr>`
          )
          .join("");
      }

      const chron = [...data.readings].sort((a, b) => a.date.localeCompare(b.date));
      renderLineChart(
        "monUsageChart",
        chron.map((r) => r.date.slice(5)),
        [{ label: "Daily Water Used (L)", data: chron.map((r) => r.volume_liters), borderColor: "#0284c7", borderWidth: 2, tension: 0.2 }]
      );
    }

    monitoringForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return;
      showStatusBanner("mon-status", "", false);

      const d = dateInput.value.trim();
      const v = Number(volInput.value);
      const n = Number(nightInput.value);
      const notes = notesInput.value.trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        showStatusBanner("mon-status", "Date must be YYYY-MM-DD.", true);
        return;
      }
      if (!volInput.value || Number.isNaN(v) || v <= 0 || v > 50000) {
        showStatusBanner("mon-status", "Water volume must be between 1 and 50,000 liters.", true);
        return;
      }
      if (nightInput.value === "" || Number.isNaN(n) || n < 0 || n > 2000) {
        showStatusBanner("mon-status", "Overnight flow must be between 0 and 2,000 L/h.", true);
        return;
      }

      submitBtn.disabled = true;
      const origLabel = submitBtn.textContent;
      submitBtn.textContent = "Saving...";
      try {
        if (editingId !== null) {
          await apiFetch(
            `/api/readings/${editingId}`,
            {
              method: "PUT",
              body: JSON.stringify({ date: d, volume_liters: v, night_flow_lph: n, notes }),
            },
            `put:${editingId}`
          );
          showStatusBanner("mon-status", `Updated reading for ${d}.`, false);
          editingId = null;
          if (formTitle) formTitle.textContent = "Add Daily Water Reading";
          if (cancelBtn) cancelBtn.style.display = "none";
        } else {
          await apiFetch(
            "/api/readings",
            {
              method: "POST",
              body: JSON.stringify({ date: d, volume_liters: v, night_flow_lph: n, notes }),
            },
            `post:${d}:${v}`
          );
          showStatusBanner("mon-status", `Saved reading (${v} L) for ${d}.`, false);
        }
        volInput.value = "";
        notesInput.value = "";
        await refreshMonitoringTable();
      } catch (err) {
        showStatusBanner("mon-status", err.message, true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = editingId !== null ? "Save Changes" : "Save Reading";
      }
    });

    cancelBtn?.addEventListener("click", () => {
      editingId = null;
      if (formTitle) formTitle.textContent = "Add Daily Water Reading";
      cancelBtn.style.display = "none";
      submitBtn.textContent = "Save Reading";
      volInput.value = "";
      notesInput.value = "";
    });

    document.getElementById("mon-readings-body")?.addEventListener("click", async (e) => {
      const editBtn = e.target.closest(".mon-edit-btn");
      if (editBtn) {
        editingId = Number(editBtn.dataset.id);
        dateInput.value = editBtn.dataset.date || "";
        volInput.value = editBtn.dataset.vol || "";
        nightInput.value = editBtn.dataset.night || "2.5";
        notesInput.value = editBtn.dataset.notes || "";
        if (formTitle) formTitle.textContent = "Edit Daily Reading";
        if (cancelBtn) cancelBtn.style.display = "inline-flex";
        submitBtn.textContent = "Save Changes";
        return;
      }

      const delBtn = e.target.closest(".mon-del-btn");
      if (delBtn && !delBtn.disabled) {
        const id = Number(delBtn.dataset.id);
        delBtn.disabled = true;
        showStatusBanner("mon-status", "", false);
        try {
          await apiFetch(`/api/readings/${id}`, { method: "DELETE" }, `del:${id}`);
          await refreshMonitoringTable();
          showStatusBanner("mon-status", "Reading deleted and predictions/alerts updated.", false);
        } catch (err) {
          showStatusBanner("mon-status", err.message, true);
          delBtn.disabled = false;
        }
      }
    });

    document.getElementById("mon-load-demo")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await apiFetch("/api/demo/load", { method: "POST", body: JSON.stringify({ variant: "full90" }) }, "demo-load");
        await refreshMonitoringTable();
        showStatusBanner("mon-status", "Loaded 92-day sample dataset.", false);
      } catch (err) {
        showStatusBanner("mon-status", err.message, true);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("mon-clear-demo")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await apiFetch("/api/demo/clear", { method: "POST" }, "demo-clear");
        await refreshMonitoringTable();
        showStatusBanner("mon-status", "Cleared sample records while keeping manual entries.", false);
      } catch (err) {
        showStatusBanner("mon-status", err.message, true);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("mon-filter-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await refreshMonitoringTable();
      } catch (err) {
        showStatusBanner("mon-status", err.message, true);
      }
    });
  }

  // 2. Prediction Fetch strategy/horizon update
  const predForm = document.getElementById("pred-config-form");
  if (predForm) {
    predForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("pred-apply-btn");
      if (btn.disabled) return;
      showStatusBanner("pred-status", "", false);
      const strategy = predForm.querySelector("[name='strategy']").value;
      const horizon = Number(predForm.querySelector("[name='horizon']").value);
      btn.disabled = true;
      try {
        await apiFetch(
          "/api/settings",
          { method: "PUT", body: JSON.stringify({ forecast_strategy: strategy, forecast_horizon_days: horizon }) },
          "pred-settings"
        );
        const data = await apiFetch(`/api/prediction?strategy=${encodeURIComponent(strategy)}&horizon=${horizon}`);
        const f = data.forecast;
        document.getElementById("pred-next-day").textContent = `${f.next_day_predicted_liters} L`;
        document.getElementById("pred-horizon-total").textContent = `${Math.round(f.horizon_total_predicted_liters)} L`;
        const h = f.historical.slice(-45);
        const fut = f.future;
        renderLineChart(
          "predMainChart",
          [...h.map((x) => x.date.slice(5)), ...fut.map((x) => x.date.slice(5))],
          [
            { label: "Actual (L)", data: [...h.map((x) => x.actual_liters), ...fut.map(() => null)], borderColor: "#0284c7", borderWidth: 2 },
            { label: "Expected (L)", data: [...h.map((x) => x.predicted_liters), ...fut.map((x) => x.predicted_liters)], borderColor: "#0f766e", borderDash: [6, 4], borderWidth: 2 },
          ]
        );
        showStatusBanner("pred-status", "Prediction model updated.", false);
      } catch (err) {
        showStatusBanner("pred-status", err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // 3. Leak Detection Fetch threshold & alert status updates
  const threshForm = document.getElementById("leaks-threshold-form");
  if (threshForm) {
    threshForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("leaks-thresh-btn");
      if (btn.disabled) return;
      showStatusBanner("leaks-status", "", false);
      const payload = {
        spike_percent_threshold: Number(threshForm.querySelector("[name='spike_percent_threshold']").value),
        high_risk_percent_threshold: Number(threshForm.querySelector("[name='high_risk_percent_threshold']").value),
        night_flow_threshold_lph: Number(threshForm.querySelector("[name='night_flow_threshold_lph']").value),
        consecutive_abnormal_days: Number(threshForm.querySelector("[name='consecutive_abnormal_days']").value),
      };
      if (payload.high_risk_percent_threshold <= payload.spike_percent_threshold) {
        showStatusBanner("leaks-status", "Urgent spike % must be higher than daily spike %.", true);
        return;
      }
      btn.disabled = true;
      try {
        await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(payload) }, "leaks-settings");
        window.location.reload();
      } catch (err) {
        showStatusBanner("leaks-status", err.message, true);
        btn.disabled = false;
      }
    });
  }

  document.querySelectorAll(".leak-alert-action").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      const alertId = Number(btn.dataset.id);
      const status = btn.dataset.status;
      btn.disabled = true;
      try {
        await apiFetch(`/api/alerts/${alertId}`, { method: "PATCH", body: JSON.stringify({ status }) }, `alert:${alertId}`);
        window.location.reload();
      } catch (err) {
        showStatusBanner("leaks-status", err.message, true);
        btn.disabled = false;
      }
    });
  });

  // 4. Conservation Fetch save & live chart refresh
  const consForm = document.getElementById("cons-goal-form");
  if (consForm) {
    consForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("cons-save-btn");
      if (btn.disabled) return;
      showStatusBanner("cons-status", "", false);
      const payload = {
        daily_target_liters: Number(consForm.querySelector("[name='daily_target_liters']").value),
        monthly_limit_liters: Number(consForm.querySelector("[name='monthly_limit_liters']").value),
        baseline_daily_liters: Number(consForm.querySelector("[name='baseline_daily_liters']").value),
        action_start_date: consForm.querySelector("[name='action_start_date']").value,
        action_label: consForm.querySelector("[name='action_label']").value.trim(),
      };
      if (payload.daily_target_liters < 50 || payload.monthly_limit_liters < 1000 || payload.action_label.length < 3) {
        showStatusBanner("cons-status", "Please enter valid daily goal, monthly limit, and action description.", true);
        return;
      }
      btn.disabled = true;
      try {
        await apiFetch("/api/conservation", { method: "PUT", body: JSON.stringify(payload) }, "cons-put");
        const refreshed = await apiFetch("/api/conservation");
        const c = refreshed.conservation;
        document.getElementById("cons-daily-savings").textContent = `${c.estimated_daily_savings_liters} L/day`;
        document.getElementById("cons-total-saved").textContent = `${c.estimated_total_saved_liters} L`;
        document.getElementById("cons-monthly-rem").textContent = `${c.monthly_limit_remaining_liters} L`;
        renderBarChart("consChart", ["Before Change", "After Change", "Daily Goal"], [
          { label: "Liters / day", data: [c.before_avg_liters, c.after_avg_liters, c.goal.daily_target_liters], backgroundColor: ["#64748b", "#16a34a", "#0284c7"] },
        ]);
        showStatusBanner("cons-status", "Your water-saving goals have been updated.", false);
      } catch (err) {
        showStatusBanner("cons-status", err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  }
});

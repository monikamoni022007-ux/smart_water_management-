function renderLineChart(canvasId, labels, datasets) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: false, grid: { color: "#f1f5f9" } }, x: { grid: { display: false } } }
    }
  });
}

function renderBarChart(canvasId, labels, datasets) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, grid: { color: "#f1f5f9" } }, x: { grid: { display: false } } }
    }
  });
}

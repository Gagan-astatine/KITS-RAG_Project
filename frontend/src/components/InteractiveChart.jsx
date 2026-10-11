import { useEffect, useRef, useState } from "react";

// Fallback dynamic loader for Plotly dist min in browser
let plotlyModulePromise = null;
function loadPlotly() {
  if (window.Plotly) {
    return Promise.resolve(window.Plotly);
  }
  if (!plotlyModulePromise) {
    plotlyModulePromise = import("plotly.js-dist-min")
      .then((mod) => mod.default || mod)
      .catch((err) => {
        console.error("Failed to load Plotly:", err);
        return null;
      });
  }
  return plotlyModulePromise;
}

export default function InteractiveChart({ chartData, plotlyData, chartImage }) {
  const containerRef = useRef(null);
  const [activeTab, setActiveTab] = useState("plotly"); // "plotly" | "seaborn" | "table"
  const [plotlyLoaded, setPlotlyLoaded] = useState(false);
  const [plotlyError, setPlotlyError] = useState(false);

  // If no plotly data or loading fails, default to seaborn
  useEffect(() => {
    let mounted = true;
    if (activeTab === "plotly" && containerRef.current) {
      loadPlotly().then((Plotly) => {
        if (!mounted) return;
        if (!Plotly || !containerRef.current) {
          setPlotlyError(true);
          setActiveTab("seaborn");
          return;
        }
        setPlotlyLoaded(true);

        const data = plotlyData?.data || [
          {
            type: chartData?.type === "pie" ? "pie" : chartData?.type === "line" ? "scatter" : "bar",
            labels: chartData?.labels || [],
            values: chartData?.values || [],
            x: chartData?.labels || [],
            y: chartData?.values || [],
            mode: chartData?.type === "line" ? "lines+markers" : undefined,
            hovertemplate:
              chartData?.type === "pie"
                ? "<b>%{label}</b><br>Value: %{value} " + (chartData?.unit || "") + "<br>Share: %{percent}<extra></extra>"
                : "<b>%{x}</b><br>Value: <b>%{y}</b> " + (chartData?.unit || "") + "<extra></extra>",
            marker: {
              colors: ["#a855f7", "#6366f1", "#38bdf8", "#ec4899", "#10b981", "#f59e0b"],
              color: ["#a855f7", "#6366f1", "#38bdf8", "#ec4899", "#10b981", "#f59e0b"],
            },
          },
        ];

        const layout = plotlyData?.layout || {
          title: {
            text: chartData?.title || "",
            font: { size: 14, color: "#ffffff" },
          },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          margin: { l: 40, r: 30, t: 40, b: 50 },
          font: { color: "#e2e8f0", size: 11 },
          hovermode: "closest",
          xaxis: {
            gridcolor: "rgba(255, 255, 255, 0.08)",
            tickfont: { color: "#cbd5e1" },
          },
          yaxis: {
            gridcolor: "rgba(255, 255, 255, 0.08)",
            tickfont: { color: "#cbd5e1" },
            title: chartData?.unit ? { text: chartData.unit, font: { color: "#94a3b8" } } : undefined,
          },
        };

        const config = {
          responsive: true,
          displayModeBar: false,
          hoverlabel: {
            bgcolor: "#18181b",
            bordercolor: "#a855f7",
            font: { color: "#ffffff", size: 12 },
          },
        };

        Plotly.react(containerRef.current, data, layout, config);
      });
    }

    return () => {
      mounted = false;
      if (containerRef.current && window.Plotly) {
        window.Plotly.purge(containerRef.current);
      }
    };
  }, [activeTab, plotlyData, chartData]);

  const hasSeaborn = Boolean(chartImage);
  const hasPlotly = !plotlyError;

  return (
    <div className="interactive-chart-card">
      <div className="chart-header-bar">
        <div className="chart-badge">
          <span className="chart-icon">📊</span>
          <span className="chart-header-title">{chartData?.title || "Visual Analysis"}</span>
        </div>
        <div className="chart-tabs">
          {hasPlotly && (
            <button
              type="button"
              className={`chart-tab-btn ${activeTab === "plotly" ? "active" : ""}`}
              onClick={() => setActiveTab("plotly")}
              title="Interactive chart with hover inspect"
            >
              <span className="sparkle">✨</span> Interactive (Plotly)
            </button>
          )}
          {hasSeaborn && (
            <button
              type="button"
              className={`chart-tab-btn ${activeTab === "seaborn" ? "active" : ""}`}
              onClick={() => setActiveTab("seaborn")}
              title="Seaborn styled publication graphic"
            >
              🎨 Seaborn View
            </button>
          )}
          <button
            type="button"
            className={`chart-tab-btn ${activeTab === "table" ? "active" : ""}`}
            onClick={() => setActiveTab("table")}
            title="Raw tabular data"
          >
            📋 Data
          </button>
        </div>
      </div>

      <div className="chart-display-area">
        {activeTab === "plotly" && (
          <div className="plotly-wrapper">
            <div ref={containerRef} className="plotly-dom-container" />
            <p className="chart-hint-text">
              💡 <span>Hover over data points to inspect detailed values</span>
            </p>
          </div>
        )}

        {activeTab === "seaborn" && chartImage && (
          <div className="seaborn-wrapper">
            <img
              className="chart-img seaborn-img"
              src={chartImage}
              alt={chartData?.title || "Seaborn Visual"}
            />
            <p className="chart-hint-text">
              🎨 <span>High-resolution Seaborn dark theme render</span>
            </p>
          </div>
        )}

        {activeTab === "table" && chartData && (
          <div className="chart-table-wrapper">
            <table className="chart-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">
                    Value {chartData.unit ? `(${chartData.unit})` : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {chartData.labels.map((label, idx) => (
                  <tr key={`${label}-${idx}`}>
                    <td>{label}</td>
                    <td className="table-numeric-val">
                      {chartData.values[idx]?.toLocaleString()}{" "}
                      {chartData.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

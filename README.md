# GLANCE Results Dashboard

A static, GitHub Pages-ready dashboard for the GLANCE Hindi image-captioning framework. It focuses only on **word-threshold ablation** and **history configuration comparison** (Global History vs. Local History). There is no separate attention-ablation section.

## Contents
- `index.html` — dashboard layout
- `dashboard.css` — responsive styling
- `dashboard.js` — filters, charts, results table, and CSV export
- `data/glance_results.json` — 36 populated runs parsed from the supplied Excel workbook

## Run locally
Because the dashboard loads JSON using `fetch`, serve the folder with a local HTTP server instead of opening `index.html` directly.

```bash
python -m http.server 8000
```

Open `http://localhost:8000/GLANCE_Dashboard/` if serving from the parent folder, or `http://localhost:8000/` if serving from inside this folder.

## Publish on GitHub Pages
1. Create a GitHub repository (for example, `glance-results-dashboard`).
2. Upload all files and folders from this directory to the repository root.
3. In **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
4. Open the published Pages URL after deployment completes.

No build step is required. Chart.js is loaded from a CDN, so viewers need an internet connection for charts.

## Data notes
- The populated `WordThresholdAblation` sheet contributes 36 result rows.
- History comparisons use the workbook's recorded `Global History` and `Local History` configurations.
- The source workbook reports ROUGE as 0 for every populated run, so ROUGE is omitted from the main results table and charts.
- One run has no recorded batch size; it appears as `—` in the table and can be included/excluded with the batch-size filter.
- Scores are displayed as recorded in the workbook; this dashboard does not recompute evaluation metrics.

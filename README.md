# GLANCE Analytics Dashboard

A static, GitHub Pages-ready dashboard for the GLANCE framework.

## Contents
- `index.html` — dashboard interface and embedded experiment data
- `dashboard.css` — SAGE dashboard theme and layout styling
- `dashboard.js` — charts, filters, results explorer, and CSV export
- `data/glance_results.json` — source results exported from the supplied workbook

## Run locally
Open `index.html` in a browser. The results are embedded in the page, so no local server is required. Chart.js is loaded from a CDN, so charts need an internet connection; the results table and filters remain available if the CDN cannot load.

## Publish on GitHub Pages
1. Upload all files and the `data` folder to the repository root.
2. In **Settings → Pages**, select **Deploy from a branch**.
3. Choose branch `main` and folder `/(root)`, then save.

The dashboard includes word-threshold ablation, history comparison, and the results explorer. It intentionally excludes the separate attention-ablation section.

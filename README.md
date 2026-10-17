# GLANCE · Analytics Dashboard

Interactive results dashboard for **GLANCE: Global-Local Attention Network for Cross-modal Alignment in Hindi Image Captioning** (PASCAL 1K-Hindi, Flickr 8K-Hindi).
It shares its look with the SAGE and DHARA dashboards. Pages:

| Page | What it shows |
|---|---|
| Dashboard | Headline scores of the best configuration, best GLANCE-W vs best GLANCE-WH, CIDEr for all 9 configurations, win counts per metric |
| Ablation Explorer | Word threshold × batch size heatmaps for both attention variants (any metric), score vs batch size / threshold, attention-query ablation |
| Local vs Global | Paired GLANCE-W − GLANCE-WH differences per configuration, Δ heatmap, Wilcoxon signed-rank test per metric |
| Factor Effects | Marginal effect of threshold and batch size, selected epoch per run, Spearman agreement between metrics |
| Results Table | All runs with filters and sorting, CSV download, **Copy as LaTeX** (tabular, best values in bold), baseline comparison |
| Dataset Comparison | PASCAL vs Flickr: best runs, size of the local advantage, whether good configurations transfer, convergence speed |
| Insights | Findings computed from the data, model summary, data notes |

## Repository layout

```
index.html          page shell
dashboard.css       theme (same palette as SAGE / DHARA)
dashboard.js        charts and pages (Chart.js 4)
export_results.py   turns GLANCE_Results.xlsx into data/results.json
data/results.json   everything the dashboard reads (~15 KB)
```

## Updating the data

1. Edit `GLANCE_Results.xlsx` (same layout as now).
2. Run the exporter (Python 3.8+, `openpyxl`):
   ```bash
   python export_results.py --xlsx path/to/GLANCE_Results.xlsx --out data
   ```
   With the workbook next to the script, plain `python export_results.py` works.
3. Commit and push `data/`. Nothing else changes.

The exporter also picks up two optional sheets:

* **AttentionAblation** – already in the workbook; once any score is filled in, its table appears on the Ablation Explorer page.
* **Baselines** – add a sheet with columns `Dataset | Method | BLEU-1 | BLEU-2 | BLEU-3 | BLEU-4 | METEOR | ROUGE | CIDEr` (optional `Source`), on the same scale as the results. It appears on the Results Table page next to GLANCE's best runs.

## Publishing on GitHub Pages

Push these files to the repository, then **Settings → Pages → Deploy from branch → main / root**.
If the repository is not called `glance`, edit `GH.repo` at the top of `dashboard.js` (used for the header and as a fallback data source).
To preview locally: `python -m http.server` in this folder, then open http://localhost:8000.

A dataset can be linked directly: `…/index.html?ds=pascal` or `…/index.html?ds=flickr`.

## Notes on the numbers

* **Naming.** “Local History” in the workbook is **GLANCE-W** (query = previous word embedding); “Global History” is **GLANCE-WH** (query = previous word embedding + decoder hidden state).
* **CIDEr scale.** The workbook stores CIDEr as a fraction (0.2263); the dashboard shows it ×100 (22.63) so all metrics share a 0–100 axis. Set `CIDER_X100 = false` in `dashboard.js` to show it as stored.
* **ROUGE-L** is 0.00 in every run, so the exporter marks it as not computed and it is left out of all charts. It comes back automatically once the workbook has non-zero values.
* **Missing batch size.** One Flickr row (GLANCE-W, threshold 4, last row) has no batch size; the exporter infers 128 from its position and lists this under *Data Notes*.
* **Single seed.** Every cell is one training run. The Wilcoxon test on the *Local vs Global* page treats the 9 configurations as paired observations, so it measures consistency across settings, not seed-to-seed variance.
* **Best configuration** is selected on CIDEr, as in the paper.

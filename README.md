# GLANCE Analytics Dashboard

A GitHub Pages-ready dashboard for the GLANCE framework, using the SAGE dashboard styling.

## Interactive analysis
- Global filters for dataset, history configuration, word threshold, and batch size.
- Word-threshold ablation with the selected evaluation metric.
- Dataset-wise mean metric summary for PASCAL 1K-Hindi and Flickr 8K-Hindi.
- Global vs Local History comparisons, including a dataset × history grouped chart.
- Results Explorer with filtered run-level records and CSV export.
- Evaluation metrics: BLEU-1, BLEU-2, BLEU-3, BLEU-4, METEOR, and CIDEr.

The filters update all charts, summary tables, and the results explorer. The source contains 36 experimental runs. ROUGE is omitted from visual comparisons because its values are zero in the supplied workbook.

## Run locally
Open `index.html` in a browser. Results are embedded in the page; Chart.js is loaded from a CDN, so charts need an internet connection.

## Publish on GitHub Pages
Upload all files and the `data` folder to the repository root. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, and save.

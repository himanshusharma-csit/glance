# GLANCE Analytics Dashboard

A GitHub Pages-ready interactive dashboard for the GLANCE Hindi image-captioning framework. The visual theme, layout, typography, colors, navigation, cards, and table formatting reuse the original SAGE Analytics Dashboard stylesheet.

## Included analysis
- Word-threshold ablation (thresholds 2, 3, and 4)
- Global History vs Local History comparison
- PASCAL 1K-Hindi and Flickr 8K-Hindi dataset comparisons
- BLEU-1, BLEU-2, BLEU-3, BLEU-4, METEOR, and CIDEr
- Filterable run-by-run results table and CSV export

The attention-ablation section is intentionally excluded. Results are loaded from `data/glance_results.json`.

## Run locally
Because the dashboard fetches JSON data, serve this folder through a local web server rather than opening `index.html` directly. For example, with Python installed:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages
1. Upload the contents of this folder to the root of a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Under build and deployment, choose **Deploy from a branch**.
4. Select branch `main` and folder `/(root)`, then save.
5. Wait for deployment and open the Pages URL shown in settings.

The dashboard uses Chart.js from a CDN; no backend is required.

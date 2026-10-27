# Emanuel Medina — Personal Website

Live: https://emanuelmedinaaraujo.github.io/EmanuelMedinaWebsite/

Static site, no build step, deployed by GitHub Pages from `main`.

| Path | What |
|---|---|
| `index.html`, `styles.css`, `main.js` | The page and its UI (theme, section tracking, deep-dive dialogs) |
| `scene.js` | three.js 3D workcell: robot arm with analytic inverse kinematics and clickable exhibits |
| `cv/` | Web CV; `cv/Emanuel-Medina-CV.pdf` is generated from it |
| `papers/` | Seminar papers (PDF), linked from the page |
| `llms.txt` | Summary for LLMs and AI tools ([llmstxt.org](https://llmstxt.org)) |
| `assets/` | Self-hosted fonts, vendored three.js r170, images, favicon, social preview |

## Local preview

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Regenerate the CV PDF

```sh
google-chrome --headless=new --no-pdf-header-footer --print-to-pdf=cv/Emanuel-Medina-CV.pdf "file://$PWD/cv/index.html"
```

## Notes

- No third-party requests at runtime (fonts and three.js are self-hosted, for GDPR).
- No cookies, no analytics.
- Without WebGL, or with JavaScript off, the page falls back to a readable text layout.
- Phone number and street address are intentionally not published.

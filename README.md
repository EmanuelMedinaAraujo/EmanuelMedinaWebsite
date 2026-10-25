# Emanuel Medina — Personal Website

Static site, no build step. Two candidate designs live side by side until one is chosen:

| Path | What |
|---|---|
| `reach/` | 2D blueprint design with a canvas FABRIK inverse-kinematics arm |
| `workcell/` | three.js 3D workcell with an analytic-IK robot arm |
| `cv/` | Web CV; `cv/Emanuel-Medina-CV.pdf` is generated from it |
| `llms.txt` | Summary for LLMs and AI tools ([llmstxt.org](https://llmstxt.org)) |
| `assets/` | Self-hosted fonts, vendored three.js r170, images, favicon |

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
- Phone number and street address are intentionally not published.

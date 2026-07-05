# Book Revival Pipeline

A batch tool to **revive an old scanned book** — for example Avner's
*Introduction to Physical Metallurgy* — by turning an image-only scanned PDF
into a **cleaned-up, fully searchable book** and extracting (and optionally
colorizing) its **figures**.

Because it processes the whole PDF in one command, the page count doesn't
matter — you never have to upload or handle pages one at a time.

---

## What it does

| Stage | What happens | Tool used |
|-------|--------------|-----------|
| **clean** | Deskew, de-noise, and whiten every page | ocrmypdf / unpaper |
| **ocr** | Add an invisible searchable text layer *on top of* the original pages — figures/micrographs preserved exactly | ocrmypdf + tesseract |
| **extract-figures** | Pull every embedded figure out, plus full-page renders for cropping diagrams | poppler (`pdfimages`, `pdftoppm`) |
| **colorize** | *(opt-in)* Colorize the extracted figures | DeOldify (local) or hosted services |

---

## Quick start

```bash
cd book-revival

# 1. Install the tools (Debian/Ubuntu, macOS, or Fedora auto-detected)
./install.sh

# 2. Check everything is ready
python3 revive.py doctor

# 3. Run the whole pipeline on your scan
python3 revive.py all avner_scan.pdf --out build/
```

You'll get:

```
build/
├── avner_scan_searchable.pdf   <- cleaned, searchable book
├── figures/                    <- every embedded figure (fig-000.png, …)
└── pages/                      <- full-page renders at 300 DPI
```

---

## Running stages individually

```bash
# Just make it searchable (keeps figures bit-for-bit)
python3 revive.py ocr avner_scan.pdf --out build/

# Just clean/whiten the pages (no OCR text added)
python3 revive.py clean avner_scan.pdf --out build/

# Just pull the figures out
python3 revive.py extract-figures build/avner_scan_searchable.pdf --out build/

# Colorize figures (opt-in) — copies them out + guides you to a hosted service
python3 revive.py colorize build/figures --out build/figures_color --backend manual

# Colorize locally with AI (needs a GPU; installs DeOldify)
pip install -r requirements-colorize.txt
python3 revive.py colorize build/figures --out build/figures_color --backend deoldify
```

Useful flags:

- `--lang eng+deu` — OCR in multiple languages.
- `--dpi 400` — higher-resolution page renders for figure cropping.
- `--force` — re-OCR pages that already contain (bad) text.

---

## ⚠️ Metallurgy colorization caveat — please read

This book has two kinds of figures, and they colorize very differently:

- **Diagrams** (iron–carbon phase diagram, TTT/CCT curves, crystal-structure
  schematics): colorizing/recoloring these looks great and improves
  readability. ✅
- **Micrographs** (etched microstructures — pearlite, martensite, grain
  boundaries): AI colorizers are trained on natural photos, so they will
  invent **scientifically false** colors here. In real metallography, color
  comes from **tint/colour etching techniques**, not photo filters. ⚠️

**Recommendation:** recolor the *diagrams* freely; keep reference *micrographs*
cleaned-up but grayscale, or clearly label any colorized micrograph as
"artistically colorized." Great for a nicer study copy; not for teaching-grade
reference.

---

## Copyright note

Avner's *Introduction to Physical Metallurgy* is copyrighted. Reviving **your
own copy for personal study** is generally fine; redistributing a rebuilt or
colorized version is not. The `.gitignore` here deliberately excludes all PDFs
and images so no book content is ever committed to the repo.

---

## Requirements

- **Python 3.8+**
- System tools (installed by `./install.sh`): `ocrmypdf`, `tesseract-ocr`,
  `poppler-utils`, `ghostscript`, `imagemagick`.
- *(optional, for local colorization)* `deoldify`, `torch` — see
  `requirements-colorize.txt`.

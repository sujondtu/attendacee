#!/usr/bin/env python3
"""
revive.py - Batch pipeline to revive an old scanned book.

Turns a scanned (image-only) PDF such as Avner's "Introduction to Physical
Metallurgy" into a cleaned-up, searchable book, and can extract and colorize
its figures.

Stages (run individually or all at once):

  clean            Deskew, de-noise and whiten every page.
  ocr              Add a searchable text layer (figures preserved exactly).
  extract-figures  Pull every embedded figure/micrograph out to /figures.
  colorize         Optionally AI-colorize the extracted figures.
  all              clean -> ocr -> extract-figures (colorize is opt-in).

The heavy lifting is done by well-established tools (ocrmypdf, tesseract,
poppler, imagemagick). This script just orchestrates them, checks that they
are installed, and keeps the whole book flowing through in one command so the
page count never matters.

Usage:
  python3 revive.py all      input_scan.pdf  --out build/
  python3 revive.py ocr      input_scan.pdf  --out build/
  python3 revive.py extract-figures build/avner_searchable.pdf --out build/
  python3 revive.py colorize build/figures   --out build/figures_color
  python3 revive.py doctor   # check what's installed

See README.md for the full guide and the metallurgy colorization caveat.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"


def say(msg, color=CYAN):
    print(f"{color}{msg}{RESET}")


def warn(msg):
    print(f"{YELLOW}⚠  {msg}{RESET}")


def fail(msg, code=1):
    print(f"{RED}✖  {msg}{RESET}")
    sys.exit(code)


def have(tool):
    """Return the resolved path of a command-line tool, or None."""
    return shutil.which(tool)


def run(cmd, **kwargs):
    """Run a subprocess, echoing the command first."""
    printable = " ".join(str(c) for c in cmd)
    say(f"$ {printable}", color=BOLD)
    return subprocess.run(cmd, check=True, **kwargs)


# Tools each stage needs. (command -> human-friendly package hint)
REQUIREMENTS = {
    "clean": {"ocrmypdf": "ocrmypdf", "tesseract": "tesseract-ocr"},
    "ocr": {"ocrmypdf": "ocrmypdf", "tesseract": "tesseract-ocr"},
    "extract-figures": {},  # checked lazily: PyMuPDF (preferred) or poppler
    "colorize": {},  # checked lazily, backend is optional
}


def require(stage):
    """Verify the tools a stage needs are present; explain how to fix if not."""
    missing = {c: pkg for c, pkg in REQUIREMENTS.get(stage, {}).items() if not have(c)}
    if missing:
        warn(f"Stage '{stage}' needs tools that are not installed:")
        for cmd, pkg in missing.items():
            print(f"    - {cmd}  (install package: {pkg})")
        print()
        print("  Run the installer:   ./install.sh")
        print("  Or check status:     python3 revive.py doctor")
        fail("Missing dependencies.")


# --------------------------------------------------------------------------- #
# Stages
# --------------------------------------------------------------------------- #

def stage_ocr(pdf: Path, out_dir: Path, lang: str, clean: bool, force: bool):
    """
    Run ocrmypdf over the whole book. ocrmypdf adds an invisible, searchable
    text layer *on top of* the original scanned pages, so every figure and
    micrograph is preserved bit-for-bit. --deskew/--clean straighten and
    de-noise; --rotate-pages fixes sideways scans.
    """
    require("ocr")
    out_dir.mkdir(parents=True, exist_ok=True)
    result = out_dir / f"{pdf.stem}_searchable.pdf"

    cmd = [
        "ocrmypdf",
        "--language", lang,
        "--deskew",
        "--rotate-pages",
        "--optimize", "1",
        "--output-type", "pdf",
    ]
    if clean:
        # --clean removes speckle for better OCR; --clean-final would also
        # bake the cleaned image into the output. We keep the original image
        # visible and only clean the copy that OCR reads.
        cmd += ["--clean"]
    if force:
        cmd += ["--force-ocr"]
    else:
        # Skip pages that already have text (safe to re-run).
        cmd += ["--skip-text"]
    cmd += [str(pdf), str(result)]

    run(cmd)
    say(f"✓ Searchable book written to: {result}", color=GREEN)
    return result


def stage_clean(pdf: Path, out_dir: Path, force: bool):
    """
    A dedicated page-cleanup pass: deskew + background whitening, no OCR text
    added. Useful when you want a cleaned scan without (or before) OCR.
    """
    require("clean")
    out_dir.mkdir(parents=True, exist_ok=True)
    result = out_dir / f"{pdf.stem}_cleaned.pdf"
    cmd = [
        "ocrmypdf",
        "--deskew",
        "--rotate-pages",
        "--clean-final",     # bake the cleaned/whitened image into the output
        "--tesseract-timeout", "0",  # skip actual OCR, image-processing only
        str(pdf), str(result),
    ]
    if force:
        cmd.insert(1, "--force-ocr")
    run(cmd)
    say(f"✓ Cleaned book written to: {result}", color=GREEN)
    return result


def stage_extract_figures(pdf: Path, out_dir: Path, dpi: int):
    """
    Extract figures two ways and keep whichever you prefer:
      1) embedded image objects (best quality, exact) — great for micrographs.
      2) full-page renders at <dpi> so you can crop diagrams made of several
         image fragments or vector overlays.

    Prefers PyMuPDF (`pip install pymupdf`, pure-Python, works everywhere incl.
    Windows). Falls back to poppler's pdfimages/pdftoppm if PyMuPDF is absent.
    """
    fig_dir = out_dir / "figures"
    page_dir = out_dir / "pages"
    fig_dir.mkdir(parents=True, exist_ok=True)
    page_dir.mkdir(parents=True, exist_ok=True)

    if _have_pymupdf():
        _extract_pymupdf(pdf, fig_dir, page_dir, dpi)
    elif have("pdfimages") and have("pdftoppm"):
        say("PyMuPDF not found; using poppler (pdfimages/pdftoppm)…")
        run(["pdfimages", "-png", "-p", str(pdf), str(fig_dir / "fig")])
        run(["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(page_dir / "page")])
    else:
        warn("Figure extraction needs either PyMuPDF or poppler.")
        print("    pip install pymupdf        (recommended, cross-platform)")
        print("    or install poppler-utils   (Linux/macOS)")
        fail("No figure-extraction backend available.")

    n_fig = len(list(fig_dir.glob("*.png")))
    n_page = len(list(page_dir.glob("*.png")))
    say(f"✓ {n_fig} embedded images -> {fig_dir}", color=GREEN)
    say(f"✓ {n_page} page renders   -> {page_dir}", color=GREEN)
    say("  Tip: use the page renders to crop diagrams; use the embedded "
        "images for the cleanest micrographs.")
    return fig_dir


def _have_pymupdf():
    try:
        import fitz  # noqa: F401  (PyMuPDF)
        return True
    except Exception:
        return False


def _extract_pymupdf(pdf: Path, fig_dir: Path, page_dir: Path, dpi: int):
    """Extract embedded images and render full pages using PyMuPDF."""
    import fitz
    say("Extracting figures with PyMuPDF…")
    doc = fitz.open(str(pdf))
    try:
        for pno in range(len(doc)):
            page = doc[pno]
            for i, img in enumerate(page.get_images(full=True)):
                pix = fitz.Pixmap(doc, img[0])
                if pix.n - pix.alpha >= 4:      # CMYK/other -> RGB for PNG
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                pix.save(str(fig_dir / f"fig-p{pno + 1:04d}-{i:02d}.png"))
                pix = None
            page.get_pixmap(dpi=dpi).save(str(page_dir / f"page-{pno + 1:04d}.png"))
    finally:
        doc.close()


def stage_colorize(src_dir: Path, out_dir: Path, backend: str):
    """
    Optionally colorize extracted figures.

    IMPORTANT metallurgy caveat: AI colorizers are trained on natural photos.
    They look great on DIAGRAMS (phase diagrams, TTT curves, schematics) but
    will invent scientifically FALSE colors on etched MICROGRAPHS. Real color
    in metallography comes from tint/colour etching, not photo filters. Use
    this for a nicer-looking study copy, and keep reference micrographs
    grayscale (or clearly label them as artistically colorized).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    images = sorted([p for p in src_dir.glob("*.png")] +
                    [p for p in src_dir.glob("*.jpg")])
    if not images:
        fail(f"No images found in {src_dir}")

    warn("Micrograph colorization is decorative, not scientifically accurate. "
         "See the note in README.md before using colorized micrographs for study.")

    if backend == "deoldify":
        _colorize_deoldify(images, out_dir)
    elif backend == "manual":
        _colorize_manual_guide(images, out_dir)
    else:
        fail(f"Unknown colorize backend: {backend}")


def _colorize_deoldify(images, out_dir):
    try:
        # DeOldify is an optional heavy dependency; imported lazily.
        from deoldify import device                     # noqa: F401
        from deoldify.device_id import DeviceId          # noqa: F401
        from deoldify.visualize import get_image_colorizer
    except Exception:
        warn("DeOldify is not installed.")
        print("  Install it (GPU recommended):")
        print("    pip install -r requirements-colorize.txt")
        print("  Or use a hosted colorizer (Palette.fm, MyHeritage, DeepAI).")
        fail("Colorize backend 'deoldify' unavailable.")

    colorizer = get_image_colorizer(artistic=True)
    for img in images:
        dest = out_dir / img.name
        say(f"Colorizing {img.name} …")
        result = colorizer.get_transformed_image(str(img), render_factor=35)
        result.save(dest)
    say(f"✓ Colorized figures -> {out_dir}", color=GREEN)


def _colorize_manual_guide(images, out_dir):
    """No local ML: copy figures out and print a batch upload guide."""
    for img in images:
        shutil.copy2(img, out_dir / img.name)
    say(f"✓ Copied {len(images)} figures to {out_dir}", color=GREEN)
    print("  Batch-colorize these with a hosted service:")
    print("    • Palette.fm      – prompt-controllable, best for diagrams")
    print("    • MyHeritage      – strong on photos")
    print("    • DeepAI colorize – has a simple API for scripting")


def stage_all(pdf: Path, out_dir: Path, lang: str, force: bool, dpi: int):
    cleaned = stage_ocr(pdf, out_dir, lang=lang, clean=True, force=force)
    stage_extract_figures(cleaned, out_dir, dpi=dpi)
    say("\n✓ Pipeline complete.", color=GREEN)
    say("  Searchable book + extracted figures are in: " + str(out_dir))
    say("  To colorize the figures (opt-in):")
    say(f"    python3 revive.py colorize {out_dir/'figures'} "
        f"--out {out_dir/'figures_color'} --backend manual")


def cmd_doctor():
    say("Dependency check", color=BOLD)
    # Core tools needed for OCR (the searchable-book step).
    core = {
        "ocrmypdf": "OCR + page cleanup",
        "tesseract": "OCR engine",
        "gs": "PDF/PostScript (ghostscript, used by ocrmypdf)",
    }
    core_ok = True
    for tool, purpose in core.items():
        path = have(tool)
        mark = f"{GREEN}✓{RESET}" if path else f"{RED}✖{RESET}"
        if not path:
            core_ok = False
        print(f"  {mark}  {tool:<11} {purpose:<40} {path or 'not found'}")

    # Figure extraction needs EITHER PyMuPDF (preferred) OR poppler.
    print()
    say("Figure extraction (need one of these)", color=BOLD)
    pymupdf_ok = _have_pymupdf()
    print(f"  {GREEN + '✓' + RESET if pymupdf_ok else RED + '✖' + RESET}  "
          f"{'pymupdf':<11} {'PyMuPDF (pip install pymupdf, cross-platform)':<40} "
          f"{'installed' if pymupdf_ok else 'not found'}")
    poppler_ok = bool(have("pdfimages") and have("pdftoppm"))
    print(f"  {GREEN + '✓' + RESET if poppler_ok else RED + '✖' + RESET}  "
          f"{'poppler':<11} {'poppler-utils (pdfimages/pdftoppm)':<40} "
          f"{'installed' if poppler_ok else 'not found'}")
    fig_ok = pymupdf_ok or poppler_ok

    print()
    if core_ok and fig_ok:
        say("All set. Run:  python3 revive.py all book.pdf", GREEN)
    else:
        if not core_ok:
            warn("Core OCR tools missing — run ./install.sh (or ./install.sh --venv).")
        if not fig_ok:
            warn("No figure-extraction backend — run: pip install pymupdf")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def build_parser():
    p = argparse.ArgumentParser(
        prog="revive.py",
        description="Revive an old scanned book: clean, OCR, extract & colorize figures.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="command", required=True)

    def add_out(sp):
        sp.add_argument("--out", type=Path, default=Path("build"),
                        help="Output directory (default: build/)")

    sp = sub.add_parser("all", help="clean -> ocr -> extract-figures")
    sp.add_argument("pdf", type=Path)
    add_out(sp)
    sp.add_argument("--lang", default="eng", help="OCR language(s), e.g. eng or eng+deu")
    sp.add_argument("--dpi", type=int, default=300, help="Page render DPI for figures")
    sp.add_argument("--force", action="store_true", help="Re-OCR pages that already have text")

    sp = sub.add_parser("ocr", help="Add a searchable text layer")
    sp.add_argument("pdf", type=Path)
    add_out(sp)
    sp.add_argument("--lang", default="eng")
    sp.add_argument("--no-clean", dest="clean", action="store_false",
                    help="Do not de-speckle before OCR")
    sp.add_argument("--force", action="store_true")

    sp = sub.add_parser("clean", help="Deskew + whiten pages (no OCR text)")
    sp.add_argument("pdf", type=Path)
    add_out(sp)
    sp.add_argument("--force", action="store_true")

    sp = sub.add_parser("extract-figures", help="Extract figures and page renders")
    sp.add_argument("pdf", type=Path)
    add_out(sp)
    sp.add_argument("--dpi", type=int, default=300)

    sp = sub.add_parser("colorize", help="Colorize extracted figures (opt-in)")
    sp.add_argument("src", type=Path, help="Directory of figure images")
    add_out(sp)
    sp.add_argument("--backend", choices=["manual", "deoldify"], default="manual",
                    help="manual = copy out + hosted-service guide; deoldify = local ML")

    sub.add_parser("doctor", help="Check which tools are installed")
    return p


def main():
    args = build_parser().parse_args()

    if args.command == "doctor":
        return cmd_doctor()

    if args.command in {"all", "ocr", "clean", "extract-figures"}:
        if not args.pdf.exists():
            fail(f"Input PDF not found: {args.pdf}")

    if args.command == "all":
        stage_all(args.pdf, args.out, lang=args.lang, force=args.force, dpi=args.dpi)
    elif args.command == "ocr":
        stage_ocr(args.pdf, args.out, lang=args.lang, clean=args.clean, force=args.force)
    elif args.command == "clean":
        stage_clean(args.pdf, args.out, force=args.force)
    elif args.command == "extract-figures":
        stage_extract_figures(args.pdf, args.out, dpi=args.dpi)
    elif args.command == "colorize":
        if not args.src.exists():
            fail(f"Source directory not found: {args.src}")
        stage_colorize(args.src, args.out, backend=args.backend)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        fail(f"A tool exited with an error (code {e.returncode}). "
             f"See the command output above.", code=e.returncode or 1)
    except KeyboardInterrupt:
        fail("Interrupted.", code=130)

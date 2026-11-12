"""Draws the Xrostr dot-matrix X as PNG app icons into public/icons/.

Run from apps/web: python3 scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
BG = (0, 0, 0, 255)
FG = (241, 241, 239, 255)
ACCENT = (255, 81, 87, 255)
# 5x5 grid; the centre dot carries the accent (same drawing as components/brand.tsx).
DOTS = [(0, 0), (4, 0), (1, 1), (3, 1), (1, 3), (3, 3), (0, 4), (4, 4)]


def draw(size: int, safe_zone: float, rounded: bool) -> Image.Image:
    scale = 4  # supersample, then downscale for smooth dots
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, s, s], fill=BG)
    grid = s * safe_zone
    origin = (s - grid) / 2
    step = grid / 4
    r = step * 0.42
    for x, y in DOTS + [(2, 2)]:
        cx, cy = origin + x * step, origin + y * step
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT if (x, y) == (2, 2) else FG)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        draw(size, 0.56, rounded=True).save(OUT / f"icon-{size}.png")
    # Maskable: full-bleed background, artwork inside the 80% safe zone.
    draw(512, 0.46, rounded=False).save(OUT / "icon-maskable-512.png")
    draw(180, 0.56, rounded=False).save(OUT / "apple-touch-icon.png")
    draw(96, 0.56, rounded=True).save(OUT / "badge-96.png")


if __name__ == "__main__":
    main()

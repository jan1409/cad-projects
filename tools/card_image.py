"""Site images from transparent Fusion screenshots: crop to the visible part, scale, palette-quantise (venv, Pillow).

Usage:
  .venv/Scripts/python.exe tools/card_image.py <raw.png> <out.png> [--width 720] [--colors 128] [--margin 12]
Card images: 720 px wide, about 40 KB. Take the raw shot with
  python -I tools/fusion_view.py raw.png --eye ... --target ... --size 1600x1200 --transparent
"""
import os
import sys

from PIL import Image


def card(src, dst, width=720, colors=128, margin=12):
    im = Image.open(src).convert("RGBA")
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box is None:
        raise SystemExit("%s is empty (fully transparent)" % src)
    im = im.crop(box)
    scale = (width - 2 * margin) / im.width
    im = im.resize((width - 2 * margin, max(1, round(im.height * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (width, im.height + 2 * margin), (0, 0, 0, 0))
    out.alpha_composite(im, (margin, margin))
    q = out.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(dst, optimize=True)
    return q.size, os.path.getsize(dst)


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 3:
        raise SystemExit(__doc__)
    opt = lambda k, d: int(argv[argv.index(k) + 1]) if k in argv else d  # noqa: E731
    size, n = card(argv[1], argv[2], opt("--width", 720), opt("--colors", 128), opt("--margin", 12))
    print("%s: %d x %d px, %.0f KB" % (argv[2], size[0], size[1], n / 1024))


if __name__ == "__main__":
    main(sys.argv)

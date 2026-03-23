#!/usr/bin/env python3
import os
import struct
import zlib
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = ROOT / "build"
PNG_PATH = BUILD_DIR / "icon-1024.png"
ICONSET_DIR = BUILD_DIR / "icon.iconset"
ICNS_PATH = BUILD_DIR / "icon.icns"

W = 1024
H = 1024


def rounded_rect_mask(x, y, w, h, r):
    # Returns callable for inside rounded rect
    x2 = x + w
    y2 = y + h
    rr = r * r

    def inside(px, py):
        if x + r <= px <= x2 - r and y <= py <= y2:
            return True
        if y + r <= py <= y2 - r and x <= px <= x2:
            return True
        # Corners
        for cx, cy in ((x + r, y + r), (x2 - r, y + r), (x + r, y2 - r), (x2 - r, y2 - r)):
            dx = px - cx
            dy = py - cy
            if dx * dx + dy * dy <= rr:
                return True
        return False

    return inside


def write_png(path, width, height, rows):
    def chunk(tag, data):
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + bytes(row) for row in rows)  # filter type 0
    ihdr = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)  # RGBA
    idat = zlib.compress(raw, level=9)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    path.write_bytes(png)


def generate_icon_png():
    rows = []
    bg_inside = rounded_rect_mask(90, 90, 844, 844, 190)
    card_inside = rounded_rect_mask(220, 250, 584, 430, 78)
    lens_inside = rounded_rect_mask(410, 350, 210, 210, 105)

    for y in range(H):
        row = []
        for x in range(W):
            # Transparent canvas
            r = g = b = 0
            a = 0

            if bg_inside(x, y):
                # Blue gradient background
                t = y / H
                r = int(25 + 20 * t)
                g = int(110 + 50 * t)
                b = int(220 + 20 * t)
                a = 255

            if card_inside(x, y):
                # Main white card
                r, g, b, a = 245, 248, 255, 255

            # Accent top bar on card
            if 220 <= x <= 804 and 250 <= y <= 315 and rounded_rect_mask(220, 250, 584, 430, 78)(x, y):
                r, g, b, a = 226, 236, 255, 255

            # Lens ring
            cx, cy = 515, 455
            dx = x - cx
            dy = y - cy
            d2 = dx * dx + dy * dy
            if 120 * 120 <= d2 <= 160 * 160:
                r, g, b, a = 64, 124, 245, 255
            elif d2 < 120 * 120 and lens_inside(x, y):
                r, g, b, a = 225, 238, 255, 255

            # Small spark
            if (x - 560) ** 2 + (y - 415) ** 2 <= 16 * 16:
                r, g, b, a = 255, 255, 255, 255

            row.extend((r, g, b, a))
        rows.append(row)

    write_png(PNG_PATH, W, H, rows)


def build_icns():
    if ICONSET_DIR.exists():
        subprocess.run(["rm", "-rf", str(ICONSET_DIR)], check=True)
    ICONSET_DIR.mkdir(parents=True, exist_ok=True)

    sizes = [16, 32, 128, 256, 512]
    for size in sizes:
        out = ICONSET_DIR / f"icon_{size}x{size}.png"
        out2x = ICONSET_DIR / f"icon_{size}x{size}@2x.png"
        subprocess.run(["sips", "-z", str(size), str(size), str(PNG_PATH), "--out", str(out)], check=True)
        subprocess.run(
            ["sips", "-z", str(size * 2), str(size * 2), str(PNG_PATH), "--out", str(out2x)],
            check=True,
        )

    subprocess.run(["iconutil", "-c", "icns", str(ICONSET_DIR), "-o", str(ICNS_PATH)], check=True)


if __name__ == "__main__":
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    generate_icon_png()
    build_icns()
    print(f"Generated {ICNS_PATH}")

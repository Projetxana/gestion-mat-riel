#!/usr/bin/env python3
"""Generate BuildTrack iOS/PWA icons from the canonical application logo.

The existing public/buildtrack-logo.png happens to contain JPEG-encoded bytes.
Pillow decodes it by content and exports real, correctly sized PNG/ICO files.
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "buildtrack-logo.png"

with Image.open(SOURCE) as source:
    logo = ImageOps.exif_transpose(source).convert("RGBA")
    # Keep the entire BuildTrack mark and text visible; never crop the logo.
    for filename, size in (
        ("apple-touch-icon.png", 180),
        ("logo192.png", 192),
        ("logo512.png", 512),
    ):
        canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        artwork = ImageOps.contain(
            logo, (int(size * 0.90), int(size * 0.90)), Image.Resampling.LANCZOS
        )
        canvas.alpha_composite(
            artwork, ((size - artwork.width) // 2, (size - artwork.height) // 2)
        )
        canvas.convert("RGB").save(PUBLIC / filename, format="PNG", optimize=True)

    icon = Image.new("RGBA", (64, 64), (255, 255, 255, 255))
    artwork = ImageOps.contain(logo, (58, 58), Image.Resampling.LANCZOS)
    icon.alpha_composite(
        artwork, ((64 - artwork.width) // 2, (64 - artwork.height) // 2)
    )
    icon.convert("RGB").save(
        PUBLIC / "favicon.ico", format="ICO", sizes=[(64, 64), (32, 32), (16, 16)]
    )
print("Generated BuildTrack icons: iOS 180, PWA 192/512, favicon")

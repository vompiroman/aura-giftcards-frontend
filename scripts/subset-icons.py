"""Regenerate the Aura Stream subset from an extracted Font Awesome Free 6.7.2 release.

Requires fonttools[woff]. Run python scripts/subset-icons.py <release-directory>.
Published assets are committed, so the frontend build does not require Python.
"""

from argparse import ArgumentParser
from collections import defaultdict
from pathlib import Path
import re
from shutil import copyfile

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
FONTS = {
    "solid": ("fa-solid-900.woff2", 900),
    "regular": ("fa-regular-400.woff2", 400),
    "brands": ("fa-brands-400.woff2", 400),
}
USED_ICON = re.compile(r"\bfa-(solid|regular|brands)\s+(fa-[\w-]+)")
GLYPH = re.compile(r'\.(fa-[\w-]+)\s*\{\s*--fa:\s*"\\([a-fA-F0-9]+)"')


def build_font(source, destination, family, glyphs):
    options = subset.Options()
    options.name_IDs = ["*"]
    with TTFont(source) as font:
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=glyphs)
        subsetter.subset(font)
        missing = glyphs - font.getBestCmap().keys()
        if missing:
            raise ValueError(f"{source.name} is missing glyphs: {missing}")
        name = f"Aura Stream Icons {family.title()}"
        postscript = f"AuraStreamIcons-{family.title()}"
        names = {
            1: name, 3: postscript + " 6.7.2", 4: name, 6: postscript,
            16: name, 20: postscript, 21: name, 25: postscript,
        }
        for entry in font["name"].names:
            if entry.nameID in names:
                entry.string = names[entry.nameID]
        font.flavor = "woff2"
        font.save(destination)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("release", type=Path)
    source = parser.parse_args().release
    output = ROOT / "public" / "aura-icons"
    output.mkdir(exist_ok=True)
    mapping = {
        icon: int(code, 16)
        for icon, code in GLYPH.findall((source / "css" / "all.css").read_text(encoding="utf-8"))
    }
    used = defaultdict(set)
    for path in [ROOT / "index.html", *(ROOT / "src").rglob("*.js")]:
        for family, icon in USED_ICON.findall(path.read_text(encoding="utf-8")):
            used[family].add(icon)

    css = [
        "/* Font Awesome Free 6.7.2 subset. See LICENSE.txt in this directory. */",
        ".fa-solid, .fa-regular, .fa-brands { display: inline-block; font-style: normal; font-variant: normal; line-height: 1; text-rendering: auto; -webkit-font-smoothing: antialiased; }",
        ".fa-solid::before, .fa-regular::before, .fa-brands::before { content: var(--aura-icon); }",
        ".fa-spin { animation: aura-icon-spin 2s linear infinite; }",
        "@keyframes aura-icon-spin { to { transform: rotate(360deg); } }",
        "@media (prefers-reduced-motion: reduce) { .fa-spin { animation: none; } }",
    ]
    for family, (name, weight) in FONTS.items():
        filename = f"aura-icons-{family}.woff2"
        font_name = f"Aura Stream Icons {family.title()}"
        build_font(source / "webfonts" / name, output / filename, family, {mapping[icon] for icon in used[family]})
        css.append(f'@font-face {{ font-family: "{font_name}"; src: url("./{filename}") format("woff2"); font-weight: {weight}; font-display: block; }}')
        css.append(f'.fa-{family} {{ font-family: "{font_name}"; font-weight: {weight}; }}')

    for icon in sorted(set().union(*used.values())):
        css.append(f'.{icon} {{ --aura-icon: "\\{mapping[icon]:x}"; }}')
    (output / "icons.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    copyfile(source / "LICENSE.txt", output / "LICENSE.txt")


if __name__ == "__main__":
    main()

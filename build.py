#!/usr/bin/env python3
"""Build install packages into dist/.

  python build.py            -> dist/OLED-True-Black-vX-chromium.zip   (Edge/Chrome/Brave/Opera/Vivaldi: unzip + Load unpacked)
                                dist/OLED-True-Black-vX-firefox.zip    (upload to addons.mozilla.org, or about:debugging)
                                dist/OLED-Black-Theme-firefox.zip      (Firefox theme, upload separately)
                                dist/*-chromium-store.zip               (Chrome Web Store / Edge Add-ons: extension without update checker, and theme)
"""
import json, pathlib, shutil, tempfile, zipfile

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "extension"
DIST = ROOT / "dist"
SKIP = {"manifest.firefox.json", "background.store.js"}


def zip_dir(folder: pathlib.Path, out: pathlib.Path, prefix: str = ""):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(folder.rglob("*")):
            if f.is_file():
                z.write(f, prefix + f.relative_to(folder).as_posix())


def main():
    version = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))["version"]
    DIST.mkdir(exist_ok=True)
    for old in DIST.glob("*.zip"):
        old.unlink()

    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        # Chromium: extension + theme in one folder, as people load them unpacked
        chromium = tmp / "OLED-True-Black"
        shutil.copytree(SRC, chromium / "extension", ignore=shutil.ignore_patterns(*SKIP))
        shutil.copytree(ROOT / "theme", chromium / "theme")
        shutil.copy(ROOT / "INSTALL.txt", chromium / "INSTALL.txt")
        zip_dir(chromium, DIST / f"OLED-True-Black-v{version}-chromium.zip", "OLED-True-Black/")

        # Firefox: manifest must sit at the zip root (AMO requirement)
        ff = tmp / "firefox"
        shutil.copytree(SRC, ff, ignore=shutil.ignore_patterns(*SKIP))
        shutil.copy(SRC / "manifest.firefox.json", ff / "manifest.json")
        shutil.copy(SRC / "background.store.js", ff / "background.js")  # no GitHub update checker in the Firefox build
        zip_dir(ff, DIST / f"OLED-True-Black-v{version}-firefox.zip")

    # Chrome Web Store / Edge Add-ons: manifest at the zip root, no GitHub update checker
    with tempfile.TemporaryDirectory() as tmp:
        st = pathlib.Path(tmp) / "store"
        shutil.copytree(SRC, st, ignore=shutil.ignore_patterns(*SKIP))
        shutil.copy(SRC / "background.store.js", st / "background.js")
        m = json.loads((st / "manifest.json").read_text(encoding="utf-8"))
        m["permissions"] = [p for p in m["permissions"] if p != "alarms"]
        m.pop("host_permissions", None)
        (st / "manifest.json").write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
        zip_dir(st, DIST / f"OLED-True-Black-v{version}-chromium-store.zip")
    zip_dir(ROOT / "theme", DIST / "OLED-Black-Theme-chromium-store.zip")
    zip_dir(ROOT / "theme-firefox", DIST / "OLED-Black-Theme-firefox.zip")
    for f in sorted(DIST.glob("*.zip")):
        print(f.name, f.stat().st_size, "bytes")


if __name__ == "__main__":
    main()

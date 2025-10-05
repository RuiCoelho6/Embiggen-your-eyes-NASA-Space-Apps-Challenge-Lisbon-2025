#!/usr/bin/env python3
import os
import re
import sys
import shutil
import unicodedata
from pathlib import Path
from typing import Dict, Optional, Tuple, List

import pyvips
from PIL import Image
from lxml import etree as ET

# ======== defaults ========
DEFAULT_ASSETS_DIR = "assets"
DEFAULT_TILE_SIZE = 512
DEFAULT_OVERLAP = 2
DEFAULT_JPEG_QUALITY = 90
SUPPORTED_INPUTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}

def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", text).strip("-").lower()
    return text or "image"

def _ensure_clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)

def _choose_format(img: pyvips.Image, force: Optional[str]) -> str:
    if force:
        f = force.lower()
        if f in ("jpg", "jpeg", "png"):
            return "jpg" if f == "jpeg" else f
        raise ValueError("force_format tem de ser 'jpg', 'jpeg' ou 'png'")
    try:
        has_alpha = bool(img.hasalpha())
    except Exception:
        has_alpha = False
    return "png" if has_alpha else "jpg"

def _fix_dzi_format(dzi_file: Path, fmt: str) -> None:
    xml = ET.parse(str(dzi_file))
    root = xml.getroot()
    root.attrib["Format"] = fmt
    xml.write(str(dzi_file), xml_declaration=True, encoding="UTF-8", pretty_print=True)

def _validate_some_tiles(tiles_dir: Path, sample_limit: int = 40) -> List[Tuple[Path, str]]:
    problems: List[Tuple[Path, str]] = []
    count = 0
    for level_dir in sorted(tiles_dir.iterdir(), key=lambda p: int(p.name) if p.name.isdigit() else 0):
        if not level_dir.is_dir():
            continue
        for f in sorted(level_dir.iterdir()):
            if f.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            try:
                if f.stat().st_size == 0:
                    problems.append((f, "zero-bytes"))
                else:
                    with Image.open(f) as im:
                        im.verify()
            except Exception as e:
                problems.append((f, f"decode-failed: {e}"))
            count += 1
            if count >= sample_limit:
                return problems
    return problems

# -------------- NOVO: normalizar resolução p/ um maxLevel alvo --------------
def _resize_to_target_level(img: pyvips.Image, target_max_level: int) -> pyvips.Image:
    """Redimensiona a imagem para que ceil(log2(max(w,h))) == target_max_level."""
    target_dim = 2 ** target_max_level
    max_dim = max(img.width, img.height)
    scale = target_dim / float(max_dim)
    if abs(scale - 1.0) < 1e-9:
        return img
    # melhor qualidade: kernel lanczos3
    return img.resize(scale, kernel="lanczos3")

# -------------- NOVO: reindexar pastas de níveis (offset) -------------------
def _reindex_levels(tiles_dir: Path, offset: int) -> None:
    """Aplica offset aos diretórios de níveis (ex.: +1 para passar 0..N -> 1..N+1)."""
    # recolhe níveis existentes
    levels = [int(d.name) for d in tiles_dir.iterdir() if d.is_dir() and d.name.isdigit()]
    if not levels:
        return
    if offset == 0:
        return
    # renomeia de forma segura (desc/asc conforme o sinal do offset)
    for l in sorted(levels, reverse=(offset > 0)):
        src = tiles_dir / str(l)
        tmp = tiles_dir / f"__tmp_{l}"
        dst = tiles_dir / str(l + offset)
        src.rename(tmp)
        tmp.rename(dst)

# -------------- NOVO: aparar níveis acima de um máximo ----------------------
def _clamp_max_level(tiles_dir: Path, max_level: int) -> None:
    for d in tiles_dir.iterdir():
        if d.is_dir() and d.name.isdigit() and int(d.name) > max_level:
            shutil.rmtree(d)

def generate_dzi(
    input_path: str,
    *,
    assets_root: str = DEFAULT_ASSETS_DIR,
    folder_name: Optional[str] = None,
    tile_size: int = DEFAULT_TILE_SIZE,
    overlap: int = DEFAULT_OVERLAP,
    force_format: Optional[str] = None,   # 'jpg' | 'png' | None(auto)
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
    depth: str = "onepixel",              # 'one' | 'onetile' | 'onepixel'
    centre: bool = True,
    # -------------------- NOVOS PARÂMETROS --------------------
    target_max_level: Optional[int] = None,  # ex.: 12  -> normaliza resolução
    start_level: int = 0,                    # ex.: 1   -> pastas começam em 1
    clamp_levels_to: Optional[int] = None,   # ex.: 12  -> remove níveis > 12
) -> Dict[str, str]:
    """Gera Deep Zoom pronto para Flutter/React/OSD, com normalização opcional."""
    src = Path(input_path)
    if not src.exists():
        raise FileNotFoundError(f"Ficheiro não encontrado: {src}")
    if src.suffix.lower() not in SUPPORTED_INPUTS:
        raise ValueError(f"Formato não suportado: {src.suffix}. Suporta {sorted(SUPPORTED_INPUTS)}")

    base = _slugify(folder_name or src.stem)
    target_dir = Path(assets_root) / base
    _ensure_clean_dir(target_dir)

    base_out = target_dir / base
    dzi_file = base_out.with_suffix(".dzi")

    img = pyvips.Image.new_from_file(str(src), access="sequential")

    try:
        img = img.autorot()
    except Exception:
        pass

    # ----------- NOVO: normalizar para um maxLevel alvo -----------
    if target_max_level is not None:
        img = _resize_to_target_level(img, target_max_level)

    fmt = _choose_format(img, force_format)
    suffix = f".jpg[Q={jpeg_quality}]" if fmt == "jpg" else ".png"

    img.dzsave(
        str(base_out),
        tile_size=tile_size,
        overlap=overlap,
        suffix=suffix,
        depth=depth,
        centre=centre,
    )

    default_tiles = target_dir / f"{base}_files"
    tiles_dir = target_dir / "tiles"
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    if not default_tiles.exists():
        raise RuntimeError(f"Pasta de tiles não encontrada: {default_tiles}")
    default_tiles.rename(tiles_dir)

    _fix_dzi_format(dzi_file, fmt)

    # ----------- NOVO: aparar níveis acima de um máximo -----------
    if clamp_levels_to is not None:
        _clamp_max_level(tiles_dir, clamp_levels_to)

    # ----------- NOVO: reindexar níveis (ex.: 0..N -> 1..N+1) -----
    if start_level != 0:
        # descobrir o nível mais baixo atual (normalmente 0)
        existing = [int(d.name) for d in tiles_dir.iterdir() if d.is_dir() and d.name.isdigit()]
        min_existing = min(existing) if existing else 0
        _reindex_levels(tiles_dir, start_level - min_existing)

    problems = _validate_some_tiles(tiles_dir, sample_limit=80)
    if problems:
        print("⚠️  Aviso: Algumas tiles parecem problemáticas:")
        for p, why in problems[:12]:
            print(f"   - {why}: {p}")
        print("   (o viewer mostra transparente, mas o ideal é regenerar.)")

    print("✔ DZI gerado")
    print(f"  • pasta:       {target_dir}")
    print(f"  • .dzi:        {dzi_file.name} (Format={fmt})")
    print(f"  • tiles:       {tiles_dir}")
    print(f"  • tile_size:   {tile_size}  overlap: {overlap}  depth: {depth}")
    if target_max_level is not None:
        print(f"  • target_max_level: {target_max_level}")
    if start_level != 0:
        print(f"  • start_level: {start_level}")
    if clamp_levels_to is not None:
        print(f"  • clamp_levels_to: {clamp_levels_to}")

    return {
        "folder": str(target_dir),
        "dzi": str(dzi_file),
        "tiles_dir": str(tiles_dir),
        "format": fmt,
    }

# --- CLI ---
def _usage():
    print("Uso:")
    print("  python deepzoom_gen.py <imagem> [nome_da_pasta]")
    print("       [--png|--jpg] [--tile 512] [--overlap 2] [--assets assets]")
    print("       [--target-max-level 12] [--start-level 1] [--clamp 12]")
    sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        _usage()

    img_path = sys.argv[1]
    name = None
    force = None
    tile = DEFAULT_TILE_SIZE
    ov = DEFAULT_OVERLAP
    assets = DEFAULT_ASSETS_DIR
    target_ml = None
    start_lvl = 0
    clamp_to = None

    i = 2
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == "--png":
            force = "png"
        elif a == "--jpg":
            force = "jpg"
        elif a == "--tile":
            i += 1; tile = int(sys.argv[i])
        elif a == "--overlap":
            i += 1; ov = int(sys.argv[i])
        elif a == "--assets":
            i += 1; assets = sys.argv[i]
        elif a == "--target-max-level":
            i += 1; target_ml = int(sys.argv[i])
        elif a == "--start-level":
            i += 1; start_lvl = int(sys.argv[i])  # p.ex., 1
        elif a == "--clamp":
            i += 1; clamp_to = int(sys.argv[i])
        elif a.startswith("-"):
            _usage()
        else:
            name = a
        i += 1

    generate_dzi(
        img_path,
        assets_root=assets,
        folder_name=name,
        tile_size=tile,
        overlap=ov,
        force_format=force,
        target_max_level=target_ml,
        start_level=start_lvl,
        clamp_levels_to=clamp_to,
    )

import os
import shutil
import unicodedata
import re
import pyvips
from pathlib import Path
from typing import Dict, Optional

# =========================
# Configurações por omissão
# =========================
DEFAULT_ASSETS_DIR = "assets"
DEFAULT_TILE_SIZE = 512
DEFAULT_OVERLAP = 2
DEFAULT_QUALITY = 90  # JPEG quality
SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", text).strip("-").lower()
    # evitar nomes só com extensão
    return text or "image"


def _ensure_clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def process_image(
    input_file: str,
    assets_dir: str = DEFAULT_ASSETS_DIR,
    folder_name: Optional[str] = None,
    tile_size: int = DEFAULT_TILE_SIZE,
    overlap: int = DEFAULT_OVERLAP,
    quality: int = DEFAULT_QUALITY,
) -> Dict[str, str]:
    """
    Converte uma imagem grande em Deep Zoom (DZI + tiles) dentro de /assets.
    Estrutura final:
      assets/<folder>/ <folder>.dzi
      assets/<folder>/ tiles/  <…tiles gerados…>

    Returns: dict com caminhos úteis.
    """
    src = Path(input_file)
    if not src.exists():
        raise FileNotFoundError(f"Ficheiro não encontrado: {src}")

    ext = src.suffix.lower()
    if ext not in SUPPORTED_EXTS:
        raise ValueError(f"Tipo não suportado: {ext} (suporta {sorted(SUPPORTED_EXTS)})")

    # nome base da pasta (por omissão, nome do ficheiro sem extensão)
    base_name = folder_name or _slugify(src.stem)

    assets_root = Path(assets_dir)
    target_dir = assets_root / base_name
    _ensure_clean_dir(target_dir)

    # Caminho base para o dzsave (pyvips vai gerar <base>.dzi e <base>_files/)
    base_output_path = target_dir / base_name  # ex: assets/marte/marte
    dzi_file = base_output_path.with_suffix(".dzi")

    # Carregar imagem
    image = pyvips.Image.new_from_file(str(src), access="sequential")

    # Autorot (se não houver EXIF não faz nada e não dá erro)
    try:
        image = image.autorot()
    except Exception:
        pass

    # Descobrir se devemos usar PNG (alpha/transparência) ou JPEG
    use_png_tiles = False
    try:
        use_png_tiles = bool(getattr(image, "hasalpha")() if hasattr(image, "hasalpha") else False)
    except Exception:
        use_png_tiles = False

    tile_suffix = ".png" if use_png_tiles else ".jpg"

    # Gerar DZI + tiles com pyvips
    # depth="onepixel" cria todos os níveis até 1 px — ótimo para zoom profundo
    # centre=True para uma melhor distribuição
    kwargs = dict(
        tile_size=tile_size,
        overlap=overlap,
        suffix=tile_suffix,
        depth="onepixel",
        centre=True,
    )
    if not use_png_tiles:
        kwargs["Q"] = quality  # só aplica a JPEG

    image.dzsave(str(base_output_path), **kwargs)

    # Renomear a pasta padrão <base>_files para tiles/
    default_tiles_dir = target_dir / f"{base_name}_files"
    final_tiles_dir = target_dir / "tiles"
    if final_tiles_dir.exists():
        shutil.rmtree(final_tiles_dir)
    if default_tiles_dir.exists():
        default_tiles_dir.rename(final_tiles_dir)
    else:
        # fallback: alguns ambientes/flags podem gerar outro nome;
        # garantimos que há uma pasta de tiles
        raise RuntimeError("Pasta de tiles não encontrada após dzsave.")

    return {
        "folder": str(target_dir),
        "dzi": str(dzi_file),
        "tiles_dir": str(final_tiles_dir),
        "tile_suffix": tile_suffix,
    }


if __name__ == "__main__":
    # Exemplo rápido de utilização:
    # python imageLoader.py /caminho/para/ficheiro.png
    import sys
    if len(sys.argv) < 2:
        print("Uso: python imageLoader.py <imagem> [nome_da_pasta]")
        sys.exit(1)

    img_path = sys.argv[1]
    folder = sys.argv[2] if len(sys.argv) >= 3 else None
    info = process_image(img_path, folder_name=folder)
    print("✔ Deep Zoom gerado:")
    for k, v in info.items():
        print(f"  - {k}: {v}")

# Bu araç @keyiflerolsun tarafından | @KekikAkademi için yazılmıştır.

from CLI           import konsol
from pathlib       import Path
from rich.table    import Table
from rich.panel    import Panel
from rich          import box
from rjsmin        import jsmin as js_minify
from csscompressor import compress as css_minify
import re
from pathlib import PurePath

def minify_assets():
    """Tüm CSS ve JS dosyalarını minify et"""

    minified_count = 0
    results        = []

    # CSS dosyalarını minify et
    for css_file in Path(".").rglob("*.css"):
        # Zaten minified ise atla
        if css_file.name.endswith(".min.css"):
            continue

        try:
            with open(css_file, "r", encoding="utf-8") as f:
                original = f.read()

            minified = css_minify(original)

            # .min.css olarak kaydet
            min_file = css_file.with_stem(css_file.stem + ".min")
            with open(min_file, "w", encoding="utf-8") as f:
                f.write(minified)

            # Boyut
            original_size = len(original.encode("utf-8"))
            minified_size = len(minified.encode("utf-8"))
            reduction     = ((original_size - minified_size) / original_size) * 100

            results.append({
                "type"      : "[cyan]CSS[/]",
                "file"      : css_file.name,
                "original"  : f"{original_size:,} B",
                "minified"  : f"{minified_size:,} B",
                "reduction" : f"[green]{reduction:.1f}%[/]"
            })
            minified_count += 1

        except Exception as e:
            konsol.log(f"[red]✗ CSS minify hatası[/] ({css_file}): {e}")
    
    # JS dosyalarını minify et
    for js_file in Path(".").rglob("*.js"):
        # Zaten minified ise atla
        if js_file.name.endswith(".min.js"):
            continue

        try:
            with open(js_file, "r", encoding="utf-8") as f:
                original = f.read()

            minified = js_minify(original)

            # .min.js olarak kaydet
            min_file = js_file.with_stem(js_file.stem + ".min")
            with open(min_file, "w", encoding="utf-8") as f:
                f.write(minified)

            # Boyut
            original_size = len(original.encode("utf-8"))
            minified_size = len(minified.encode("utf-8"))
            reduction     = ((original_size - minified_size) / original_size) * 100

            results.append({
                "type"      : "[yellow]JS[/]",
                "file"      : js_file.name,
                "original"  : f"{original_size:,} B",
                "minified"  : f"{minified_size:,} B",
                "reduction" : f"[green]{reduction:.1f}%[/]"
            })
            minified_count += 1

        except Exception as e:
            konsol.log(f"[red]✗ JS minify hatası[/] ({js_file}): {e}")

    if results:
        table = Table(
            title        = "[yellow]🔨 Asset Minification[/] [magenta]:rocket:[/]",
            box          = box.SIMPLE_HEAVY,
            show_header  = True,
            show_lines   = False,
            header_style = "bold magenta",
            padding      = (0, 1),
            pad_edge     = False
        )
        table.add_column("Tip",      no_wrap=True)
        table.add_column("Dosya",    style="white")
        table.add_column("Orijinal", style="yellow", justify="right")
        table.add_column("Minified", style="magenta",  justify="right")
        table.add_column("Azalma",   justify="right")

        for result in results:
            table.add_row(
                result["type"],
                result["file"],
                result["original"],
                result["minified"],
                result["reduction"]
            )

        toplam_boyut = sum(
            int(result["original"].replace(" B", "").replace(",", ""))
            for result in results
        )
        toplam_minified = sum(
            int(result["minified"].replace(" B", "").replace(",", ""))
            for result in results
        )
        toplam_kazanc = ((toplam_boyut - toplam_minified) / toplam_boyut) * 100
        table.add_row(
            "",
            "[bold]Toplam[/]",
            f"[bold yellow]{toplam_boyut / 1024:.2f} KB[/]",
            f"[bold magenta]{toplam_minified / 1024:.2f} KB[/]",
            f"[bold green]{toplam_kazanc:.1f}%[/]",
        )
        table.caption = f"[bold green]✓ {minified_count} dosya minify edildi[/]"

        panel = Panel.fit(
            renderable   = table,
            box          = box.ROUNDED,
            title        = "[bold cyan]📦 Minification Raporu[/]",
            border_style = "cyan",
            padding      = (0, 0)
        )

        konsol.print(panel)
    else:
        konsol.log("[bold yellow]ℹ Minify edilecek dosya yok[/]\n")


def bundle_css_file(css_root: Path, entry_filename: str, output_filename: str):
    """Bundle a CSS file with its imports into a single file"""
    entry_file = css_root / entry_filename

    if not entry_file.exists():
        konsol.log(f"[yellow]Warning: {entry_filename} not found, skipping bundle step[/]")
        return False

    try:
        with open(entry_file, "r", encoding="utf-8") as f:
            content = f.read()

        # Find all @import url('./...') occurrences
        imports = re.findall(r"@import\s+url\(['\"]?([^'\")]+)['\"]?\)\s*;?", content)

        bundle_parts = []

        for imp in imports:
            # Skip remote imports
            if imp.startswith("http://") or imp.startswith("https://"):
                bundle_parts.append(f"@import url('{imp}');")
                continue

            # Resolve relative to css_root
            imp_path = css_root / PurePath(imp).as_posix().lstrip("./")
            if imp_path.exists():
                with open(imp_path, "r", encoding="utf-8") as f:
                    part = f.read()
                bundle_parts.append("/* --- Begin: %s --- */\n" % imp_path.name)
                bundle_parts.append(part)
                bundle_parts.append("\n/* --- End: %s --- */\n" % imp_path.name)
            else:
                konsol.log(f"[yellow]Warning: referenced import not found: {imp_path}[/]")

        # Remove the import statements from the original content
        content_without_imports = re.sub(r"@import\s+url\(['\"]?([^'\")]+)['\"]?\)\s*;?", "", content)

        # Concatenate the parts and the remaining content
        bundled = "\n".join(bundle_parts) + "\n" + content_without_imports

        # Minify the final bundle
        bundled_min = css_minify(bundled)

        bundle_file = css_root / output_filename
        with open(bundle_file, "w", encoding="utf-8") as f:
            f.write(bundled_min)

        konsol.log(f"[green]✓ CSS bundle written:[/] {bundle_file}")
        return True
    except Exception as e:
        konsol.log(f"[red]✗ CSS bundle hatası[/]: {e}")
        return False


def bundle_css():
    """Bundle all CSS entry files"""
    # Home bundle
    bundle_css_file(
        css_root        = Path("Public/Home/Static/CSS"),
        entry_filename  = "style.min.css",
        output_filename = "style.bundle.min.css"
    )

if __name__ == "__main__":
    minify_assets()
    bundle_css()

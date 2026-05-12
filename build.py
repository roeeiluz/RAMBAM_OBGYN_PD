#!/usr/bin/env python3
"""
build.py — מייצר את הוצאת ה-frontend ל-CBME מהמקור היחיד index_8.html

Usage:
  python3 build.py            # Builds ONLY dev/index.html (safe, default)
  python3 build.py --promote  # Also builds index.html (prod) — backs up old one

Outputs:
  dev/index.html       — DEV_BYPASS_AUTH=true, version suffix '-dev'
  index.html           — DEV_BYPASS_AUTH=false (only with --promote)
  _backup/index.html.v<N>  — auto-backup of old prod before overwrite

Safety guarantees:
  - SRC must have DEV_BYPASS_AUTH defined (else exit 1)
  - Prod output ALWAYS has DEV_BYPASS_AUTH=false (assertion)
  - Dev output ALWAYS has DEV_BYPASS_AUTH=true (assertion)
  - node --check is run on extracted JS of each output (if node is available)
  - Old index.html is backed up before --promote replaces it
"""
import re
import os
import sys
import shutil
import subprocess
import tempfile
from datetime import datetime

SRC = 'index_8.html'
PROD = 'index.html'
DEV_DIR = 'dev'
DEV_FILE = 'dev/index.html'
BACKUP_DIR = '_backup'


def _color(s, c):
    """ANSI color codes for nicer terminal output."""
    codes = {'red': 31, 'green': 32, 'yellow': 33, 'blue': 34, 'cyan': 36, 'bold': 1}
    return f"\033[{codes.get(c, 0)}m{s}\033[0m"


def _read_source():
    if not os.path.exists(SRC):
        print(_color(f"ERROR: source file {SRC} not found", 'red'))
        sys.exit(1)
    with open(SRC, 'r', encoding='utf-8') as f:
        return f.read()


def _extract_version(src):
    m = re.search(r"const APP_VERSION = '([^']+)';", src)
    if not m:
        print(_color("ERROR: APP_VERSION not found", 'red'))
        sys.exit(1)
    return m.group(1)


def _verify_source(src):
    """Sanity checks on source before building."""
    if not re.search(r"const DEV_BYPASS_AUTH = (true|false);", src):
        print(_color("ERROR: DEV_BYPASS_AUTH not found in source", 'red'))
        sys.exit(1)
    if not re.search(r"const APP_VERSION = '", src):
        print(_color("ERROR: APP_VERSION not found in source", 'red'))
        sys.exit(1)


def _check_syntax(html, label):
    """Run node --check on the largest <script> block. Returns True if OK."""
    try:
        scripts = re.findall(r'<script>([\s\S]*?)</script>', html)
        if not scripts:
            return True  # No scripts to check
        biggest = max(scripts, key=len)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8') as tf:
            tf.write(biggest)
            tmp = tf.name
        result = subprocess.run(['node', '--check', tmp], capture_output=True, text=True, timeout=10)
        os.unlink(tmp)
        if result.returncode != 0:
            print(_color(f"  ⚠ {label} syntax check FAILED:", 'red'))
            print('  ' + result.stderr[:400])
            return False
        return True
    except FileNotFoundError:
        # node not installed — skip
        print(_color(f"  ⚠ node not installed — skipping syntax check for {label}", 'yellow'))
        return True
    except Exception as e:
        print(_color(f"  ⚠ syntax check error for {label}: {e}", 'yellow'))
        return True  # Don't fail build on harness errors


def _build_dev(src, version):
    """Produce dev/index.html — flag stays true, version gets -dev suffix."""
    out = re.sub(r"const DEV_BYPASS_AUTH = (true|false);",
                 "const DEV_BYPASS_AUTH = true;  // built by build.py (dev)",
                 src, count=1)
    out = re.sub(r"const APP_VERSION = '([^']+)';",
                 f"const APP_VERSION = '{version}-dev';",
                 out, count=1)
    # Assertion: must have flag=true
    assert "const DEV_BYPASS_AUTH = true" in out, "DEV build assertion failed"
    return out


def _build_prod(src, version):
    """Produce prod index.html — flag flipped to false."""
    out = re.sub(r"const DEV_BYPASS_AUTH = (true|false);",
                 "const DEV_BYPASS_AUTH = false;  // built by build.py (prod)",
                 src, count=1)
    # Assertion: must NOT have flag=true
    assert "const DEV_BYPASS_AUTH = false" in out, "PROD build assertion failed"
    assert "const DEV_BYPASS_AUTH = true" not in out, "PROD build assertion failed: true still present"
    return out


def _backup_existing_prod(version_of_prod_being_replaced):
    """Backup the current index.html before overwriting it."""
    if not os.path.exists(PROD):
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    # Read the version of the existing index.html to name the backup
    with open(PROD, 'r', encoding='utf-8') as f:
        existing = f.read()
    em = re.search(r"const APP_VERSION = '([^']+)';", existing)
    existing_ver = em.group(1) if em else 'unknown'
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(BACKUP_DIR, f'index.html.v{existing_ver}.{timestamp}')
    shutil.copy(PROD, backup_path)
    return backup_path


def main():
    promote = '--promote' in sys.argv

    print(_color(f"\n=== CBME Build {'(PROMOTE)' if promote else '(dev only)'} ===", 'bold'))

    src = _read_source()
    _verify_source(src)
    version = _extract_version(src)
    print(f"Source version: {_color('v' + version, 'cyan')}")

    # === BUILD DEV ===
    print(_color('\n→ Building dev/index.html …', 'blue'))
    dev_out = _build_dev(src, version)
    if not _check_syntax(dev_out, 'dev'):
        print(_color("Aborting — dev syntax errors.", 'red'))
        sys.exit(1)
    os.makedirs(DEV_DIR, exist_ok=True)
    with open(DEV_FILE, 'w', encoding='utf-8') as f:
        f.write(dev_out)
    print(_color(f"  ✓ {DEV_FILE} ({len(dev_out)} chars, v{version}-dev, DEV=true)", 'green'))

    # === BUILD PROD (only with --promote) ===
    if promote:
        print(_color('\n→ Building index.html (PROD) …', 'blue'))
        prod_out = _build_prod(src, version)
        if not _check_syntax(prod_out, 'prod'):
            print(_color("Aborting — prod syntax errors.", 'red'))
            sys.exit(1)
        # Backup before overwrite
        backup = _backup_existing_prod(version)
        if backup:
            print(_color(f"  ✓ Backed up old prod → {backup}", 'green'))
        with open(PROD, 'w', encoding='utf-8') as f:
            f.write(prod_out)
        print(_color(f"  ✓ {PROD} ({len(prod_out)} chars, v{version}, DEV=false)", 'green'))
    else:
        print(_color('\n→ Skipping prod build (use --promote to overwrite index.html)', 'yellow'))

    print(_color('\n=== Done ===', 'bold'))
    print(f"Next steps:")
    print(f"  1. Test dev at https://roeeiluz.github.io/RAMBAM_OBGYN_PD/dev/")
    print(f"  2. When stable, run: python3 build.py --promote")
    print(f"  3. Upload BOTH files to GitHub (or just dev/index.html for dev-only updates)")


if __name__ == '__main__':
    main()

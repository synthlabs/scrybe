#!/usr/bin/env python3
"""Verify the reduced-motion freeze through a served source override."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'src/lib/components/overlay/preview-frame.svelte').read_text()
before = 'if (!frame || reduced_motion.current) return settle();'
after = 'if (!frame) return settle();'
if before not in source:
    assert source.count(after) == 1, 'Expected the preview frame guard'
    source = source.replace(after, before)
assert source.count(before) == 1, 'Expected one reduced-motion early return'
with tempfile.TemporaryDirectory(prefix='scrybe-reduced-experiment-') as directory:
    preview = Path(directory) / 'preview-frame.svelte'
    preview.write_text(source.replace(before, after))
    result = subprocess.run([
        sys.executable, '-m', 'pytest', 'tests/python/webkit/test_overlay_motion.py',
        '--preview-source', str(preview), '--motion-reduced',
    ], cwd=root)
    sys.exit(result.returncode)

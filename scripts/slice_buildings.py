#!/usr/bin/env python3
# Slice the 4-state building sheets (one building per row, 4 prosperity states
# across, rundown -> thriving) into tight transparent per-state PNGs the engine
# loads as _s1.._s4. Sheets may arrive transparent OR on a solid fill; the
# background is stripped by flooding inward from a corner so interior lights
# (thatch highlights, pale stone) survive. Columns are cut on an even 4-wide
# grid rather than by alpha gaps, so richly decorated states 3-4 (banners,
# braziers) don't get merged into one.
import os, sys, numpy as np
from PIL import Image
from collections import deque

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLD = os.path.join(REPO, 'assets/buildings')

COLS = 4  # every sheet shows four prosperity states across

# sheet -> row order (top to bottom). None skips a row.
SHEETS = {
    'essentials4f':     ['field', 'roundhouse', 'orchard', 'market', None],
    'militaryhouses4f': ['training_ground', 'smithy', 'longhouse', 'stonehouse', 'hillfort'],
    'culture4f':        ['hurling_field', 'feast_hall', 'nemeton', 'gallan', 'orchard'],
}

def strip_bg(im):
    # Already has a real transparent background? nothing to do.
    a = np.asarray(im).copy()
    h, w = a.shape[:2]
    if (a[:, :, 3] < 20).mean() > 0.15:
        return im
    # Reference colour = mean of the four corners; flood everything connected to
    # a corner that stays close to it. The inter-cell gutters reach every corner,
    # so one flood clears the whole background at once.
    rgb = a[:, :, :3].astype(int)
    ref = np.array([a[0, 0, :3], a[0, w - 1, :3], a[h - 1, 0, :3], a[h - 1, w - 1, :3]]).astype(int).mean(0)
    close = np.abs(rgb - ref).max(axis=2) <= 34
    seen = np.zeros((h, w), bool)
    dq = deque()
    for (y, x) in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if close[y, x]:
            seen[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and close[ny, nx]:
                seen[ny, nx] = True; dq.append((ny, nx))
    a[seen, 3] = 0
    return Image.fromarray(a, 'RGBA')

# Optional args name which sheets to (re)slice; default is all of them. Handy
# for cutting a freshly-dropped culture4f without disturbing the other sheets.
only = set(sys.argv[1:])
for sheet, rowmap in SHEETS.items():
    if only and sheet not in only:
        continue
    path = os.path.join(BLD, sheet + '.png')
    if not os.path.exists(path):
        print('skip (missing):', sheet); continue
    im = strip_bg(Image.open(path).convert('RGBA'))
    A = np.asarray(im)[:, :, 3] > 20
    ys = np.where(A.mean(1) > 0.003)[0]
    xs = np.where(A.mean(0) > 0.003)[0]
    y0, y1 = int(ys.min()), int(ys.max() + 1)
    x0, x1 = int(xs.min()), int(xs.max() + 1)
    nrows = len(rowmap)
    rh = (y1 - y0) / nrows
    cw = (x1 - x0) / COLS
    for r, name in enumerate(rowmap):
        if not name:
            continue
        ry0, ry1 = int(y0 + r * rh), int(y0 + (r + 1) * rh)
        for c in range(COLS):
            cx0, cx1 = int(x0 + c * cw), int(x0 + (c + 1) * cw)
            cell = im.crop((cx0, ry0, cx1, ry1))
            bb = cell.getbbox()
            if bb:
                cell = cell.crop(bb)
            cell.save(os.path.join(BLD, f'{name}_s{c + 1}.png'))
        print(f'{sheet} r{r} -> {name}_s1..s{COLS}')
print('done')

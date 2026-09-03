#!/usr/bin/env python3
# Slice the 4-state building sheets (one row per building, 4 prosperity states
# across) into tight, transparent per-state PNGs the engine loads as _s1.._s4.
import os, numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLD = os.path.join(REPO, 'assets/buildings')

# sheet -> row order (top to bottom). None skips a row.
SHEETS = {
    'essentials4f':     ['field', 'roundhouse', 'orchard', 'market', None],
    'militaryhouses4f': ['training_ground', 'smithy', 'longhouse', 'stonehouse', 'hillfort'],
}

def runs(on, minrun):
    o=[]; s=None
    for i,v in enumerate(on):
        if v and s is None: s=i
        if (not v) and s is not None:
            if i-s>=minrun: o.append((s,i))
            s=None
    if s is not None and len(on)-s>=minrun: o.append((s,len(on)))
    return o

for sheet, rowmap in SHEETS.items():
    im = Image.open(os.path.join(BLD, sheet+'.png')).convert('RGBA')
    A = np.asarray(im)[:,:,3] > 20
    cols = runs(A.mean(0) > 0.01, 40)
    ys = np.where(A.mean(1) > 0.005)[0]; y0,y1 = int(ys.min()), int(ys.max())
    nrows = len(rowmap); rh = (y1-y0)/nrows
    for r, name in enumerate(rowmap):
        if not name: continue
        ry0, ry1 = int(y0+r*rh), int(y0+(r+1)*rh)
        for c,(cs,ce) in enumerate(cols):
            cell = im.crop((cs, ry0, ce, ry1))
            bb = cell.getbbox()
            if bb: cell = cell.crop(bb)
            cell.save(os.path.join(BLD, f'{name}_s{c+1}.png'))
        print(f'{sheet} r{r} -> {name}_s1..s{len(cols)}')
print('done')

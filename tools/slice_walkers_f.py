import os, sys
import numpy as np
from PIL import Image, ImageDraw
import scipy.ndimage as ndi

SRC = '/root/.claude/uploads/65cf92ba-3bb6-5799-8e97-82b846718bf0/3851a7a3-image.png'
ORIG = Image.open(SRC).convert('RGB')
A = np.asarray(ORIG).astype(np.int16)

# Female variants slice into <char>_f so the engine can mix genders per walker.
CHARS = ['villager_f', 'grain_carrier_f', 'market_trader_f', 'water_carrier_f', 'druid_f']
DIRS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']
FRAMES = ['step1', 'step2', 'stand']

# Grid detected from the sheet: 8 direction groups (thin tan gridlines) each with
# 3 sprite centres; frame cells split at the midpoints between centres. Columns
# are NOT evenly spaced, so slicing on real boundaries avoids clipping neighbours.
GBOUND = [92, 290, 475, 659, 849, 1031, 1208, 1376, 1532]
CENTERS = [[119, 183, 247], [319, 379, 435], [498, 563, 625], [684, 745, 807],
           [874, 937, 1008], [1069, 1127, 1189], [1230, 1290, 1355], [1412, 1463, 1515]]
def _col_boxes():
    boxes = []
    for gi in range(8):
        c0, c1, c2 = CENTERS[gi]
        edges = [GBOUND[gi], (c0 + c1) // 2, (c1 + c2) // 2, GBOUND[gi + 1]]
        for f in range(3):
            boxes.append((edges[f], edges[f + 1]))
    return boxes
COL_BOXES = _col_boxes()                       # 24 (x0,x1) pairs
ROW_EDGES = [129, 299, 468, 648, 824, 1019]
INSET_X, INSET_Y = 3, 3

def key_cell(x0, y0, x1, y1):
    sub = A[y0:y1, x0:x1]
    R, G, B = sub[:, :, 0], sub[:, :, 1], sub[:, :, 2]
    neutral = (np.abs(R - G) < 16) & (np.abs(G - B) < 16) & (np.abs(R - B) < 20)
    light = (R + G + B) > 560  # cream parchment ground
    bgcand = neutral & light
    lbl, _ = ndi.label(bgcand)
    ids = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    ids.discard(0)
    bg = np.isin(lbl, list(ids))
    mask = ndi.binary_fill_holes(~bg)
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n:
        sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
        edge = (set(lab[:, 0]) | set(lab[:, -1])); edge.discard(0)
        drop = [i for i in range(1, n + 1) if i in edge and sizes[i - 1] < 400]
        keep = [i for i in range(1, n + 1) if i not in drop]
        if keep:  # keep only the biggest blob if fragments remain
            big = max(keep, key=lambda i: sizes[i - 1])
            drop += [i for i in keep if i != big and sizes[i - 1] < sizes[big - 1] * 0.25]
        if drop:
            mask = mask & ~np.isin(lab, drop)
    alpha = np.where(mask, 255, 0).astype(np.uint8)
    rgba = np.dstack([sub.astype(np.uint8), alpha])
    ys, xs = np.where(alpha > 40)
    if xs.size == 0:
        return None
    return Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')

def cell_box(row, col):
    x0, x1 = COL_BOXES[col]
    return (x0 + INSET_X, ROW_EDGES[row] + INSET_Y,
            x1 - INSET_X, ROW_EDGES[row + 1] - INSET_Y)

def slice_char(row):
    imgs = {}
    for d in range(8):
        for f in range(3):
            col = d * 3 + f
            imgs[(DIRS[d], FRAMES[f])] = key_cell(*cell_box(row, col))
    return imgs

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'villager_f'
    if which == 'all':
        for r, ch in enumerate(CHARS):
            base = '/home/user/ard-ri/assets/walkers/' + ch
            os.makedirs(base, exist_ok=True)
            for (d, f), im in slice_char(r).items():
                if im: im.save('%s/%s_%s.png' % (base, d, f))
        print('sliced all 120 female frames into assets/walkers/*_f/')
    else:
        r = CHARS.index(which)
        imgs = slice_char(r)
        cell = 96
        sheet = Image.new('RGBA', (8 * cell, 3 * cell), (40, 140, 160, 255))
        dr = ImageDraw.Draw(sheet)
        for di, d in enumerate(DIRS):
            for fi, f in enumerate(FRAMES):
                im = imgs[(d, f)]
                if not im: continue
                im2 = im.copy(); im2.thumbnail((cell - 12, cell - 20))
                sheet.alpha_composite(im2, (di * cell + (cell - im2.width) // 2, fi * cell + 4))
                dr.text((di * cell + 2, fi * cell + cell - 14), d + ' ' + f[-1], fill=(255, 255, 0))
        sheet.convert('RGB').save('/home/user/ard-ri/tools/wcontact_f.png')
        print('contact for', which, '-> tools/wcontact_f.png')

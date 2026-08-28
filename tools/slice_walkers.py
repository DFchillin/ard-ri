import os, sys
import numpy as np
from PIL import Image, ImageDraw
import scipy.ndimage as ndi

SRC = '/root/.claude/uploads/65cf92ba-3bb6-5799-8e97-82b846718bf0/d8c45591-image.png'
ORIG = Image.open(SRC).convert('RGB')
A = np.asarray(ORIG).astype(np.int16)

CHARS = ['villager', 'grain_carrier', 'market_trader', 'water_carrier', 'druid']
DIRS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']
FRAMES = ['step1', 'step2', 'stand']

# real grid edges detected from the sheet (24 columns, 5 rows)
COL_EDGES = [91, 160, 224, 291, 356, 412, 477, 541, 604, 657, 726, 786, 847,
             912, 972, 1028, 1088, 1150, 1208, 1260, 1318, 1375, 1424, 1475, 1530]
ROW_EDGES = [127, 290, 422, 602, 788, 1016]
INSET_X, INSET_Y = 2, 2

def key_cell(x0, y0, x1, y1):
    sub = A[y0:y1, x0:x1]
    R, G, B = sub[:, :, 0], sub[:, :, 1], sub[:, :, 2]
    neutral = (np.abs(R - G) < 14) & (np.abs(G - B) < 14) & (np.abs(R - B) < 18)
    light = (R + G + B) > 585  # avg brightness > 195 -> checkerboard greys
    bgcand = neutral & light
    lbl, _ = ndi.label(bgcand)
    ids = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    ids.discard(0)
    bg = np.isin(lbl, list(ids))
    mask = ndi.binary_fill_holes(~bg)
    # drop thin fragments of a neighbour that touch the left/right edge
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n:
        sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
        edge = (set(lab[:, 0]) | set(lab[:, -1])); edge.discard(0)
        drop = [i for i in range(1, n + 1) if i in edge and sizes[i - 1] < 300]
        if drop:
            mask = mask & ~np.isin(lab, drop)
    alpha = np.where(mask, 255, 0).astype(np.uint8)
    rgba = np.dstack([sub.astype(np.uint8), alpha])
    ys, xs = np.where(alpha > 40)
    if xs.size == 0:
        return None
    return Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')

def cell_box(row, col):
    return (COL_EDGES[col] + INSET_X, ROW_EDGES[row] + INSET_Y,
            COL_EDGES[col + 1] - INSET_X, ROW_EDGES[row + 1] - INSET_Y)

def slice_char(row):
    imgs = {}
    for d in range(8):
        for f in range(3):
            col = d * 3 + f
            im = key_cell(*cell_box(row, col))
            imgs[(DIRS[d], FRAMES[f])] = im
    return imgs

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'villager'
    if which == 'all':
        for r, ch in enumerate(CHARS):
            base = '/home/user/ard-ri/assets/walkers/' + ch
            os.makedirs(base, exist_ok=True)
            for (d, f), im in slice_char(r).items():
                if im: im.save('%s/%s_%s.png' % (base, d, f))
        print('sliced all 120 into assets/walkers/')
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
        sheet.convert('RGB').save('/home/user/ard-ri/tools/wcontact.png')
        print('contact for', which, '-> tools/wcontact.png')

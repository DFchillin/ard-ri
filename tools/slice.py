import os
import numpy as np
from PIL import Image

KEYED = Image.open('/home/user/ard-ri/tools/keyed.png')          # transparent sprites
ORIG = Image.open('/root/.claude/uploads/65cf92ba-3bb6-5799-8e97-82b846718bf0/8b467238-image.png').convert('RGB')
ROOT = '/home/user/ard-ri/assets'

# Transparent sprites: (x0, y0, x1, y1) on the keyed sheet. Auto-trimmed to alpha bbox.
SPRITES = {
    'buildings/roundhouse_empty': (16, 10, 154, 162),
    'buildings/roundhouse_full':  (183, 12, 328, 164),
    'buildings/well_empty':       (372, 40, 486, 210),
    'buildings/well_full':        (518, 38, 654, 216),
    'buildings/granary_empty':    (14, 158, 152, 322),
    'buildings/granary_full':     (182, 158, 324, 322),
    'buildings/market_empty':     (12, 318, 166, 464),
    'buildings/market_full':      (180, 316, 332, 464),
    'buildings/altar_empty':      (386, 273, 488, 430),
    'buildings/altar_full':       (524, 270, 652, 442),
    'buildings/field_empty':      (688, 20, 1017, 193),
    'buildings/field_full':       (685, 223, 1017, 451),
    'terrain/tree':               (1358, 6, 1523, 197),
    'terrain/rock':               (1384, 203, 1519, 319),
    'props/gate':                 (1360, 320, 1523, 470),
    # one representative front-facing walker each (full 8-dir sheet kept for later)
    'walkers/villager':       (18, 485, 82, 602),
    'walkers/grain_carrier':  (325, 483, 396, 600),
    'walkers/market_trader':  (700, 486, 772, 603),
    'walkers/water_carrier':  (1030, 483, 1125, 603),
    'walkers/druid':          (1336, 483, 1410, 606),
}

# Solid ground tiles: crop from the ORIGINAL, centre-square, resize to 128.
TILES = {
    'terrain/tiles/pasture': (1053, 45, 1140, 152),
    'terrain/tiles/bog':     (1150, 45, 1240, 152),
    'terrain/tiles/water':   (1250, 45, 1332, 152),
    'terrain/tiles/shore':   (1045, 240, 1180, 398),
    'terrain/tiles/rock':    (1212, 236, 1330, 408),
}

def trim(img):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > 40)
    if xs.size == 0:
        return img
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

for name, box in SPRITES.items():
    p = os.path.join(ROOT, name + '.png')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    trim(KEYED.crop(box)).save(p)

for name, box in TILES.items():
    p = os.path.join(ROOT, name + '.png')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    c = ORIG.crop(box)
    s = min(c.size)
    c = c.crop(((c.width - s) // 2, (c.height - s) // 2, (c.width + s) // 2, (c.height + s) // 2))
    c.resize((128, 128), Image.LANCZOS).save(p)

# Contact sheet for verification.
items = list(SPRITES) + list(TILES)
cols, cell = 6, 180
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * cell, rows * cell), (40, 140, 160, 255))
from PIL import ImageDraw
d = ImageDraw.Draw(sheet)
for i, name in enumerate(items):
    im = Image.open(os.path.join(ROOT, name + '.png')).convert('RGBA')
    im.thumbnail((cell - 20, cell - 34))
    cx = (i % cols) * cell + (cell - im.width) // 2
    cy = (i // cols) * cell + 8
    sheet.alpha_composite(im, (cx, cy))
    d.text(((i % cols) * cell + 6, (i // cols) * cell + cell - 20), name.split('/')[-1], fill=(255, 255, 0))
sheet.convert('RGB').save('/home/user/ard-ri/tools/contact.png')
print('sliced', len(items), 'assets -> assets/, contact -> tools/contact.png')

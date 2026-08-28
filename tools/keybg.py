import sys
import numpy as np
from PIL import Image
import scipy.ndimage as ndi

SRC = '/root/.claude/uploads/65cf92ba-3bb6-5799-8e97-82b846718bf0/8b467238-image.png'
OUT = '/home/user/ard-ri/tools/keyed.png'
T = int(sys.argv[1]) if len(sys.argv) > 1 else 32

im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(np.int16)
H, W, _ = a.shape

# Edge magnitude: largest colour jump to any 4-neighbour.
edge = np.zeros((H, W), np.int16)
for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
    nb = np.roll(a, (dy, dx), (0, 1))
    edge = np.maximum(edge, np.abs(a - nb).max(axis=2))
walls = edge >= T

# Flood the background from the frame through non-wall pixels only.
free = ~walls
lbl, _ = ndi.label(free)  # 4-connectivity components of smooth area
border_ids = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
border_ids.discard(0)
bg = np.isin(lbl, list(border_ids))

mask = ~bg
mask = ndi.binary_closing(mask, structure=np.ones((3, 3)), iterations=1)  # knit speckle
mask = ndi.binary_fill_holes(mask)  # close interior holes (tunics, walls)
bg = ~mask

alpha = np.where(bg, 0, 255).astype(np.uint8)
# soften a 1px rim so outlines don't fringe
rgba = np.dstack([np.asarray(im), alpha])
Image.fromarray(rgba, 'RGBA').save(OUT)
print('T', T, 'wall%', round(100 * walls.mean(), 1), 'bg%', round(100 * bg.mean(), 1), '->', OUT)

#!/usr/bin/env python3
# Import the Pixellab "fighting-sprites" character trees into the engine's battle
# chip layout. Each character exports as:
#   <char>/Idle/rotations/<dir>.png                         (8-dir idle)
#   <char>/Idle/animations/<Walk*>/<dir>/frame_NNN.png      (walk cycle)
#   <char>/Idle/animations/<Attack*>/<dir>/frame_NNN.png    (attack swing)
# makeWarriorChip loads, per dir, frames: idle, step1, step2, windup, strike
# (hurt/fall/dead are unused now — death is a render-side effect), written to
#   assets/battle/<art>/<dir>_<frame>.png
# Frames are trimmed to one shared bbox across every pose so the figure sits at a
# steady size and never jitters between frames.
import os, glob
import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, 'assets/walkers/fighting-sprites')

DIRS = {'south': 's', 'south-east': 'se', 'east': 'e', 'north-east': 'ne',
        'north': 'n', 'north-west': 'nw', 'west': 'w', 'south-west': 'sw'}

# character folder -> battle art key (units.js battle.art)
ART = {
    'cu_chulainn': 'cuchulainn', 'fionn_mac_cumhaill': 'fionn', 'lugh_lamhfhada': 'lugh',
    'nuada_airgetlam': 'nuada', 'manannan_mac_lir': 'manannan', 'brigid': 'brigid',
    'the_dagda': 'dagda', 'the_morrigan': 'morrigan',
    'common_gaelic_warrior': 'warrior', 'elite_gaelic_champion': 'curadh',
}

def load(p):
    return Image.open(p).convert('RGBA')

# Pixellab grows the canvas per pose (64→92), so frames can't be aligned by their
# corners. Trim each to its figure and note the feet anchor (horizontal centre of
# the bottom strip); the assembler then feet-aligns every pose on one canvas.
def tight_and_feet(im):
    b = im.getbbox()
    if not b:
        return None, 0.0
    t = im.crop(b)
    a = np.asarray(t)[:, :, 3] > 20
    h, w = a.shape
    footH = max(2, int(h * 0.14))
    cols = np.where(a[h - footH:h, :].any(axis=0))[0]
    if not len(cols):
        cols = np.where(a.any(axis=0))[0]
    feet_x = (int(cols.min()) + int(cols.max())) / 2 if len(cols) else w / 2.0
    return t, feet_x

# Place every pose on a shared canvas, feet-centred and bottom-aligned, so the
# body never jitters and a raised spear only widens the canvas to one side. The
# engine fits all frames to the idle's size, so they must come out identical.
def assemble(tights):
    # Symmetric canvas around the feet so the feet land on the sprite's centre
    # (the chip anchors at horizontal-centre); the figure then stands exactly on
    # its tile whichever way a weapon reaches.
    half = max(max(fx, t.size[0] - fx) for t, fx in tights)
    H = max(t.size[1] for t, _ in tights)
    W = int(np.ceil(half * 2))
    out = []
    for t, fx in tights:
        c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        c.alpha_composite(t, (int(round(half - fx)), H - t.size[1]))
        out.append(c)
    return out

def frames_in(d):
    return [load(p) for p in sorted(glob.glob(os.path.join(d, 'frame_*.png')))]

def pick(seq, frac):
    if not seq:
        return None
    return seq[max(0, min(len(seq) - 1, round(frac * (len(seq) - 1))))]

def process(char, art):
    base = os.path.join(SRC, char, 'Idle')
    rotd = os.path.join(base, 'rotations')
    animd = os.path.join(base, 'animations')
    if not os.path.isdir(rotd):
        return None
    anims = [n for n in os.listdir(animd)] if os.path.isdir(animd) else []
    walkf = next((a for a in anims if 'walk' in a.lower()), None)
    atkf = next((a for a in anims if 'attack' in a.lower() or 'strik' in a.lower()), None)
    idle, walk, atk = {}, {}, {}
    for ld, d in DIRS.items():
        rp = os.path.join(rotd, ld + '.png')
        if os.path.exists(rp):
            idle[d] = load(rp)
        walk[d] = frames_in(os.path.join(animd, walkf, ld)) if walkf else []
        atk[d] = frames_in(os.path.join(animd, atkf, ld)) if atkf else []
    # Choose the five poses per direction first, then feet-align every pose of the
    # whole character on one shared canvas (idle included, so all frames match).
    chosen = []  # (dir, name, image)
    for d in DIRS.values():
        base_idle = idle.get(d)
        if base_idle is None:
            continue
        w = walk[d]
        step1 = w[0] if len(w) >= 1 else base_idle
        step2 = w[len(w) // 2] if len(w) >= 2 else base_idle
        a = atk[d]
        windup = pick(a, 0.30) or base_idle   # anticipation
        strike = pick(a, 0.62) or base_idle   # the blow at full extension
        for name, im in (('idle', base_idle), ('step1', step1), ('step2', step2), ('windup', windup), ('strike', strike)):
            chosen.append((d, name, im))
    tights = [tight_and_feet(im) for _, _, im in chosen]
    tights = [(t if t is not None else Image.new('RGBA', (1, 1)), fx) for t, fx in tights]
    aligned = assemble(tights)
    dest = os.path.join(REPO, 'assets/battle', art)
    if os.path.isdir(dest):
        for f in os.listdir(dest):
            if f.endswith('.png'):
                os.remove(os.path.join(dest, f))
    os.makedirs(dest, exist_ok=True)
    for (d, name, _), img in zip(chosen, aligned):
        img.save(os.path.join(dest, f'{d}_{name}.png'))
    return dest, len(chosen), aligned[0].size, walkf, atkf

for char, art in ART.items():
    if not os.path.isdir(os.path.join(SRC, char)):
        print('skip (missing):', char); continue
    r = process(char, art)
    if r:
        dest, n, box, walkf, atkf = r
        print(f'{char:24s} -> {art:10s} {n:3d} frames  bbox={box}  walk={walkf} atk={atkf}')
print('done')

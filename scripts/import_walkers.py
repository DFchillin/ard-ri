#!/usr/bin/env python3
# Import Pixellab character trees into the settlement walker layout the engine
# loads with makeWalkerChip: assets/walkers/<role>/<dir>_stand.png and
# <dir>_walk0..5.png (six frames). A "role" here is one character + one chosen
# animation — so a figure with several animations (walk, dig, run) becomes
# several roles the engine can swap between (deaglan/deaglan_dig, finn/finn_run).
# Every frame of a role is feet-aligned on one shared canvas so the figure keeps
# a steady size and never jitters (makeWalkerChip sizes all frames to the south
# stand frame's aspect).
import os, glob
import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, 'assets/walkers/fighting-sprites')
OUT = os.path.join(REPO, 'assets/walkers')

DIRS = {'south': 's', 'south-east': 'se', 'east': 'e', 'north-east': 'ne',
        'north': 'n', 'north-west': 'nw', 'west': 'w', 'south-west': 'sw'}
WALK_FRAMES = 6

# role -> (character folder, animation subfolder). Each role writes its own
# assets/walkers/<role>/ set. The engine's WALK_FILE names these roles.
ROLES = {
    'deaglan':     ('deaglan', 'walk'),
    'deaglan_dig': ('deaglan', 'Digging'),
    'finn':        ('finn', 'walk'),
    'finn_run':    ('finn', 'running'),
    'vigil':       ('vigil-m', 'guard_m_walk'),
    'vigil_f':     ('vigil-f', 'guard_f_walk'),
}

def load(p):
    return Image.open(p).convert('RGBA')

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

def assemble(tights):
    half = max(max(fx, t.size[0] - fx) for t, fx in tights)
    H = max(t.size[1] for t, _ in tights)
    W = int(np.ceil(half * 2))
    out = []
    for t, fx in tights:
        c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        c.alpha_composite(t, (int(round(half - fx)), H - t.size[1]))
        out.append(c)
    return out

def resample(seq, n):
    if not seq:
        return []
    if len(seq) == n:
        return seq
    return [seq[min(len(seq) - 1, round(i / (n - 1) * (len(seq) - 1)))] for i in range(n)]

def frames_in(d):
    return sorted(glob.glob(os.path.join(d, 'frame_*.png')))

for role, (char, anim) in ROLES.items():
    base = os.path.join(SRC, char, 'Idle')
    rotd = os.path.join(base, 'rotations')
    animd = os.path.join(base, 'animations', anim)
    if not os.path.isdir(rotd):
        print('skip (missing):', role); continue
    chosen = []  # (dir, name, image)
    for ld, d in DIRS.items():
        rp = os.path.join(rotd, ld + '.png')
        idle = load(rp) if os.path.exists(rp) else None
        wf = [load(p) for p in frames_in(os.path.join(animd, ld))]
        wf = resample(wf, WALK_FRAMES) if wf else [idle] * WALK_FRAMES
        stand = idle if idle is not None else wf[0]
        chosen.append((d, 'stand', stand))
        for i in range(WALK_FRAMES):
            chosen.append((d, 'walk%d' % i, wf[i] if wf[i] is not None else stand))
    tights = [tight_and_feet(im) for _, _, im in chosen]
    tights = [(t if t is not None else Image.new('RGBA', (1, 1)), fx) for t, fx in tights]
    aligned = assemble(tights)
    dest = os.path.join(OUT, role)
    os.makedirs(dest, exist_ok=True)
    for f in os.listdir(dest):
        if f.endswith('.png'):
            os.remove(os.path.join(dest, f))
    for (d, name, _), img in zip(chosen, aligned):
        img.save(os.path.join(dest, '%s_%s.png' % (d, name)))
    print('%-12s <- %s/%s  %d frames  size=%s' % (role, char, anim, len(chosen), aligned[0].size))
print('done')

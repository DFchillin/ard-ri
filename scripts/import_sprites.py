#!/usr/bin/env python3
# Unpack the Pixellab character zips into the engine's sprite layout, trimming the
# padded 64x64 frames to a tight, consistent figure box so they render at a proper
# size, and keeping the full walk cycle (not just two poses).
#   walkers -> assets/walkers/<role>/<dir>_stand.png + <dir>_walk0..5.png
#   deities -> assets/battle/<art>/<dir>_{idle,step1,step2}.png  (idle+walk; attack/death later)
import os, io, zipfile
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, 'assets/walkers/pxlai-Sprites')

DIRS = {'south': 's', 'south-east': 'se', 'east': 'e', 'north-east': 'ne',
        'north': 'n', 'north-west': 'nw', 'west': 'w', 'south-west': 'sw'}
WALK_FRAMES = 6  # every facing writes this many walk frames (cardinals repeat their idle)

WALKERS = {
    'Common_townsman': 'villager', 'Common_townswoman': 'villager_f',
    'Water_carrier_male': 'water_carrier', 'Water_carrier_female': 'water_carrier_f',
    'Farm_hand_male': 'grain_carrier', 'Farm_hand_female': 'grain_carrier_f',
    'Trader_male': 'market_trader', 'Trader_female': 'market_trader_f',
    'Druid_male': 'druid', 'Druid_female': 'druid_f',
}
DEITIES = {'Brigid': 'brigid', 'Lugh_Lamhfhada': 'lugh', 'Manannan_mac_Lir': 'manannan', 'Nuada_Airgetlam': 'nuada'}
HOLD = {'Storehouse_worker_male', 'Storehouse_worker_female', 'Town_guard_male', 'Town_guard_female'}

def load(z, name):
    return Image.open(io.BytesIO(z.read(name))).convert('RGBA')

def union_bbox(imgs):
    box = None
    for im in imgs:
        b = im.getbbox()
        if not b:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box

def process(stem, zpath):
    if stem in WALKERS:
        dest = os.path.join(REPO, 'assets/walkers', WALKERS[stem]); kind = 'walker'
    elif stem in DEITIES:
        dest = os.path.join(REPO, 'assets/battle', DEITIES[stem]); kind = 'deity'
    else:
        return None
    with zipfile.ZipFile(zpath) as z:
        names = set(z.namelist())
        animfolders = sorted({n.split('/')[2] for n in names if n.startswith('Idle/animations/') and n.count('/') > 3})
        walk = next((a for a in animfolders if 'walk' in a.lower()), animfolders[0] if animfolders else None)
        rot = {d: load(z, f'Idle/rotations/{ld}.png') for ld, d in DIRS.items() if f'Idle/rotations/{ld}.png' in names}
        walkframes = {}
        for ld, d in DIRS.items():
            fr = sorted(n for n in names if n.startswith(f'Idle/animations/{walk}/{ld}/') and n.endswith('.png')) if walk else []
            walkframes[d] = [load(z, n) for n in fr]
        allimgs = list(rot.values()) + [im for lst in walkframes.values() for im in lst]
        box = union_bbox(allimgs) or (0, 0, 64, 64)
        crop = lambda im, path: im.crop(box).save(path)
        if os.path.isdir(dest):
            for f in os.listdir(dest):
                if f.endswith('.png'):
                    os.remove(os.path.join(dest, f))
        os.makedirs(dest, exist_ok=True)
        written = 0
        for d in DIRS.values():
            if d not in rot:
                continue
            stand = rot[d]
            frames = walkframes[d] or [stand]
            if kind == 'walker':
                crop(stand, os.path.join(dest, f'{d}_stand.png')); written += 1
                for i in range(WALK_FRAMES):
                    crop(frames[i % len(frames)], os.path.join(dest, f'{d}_walk{i}.png')); written += 1
            else:
                crop(stand, os.path.join(dest, f'{d}_idle.png')); written += 1
                s1 = frames[1] if len(frames) >= 6 else frames[0]
                s2 = frames[4] if len(frames) >= 6 else frames[-1]
                crop(s1, os.path.join(dest, f'{d}_step1.png')); written += 1
                crop(s2, os.path.join(dest, f'{d}_step2.png')); written += 1
        return dest, written, box

total = 0
for fn in sorted(os.listdir(SRC)):
    if not fn.endswith('.zip'):
        continue
    stem = fn[:-4]
    if stem in HOLD:
        print(f'HOLD  {stem}'); continue
    r = process(stem, os.path.join(SRC, fn))
    if r is None:
        print(f'SKIP? {stem}')
    else:
        dest, w, box = r; total += w
        print(f'OK    {stem:22s} -> {os.path.relpath(dest, REPO):28s} ({w} files, box {box[2]-box[0]}x{box[3]-box[1]})')
print(f'\nTotal frames written: {total}')

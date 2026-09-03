#!/usr/bin/env python3
# Unpack the Pixellab character zips into the engine's sprite layout.
#   walkers -> assets/walkers/<role>/<dir>_{stand,step1,step2}.png
#   deities -> assets/battle/<art>/<dir>_{idle,step1,step2}.png   (idle+walk only; attack/death later)
import os, zipfile, posixpath, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, 'assets/walkers/pxlai-Sprites')

DIRS = {'south': 's', 'south-east': 'se', 'east': 'e', 'north-east': 'ne',
        'north': 'n', 'north-west': 'nw', 'west': 'w', 'south-west': 'sw'}

# zip stem -> (target_dir, standframe_name)
WALKERS = {
    'Common_townsman': 'villager', 'Common_townswoman': 'villager_f',
    'Water_carrier_male': 'water_carrier', 'Water_carrier_female': 'water_carrier_f',
    'Farm_hand_male': 'grain_carrier', 'Farm_hand_female': 'grain_carrier_f',
    'Trader_male': 'market_trader', 'Trader_female': 'market_trader_f',
    'Druid_male': 'druid', 'Druid_female': 'druid_f',
}
DEITIES = {'Brigid': 'brigid', 'Lugh_Lamhfhada': 'lugh', 'Manannan_mac_Lir': 'manannan', 'Nuada_Airgetlam': 'nuada'}
HOLD = {'Storehouse_worker_male', 'Storehouse_worker_female', 'Town_guard_male', 'Town_guard_female'}

def frames_for(names):
    n = len(names)
    if n >= 6: return names[1], names[4]
    if n >= 2: return names[0], names[-1]
    return names[0], names[0]

def process(stem, zpath):
    if stem in WALKERS:
        dest = os.path.join(REPO, 'assets/walkers', WALKERS[stem]); standkey = 'stand'
    elif stem in DEITIES:
        dest = os.path.join(REPO, 'assets/battle', DEITIES[stem]); standkey = 'idle'
    else:
        return None
    os.makedirs(dest, exist_ok=True)
    written = 0
    filled = 0
    with zipfile.ZipFile(zpath) as z:
        names = z.namelist()
        animfolders = sorted({n.split('/')[2] for n in names if n.startswith('Idle/animations/') and len(n.split('/')) > 3})
        walk = next((a for a in animfolders if 'walk' in a.lower()), animfolders[0] if animfolders else None)
        for longdir, short in DIRS.items():
            rot = f'Idle/rotations/{longdir}.png'
            if rot not in names:
                continue
            stand_bytes = z.read(rot)
            # stand/idle from the rotation
            open(os.path.join(dest, f'{short}_{standkey}.png'), 'wb').write(stand_bytes); written += 1
            # step1/step2 from the walk animation for this facing; if this facing
            # wasn't animated, fall back to its OWN idle frame (correct facing, no
            # stale art) rather than leaving the previous sprite set behind.
            fr = sorted(n for n in names if n.startswith(f'Idle/animations/{walk}/{longdir}/') and n.endswith('.png')) if walk else []
            if fr:
                s1, s2 = frames_for(fr)
                open(os.path.join(dest, f'{short}_step1.png'), 'wb').write(z.read(s1)); written += 1
                open(os.path.join(dest, f'{short}_step2.png'), 'wb').write(z.read(s2)); written += 1
            else:
                open(os.path.join(dest, f'{short}_step1.png'), 'wb').write(stand_bytes)
                open(os.path.join(dest, f'{short}_step2.png'), 'wb').write(stand_bytes)
                written += 2; filled += 1
    return dest, written, filled

total = 0
for fn in sorted(os.listdir(SRC)):
    if not fn.endswith('.zip'): continue
    stem = fn[:-4]
    if stem in HOLD:
        print(f'HOLD  {stem}'); continue
    r = process(stem, os.path.join(SRC, fn))
    if r is None:
        print(f'SKIP? {stem} (no mapping)')
    else:
        dest, w, filled = r; total += w
        note = f'  [{filled} facings idle-filled]' if filled else ''
        print(f'OK    {stem:22s} -> {os.path.relpath(dest, REPO):28s} ({w} files){note}')
print(f'\nTotal frames written: {total}')

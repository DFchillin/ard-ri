#!/usr/bin/env python3
# Convert a nextgen-sprites character pack into the game's walker layout.
#   nextgen-sprites/<src>/Idle/rotations/<long-dir>.png      -> walkers/<role>/<short>_stand.png
#   nextgen-sprites/<src>/Idle/animations/walk/<diag>/frame_00N.png -> <short>_walkN.png
# Walk frames exist only for the 4 diagonals; cardinals repeat their idle (as the
# existing art does). Pure file copies — the engine scales by height, no resize.
import os, shutil, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'walkers')
SRC_ROOT = os.path.join(ROOT, 'nextgen-sprites')
DIRMAP = {'south': 's', 'south-east': 'se', 'east': 'e', 'north-east': 'ne',
          'north': 'n', 'north-west': 'nw', 'west': 'w', 'south-west': 'sw'}
WALK_FRAMES = 6

def convert(src, role):
    sd = os.path.join(SRC_ROOT, src, 'Idle')
    out = os.path.join(ROOT, role)
    os.makedirs(out, exist_ok=True)
    for long, short in DIRMAP.items():
        stand = os.path.join(sd, 'rotations', f'{long}.png')
        if not os.path.exists(stand):
            print(f'  ! missing rotation {long} for {src}'); continue
        shutil.copy(stand, os.path.join(out, f'{short}_stand.png'))
        wdir = os.path.join(sd, 'animations', 'walk', long)
        for i in range(WALK_FRAMES):
            frame = os.path.join(wdir, f'frame_{i:03d}.png')
            dst = os.path.join(out, f'{short}_walk{i}.png')
            shutil.copy(frame if os.path.exists(frame) else stand, dst)  # cardinals repeat idle
    print(f'  {src} -> walkers/{role}/')

if __name__ == '__main__':
    # pairs of (source folder, role name)
    jobs = [a.split('=') for a in sys.argv[1:]] if len(sys.argv) > 1 else [
        ('01_ancient_hurler', 'hurler'),
        ('02_camogie_player', 'hurler_f'),
        ('11_sluagh', 'sluagh'),
        ('12_goods_carrier_courier', 'grain_carrier'),
        ('12_goods_carrier_courier', 'grain_carrier_f'),
    ]
    for src, role in jobs:
        convert(src, role)

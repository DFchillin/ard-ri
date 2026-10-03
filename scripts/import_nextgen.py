#!/usr/bin/env python3
# Convert a nextgen-sprites character pack into the game's walker layout.
#   nextgen-sprites/<src>/Idle/rotations/<long-dir>.png      -> walkers/<role>/<short>_stand.png
#   nextgen-sprites/<src>/Idle/animations/walk/<diag>/frame_00N.png -> <short>_walkN.png
# Walk frames exist only for the 4 diagonals; cardinals repeat their idle (as the
# existing art does). The engine scales by height, so no resize.
# If Pillow is available, any frame PixelAI left with a SOLID background has that
# backdrop flood-filled transparent from the edges (character preserved).
import os, shutil, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'walkers')
SRC_ROOT = os.path.join(ROOT, 'nextgen-sprites')
DIRMAP = {'south': 's', 'south-east': 'se', 'east': 'e', 'north-east': 'ne',
          'north': 'n', 'north-west': 'nw', 'west': 'w', 'south-west': 'sw'}
WALK_FRAMES = 6

try:
    from PIL import Image
    from collections import deque, Counter
    def declutter(path, tol=40):
        im = Image.open(path).convert('RGBA'); w, h = im.size; px = im.load()
        border = ([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
                  + [(x, 1) for x in range(w)] + [(x, h - 2) for x in range(w)] + [(1, y) for y in range(h)] + [(w - 2, y) for y in range(h)])
        opaque = [(x, y) for (x, y) in border if px[x, y][3] > 200]
        if not opaque:
            return  # background already transparent
        seed = Counter([px[x, y][:3] for (x, y) in opaque]).most_common(1)[0][0]
        near = lambda p: p[3] > 0 and abs(p[0] - seed[0]) <= tol and abs(p[1] - seed[1]) <= tol and abs(p[2] - seed[2]) <= tol
        seen = [[False] * w for _ in range(h)]; q = deque()
        for (x, y) in opaque:
            if near(px[x, y]) and not seen[y][x]:
                seen[y][x] = True; q.append((x, y))
        while q:
            x, y = q.popleft(); px[x, y] = (px[x, y][0], px[x, y][1], px[x, y][2], 0)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and near(px[nx, ny]):
                    seen[ny][nx] = True; q.append((nx, ny))
        im.save(path)
except Exception:
    declutter = lambda path, tol=40: None  # Pillow missing — copy as-is

def put(src_file, dst):
    shutil.copy(src_file, dst)
    declutter(dst)

def convert(src, role):
    sd = os.path.join(SRC_ROOT, src, 'Idle')
    out = os.path.join(ROOT, role)
    os.makedirs(out, exist_ok=True)
    for long, short in DIRMAP.items():
        stand = os.path.join(sd, 'rotations', f'{long}.png')
        if not os.path.exists(stand):
            print(f'  ! missing rotation {long} for {src}'); continue
        put(stand, os.path.join(out, f'{short}_stand.png'))
        wdir = os.path.join(sd, 'animations', 'walk', long)
        for i in range(WALK_FRAMES):
            frame = os.path.join(wdir, f'frame_{i:03d}.png')
            put(frame if os.path.exists(frame) else stand, os.path.join(out, f'{short}_walk{i}.png'))  # cardinals repeat idle
    print(f'  {src} -> walkers/{role}/')

# Import an extra named animation (e.g. Hammering) into <short>_<action>N.png for
# every facing the pack provides. A missing facing repeats the role's idle stand.
def convert_anim(src, role, anim, action, frames):
    adir = os.path.join(SRC_ROOT, src, 'Idle', 'animations', anim)
    out = os.path.join(ROOT, role)
    os.makedirs(out, exist_ok=True)
    for long, short in DIRMAP.items():
        stand = os.path.join(out, f'{short}_stand.png')
        for i in range(frames):
            frame = os.path.join(adir, long, f'frame_{i:03d}.png')
            dst = os.path.join(out, f'{short}_{action}{i}.png')
            if os.path.exists(frame):
                put(frame, dst)
            elif os.path.exists(stand):
                shutil.copy(stand, dst)  # cardinal with no art repeats idle
    print(f'  {src}:{anim} -> walkers/{role}/*_{action}0..{frames - 1}.png')

if __name__ == '__main__':
    jobs = [a.split('=') for a in sys.argv[1:]] if len(sys.argv) > 1 else [
        ('01_ancient_hurler', 'hurler'),
        ('02_camogie_player', 'hurler_f'),
        ('11_sluagh', 'sluagh'),
        ('12_goods_carrier_courier', 'grain_carrier'),
        ('12_goods_carrier_courier', 'grain_carrier_f'),
    ]
    for src, role in jobs:
        convert(src, role)
    # Somhairlín's pack stores her gait under Carefree_walk (not walk) and her
    # build swing under Hammering — import both into the walker layout.
    convert_anim('13_somhairlin_builder', 'somhairlin', 'Carefree_walk', 'walk', WALK_FRAMES)
    convert_anim('13_somhairlin_builder', 'somhairlin', 'Hammering', 'hammer', 7)

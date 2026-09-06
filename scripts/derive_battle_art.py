#!/usr/bin/env python3
# Derive extra battle art from imported sets by recolouring, so we reuse figures
# we already have:
#   ghost <- warrior : a monochrome (grayscale) revenant — the pale war-dead
#   fomor <- lugh    : Lugh recoloured to red & black only — the Fomorian menace
# Run after import_fighting.py (which produces the source sets).
import os, glob
import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BATTLE = os.path.join(REPO, 'assets/battle')

def frames(art):
    return sorted(glob.glob(os.path.join(BATTLE, art, '*.png')))

def _clear(dest):
    os.makedirs(dest, exist_ok=True)
    for f in os.listdir(dest):
        if f.endswith('.png'):
            os.remove(os.path.join(dest, f))

def _lum(a):
    return 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]

def grayscale(src, dest_art):
    dest = os.path.join(BATTLE, dest_art); _clear(dest)
    fs = frames(src)
    for p in fs:
        a = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32)
        lum = _lum(a)
        out = np.zeros_like(a)
        out[:, :, 0] = out[:, :, 1] = out[:, :, 2] = lum
        out[:, :, 3] = a[:, :, 3]
        Image.fromarray(out.astype('uint8'), 'RGBA').save(os.path.join(dest, os.path.basename(p)))
    print(f'{dest_art:8s} <- {src:10s} {len(fs):3d} frames (grayscale)')

def redblack(src, dest_art):
    dest = os.path.join(BATTLE, dest_art); _clear(dest)
    fs = frames(src)
    for p in fs:
        a = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32)
        lum = _lum(a) / 255.0
        out = np.zeros_like(a)
        out[:, :, 0] = np.clip(lum * 255.0 * 1.25, 0, 255)  # red climbs with light; shadows go black
        out[:, :, 1] = np.clip(lum * lum * 70.0, 0, 255)    # a faint ember only at the brightest
        out[:, :, 2] = np.clip(lum * lum * 40.0, 0, 255)
        out[:, :, 3] = a[:, :, 3]
        Image.fromarray(out.astype('uint8'), 'RGBA').save(os.path.join(dest, os.path.basename(p)))
    print(f'{dest_art:8s} <- {src:10s} {len(fs):3d} frames (red/black)')

grayscale('warrior', 'ghost')
redblack('lugh', 'fomor')
print('done')

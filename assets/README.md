# Sprite assets

Hand-drawn / generated **isometric pixel art**. The engine only places and
orients quads — art lives here as PNGs with transparent backgrounds.

## Layout

```
assets/
  buildings/
    rath.png            one flat iso frame per building (camera is fixed iso)
    well.png
    altar.png
  walkers/
    druid/
      druid_S.png  druid_W.png  druid_N.png  druid_E.png    (down, left, up, right)
    water_carrier/
      water_carrier_S.png  water_carrier_W.png  water_carrier_N.png  water_carrier_E.png
```

## Rules

- **Transparent PNG**, trimmed tight to the art.
- **Buildings**: a single frame drawn at the iso angle (one frame is enough
  while the camera doesn't rotate). Anchor: the tile the building sits on is the
  bottom-centre of the sprite.
- **Walkers**: **4 frames** — down/left/up/right, saved as compass suffixes
  `_S _W _N _E`. The loader picks the nearest frame from the walker's heading,
  so 4 is enough; 8 (`_NE _SE _SW _NW` too) is supported if you ever draw them.
  Anchor: bottom-centre = the walker's feet.
- Keep a consistent pixel scale across a set (e.g. a walker ~24px tall, a bothy
  ~32px) so nothing looks mismatched in-world.

## Direction convention

Headings are mapped in iso screen space, where the camera looks down the
`(+1,+1,+1)` axis:

| Suffix | Screen-space facing |
|--------|---------------------|
| `_S`   | toward the viewer (down the screen)   |
| `_N`   | away from the viewer (up the screen)  |
| `_E`   | screen-right |
| `_W`   | screen-left  |
| `_SE _SW _NE _NW` | the diagonals between |

If a set loads facing the wrong way, we calibrate the offset in `sprites.js`
once — the art doesn't need redrawing.

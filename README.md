# Ard Rí

A real-time isometric **city-builder** in the Zeus / Pharaoh (Impressions)
tradition, set in a mythic-historical **Celtic Ireland**. You found a *ráth*,
draw clients with cattle and full grain-stores, and rise from a single homestead
to over-king — one day, High King at Tara.

Rendered with **Three.js** and hand-drawn **isometric pixel-art sprites**, driven
by an **HTML UI overlay** so it plays cleanly on mobile.

See **[ARD_RI_PLAN.md](ARD_RI_PLAN.md)** for the full design and roadmap.

## Status

Phase 1 — engine spike. Boots an isometric world over a tile grid, with the HTML
overlay, a DOM→world placement bridge, and a fixed-timestep simulation on
`⏸ / 1× / 2× / 3×` time controls. Sprites are placeholders until the real pixel
art is drawn.

## Run locally

No build step. Because it uses ES modules, serve the folder over HTTP (opening
`index.html` via `file://` will not load the modules):

```
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tech

- Three.js (loaded via importmap, no bundler)
- OrthographicCamera at a fixed isometric angle
- 2D tile grid as the source of truth; the 3D is a view over it
- All UI is HTML/CSS over the WebGL canvas

import numpy as np
from PIL import Image, ImageDraw
import scipy.ndimage as ndi

im = Image.open('/home/user/ard-ri/tools/keyed.png')
alpha = np.asarray(im)[:, :, 3] > 40
lbl, n = ndi.label(alpha, structure=np.ones((3, 3)))
boxes = []
for i in range(1, n + 1):
    ys, xs = np.where(lbl == i)
    if xs.size < 500:
        continue
    boxes.append((xs.min(), ys.min(), xs.max(), ys.max(), xs.size))
# sort top-to-bottom, then left-to-right in bands of 60px
boxes.sort(key=lambda b: (round(b[1] / 60), b[0]))

comp = Image.alpha_composite(Image.new('RGBA', im.size, (40, 140, 160, 255)), im).convert('RGB')
d = ImageDraw.Draw(comp)
for idx, (x0, y0, x1, y1, a) in enumerate(boxes):
    d.rectangle([x0, y0, x1, y1], outline=(255, 0, 255), width=2)
    d.text((x0 + 2, y0 + 2), str(idx), fill=(255, 255, 0))
comp.save('/home/user/ard-ri/tools/boxes.png')
print('components:', len(boxes))
for idx, b in enumerate(boxes):
    print(idx, b[:4], 'area', b[4])

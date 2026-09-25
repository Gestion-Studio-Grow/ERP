import sys, glob
from PIL import Image, ImageDraw
pat, out, cols, w = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
fs = sorted(glob.glob(pat))
ims = []
for f in fs:
    im = Image.open(f).convert('RGB'); r = w / im.width; im = im.resize((w, int(im.height * r)))
    d = ImageDraw.Draw(im); d.rectangle([0, 0, w, 14], fill='yellow'); d.text((2, 1), f.split('-_admin')[-1][:40], fill='black'); ims.append(im)
h = max(i.height for i in ims); rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h), 'white')
for k, im in enumerate(ims): S.paste(im, ((k % cols) * w, (k // cols) * h))
S.save(out); print(out, S.size, len(ims))

#!/usr/bin/env python3
"""QR del Instagram de CH Estetica & Spa + su colocacion en el flyer.

La URL que paso el cliente traia ?igsh=... , que es un token de sesion de
"compartir" de Instagram: no identifica al perfil y solo alarga el QR (v4 en vez
de v3, o sea modulos mas chicos y mas dificiles de escanear). Se usa la URL
canonica del perfil, que resuelve al mismo lugar.
"""
import segno
from pyzbar.pyzbar import decode as zbar_decode
from PIL import Image, ImageDraw, ImageFont

URL = 'https://instagram.com/chestetica.c'
HANDLE = '@CHESTETICA.C'
F = 'fonts/'
PAPER = (247, 242, 239)
INK = (24, 22, 20)

qr = segno.make(URL, error='M')
side = qr.symbol_size(1)[0] - 8          # modulos sin la zona de silencio
print(f'QR v{qr.version} · correccion M · {side}x{side} modulos · {URL}')


def render(scale, quiet=4, bg=None):
    """QR a `scale` px por modulo. bg=None -> fondo transparente."""
    buf = qr.matrix_iter(scale=1, border=quiet)
    rows = [list(r) for r in buf]
    n = len(rows)
    img = Image.new('RGBA', (n * scale, n * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg:
        d.rectangle([0, 0, img.width, img.height], fill=bg + (255,))
    for y, row in enumerate(rows):
        for x, v in enumerate(row):
            if v:
                d.rectangle([x * scale, y * scale,
                             (x + 1) * scale - 1, (y + 1) * scale - 1], fill=INK + (255,))
    return img


def decodes(pil_img, label):
    """Verifica con zbar (el mismo motor que usan los lectores) que se lee.

    OpenCV no sirve para esto: falla incluso con el PNG de referencia de segno.
    """
    rgb = Image.new('RGB', pil_img.size, PAPER)
    rgb.paste(pil_img, (0, 0), pil_img if pil_img.mode == 'RGBA' else None)
    found = [r.data.decode() for r in zbar_decode(rgb)]
    data = found[0] if found else ''
    ok = data == URL
    print(f'  {"OK " if ok else "FALLA"} {label:34s} {pil_img.size[0]}x{pil_img.size[1]}px -> {data!r}')
    return ok


# --------------------------------------------------------------- entregables
big = render(40)                          # 29*40 + zona de silencio
big.save('qr-chestetica-instagram.png')
onpaper = render(40, bg=PAPER)
onpaper.save('qr-chestetica-instagram-fondo.png')

print('\nVerificacion por decodificacion:')
all_ok = decodes(big, 'PNG grande (transparente)')
all_ok &= decodes(onpaper, 'PNG grande (sobre papel)')

# --------------------------------------------------------------- en el flyer
flyer = Image.open('flyer_Allura_dos-lineas.jpg').convert('RGB')
QR_PX = 148                               # lado del simbolo SIN zona de silencio
QX, QY = 840, 1332                        # papel limpio a la derecha de la cinta

mod = max(1, round(QR_PX / side))
sym = render(mod, quiet=0)
sym = sym.resize((side * mod, side * mod), Image.NEAREST)
flyer.paste(Image.new('RGB', sym.size, INK), (QX, QY), sym)

# leyenda: sin ella, quien no escanea se queda sin saber a donde ir
f = ImageFont.truetype(F + 'Montserrat.ttf', 44)
f.set_variation_by_axes([400])
m = Image.new('L', (900, 140), 0)
dm = ImageDraw.Draw(m)
x = 20.0
for ch in HANDLE:                         # tracking como el resto de la sans
    dm.text((x, 100), ch, font=f, fill=255, anchor='ls')
    x += dm.textlength(ch, font=f) + 5
m = m.crop(m.getbbox())
m = m.resize((round(m.width / 4), round(m.height / 4)), Image.LANCZOS)
cx = QX + sym.width // 2
flyer.paste(Image.new('RGB', m.size, INK),
            (cx - m.width // 2, QY + sym.height + 13), m)

flyer.save('flyer_Allura_qr.jpg', quality=95, subsampling=0)
print(f'\nQR en el flyer: {sym.width}px ({mod}px por modulo) @ x={QX} y={QY}'
      f' | leyenda {m.width}x{m.height}px')

# se relee el JPEG ya comprimido, que es lo que va a escanear la gente
saved = Image.open('flyer_Allura_qr.jpg').convert('RGB')
crop = saved.crop((QX - 34, QY - 34, QX + sym.width + 34, QY + sym.height + 34))
print('\nVerificacion sobre el JPEG final:')
all_ok &= decodes(crop.convert('RGBA'), 'recorte del flyer')
# y a 320px de ancho, el preview de WhatsApp
small = saved.resize((320, 480), Image.LANCZOS)
s = 320 / 1024
c2 = small.crop((int((QX - 34) * s), int((QY - 34) * s),
                 int((QX + sym.width + 34) * s), int((QY + sym.height + 34) * s)))
decodes(c2.convert('RGBA'), 'a 320px (preview WhatsApp)')

print('\nTODO OK' if all_ok else '\nHAY FALLAS')

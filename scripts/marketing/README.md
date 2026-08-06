# Piezas de marketing — reedición de flyers

## `flyer-ch-grand-opening.py`

Reedita el flyer del Grand Opening de **CH Estética & Spa** sobre el arte original,
sin rehacer la pieza: recompone sólo lo que cambia y reutiliza los píxeles del
original para todo lo demás (íconos, moño, "AGOSTO", bloque petfriendly).

**Cambios que aplica**

| Zona | Antes | Después |
|---|---|---|
| Titular | `GRAND OPENING` en serif didone | `Grand Opening` en script (Corinthia Bold), dos líneas desplazadas |
| Fecha | `DOMINGO · 25 AGOSTO` | `SÁBADO · 15 AGOSTO` |
| Petfriendly | — | línea nueva `TAMBIÉN HAY SORPRESAS PARA ELLOS` en dorado suave |

**Salida:** `flyer_ch_15agosto.jpg` (1024×1536, mismo formato que el original) →
publicado en `public/tenants/ch-grand-opening-15ago.jpg`.

### Cómo correrlo

```bash
pip install Pillow                      # requiere raqm para features OpenType (lnum)
mkdir -p fonts && cd fonts              # tipografías desde github.com/google/fonts
curl -LO https://raw.githubusercontent.com/google/fonts/main/ofl/corinthia/Corinthia-Bold.ttf
curl -L -o CormorantGaramond.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf'
curl -L -o Montserrat.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf'
cd .. && python3 flyer-ch-grand-opening.py    # con flyer-ch-original.jpg en el cwd
```

### Decisiones de tipografía (calibradas contra el original, no elegidas a ojo)

- **Montserrat 400** para la sans: comparando anchos de tinta glifo por glifo de
  `DOMINGO` contra nueve candidatas (con el mismo desenfoque que mete el JPEG),
  es la que menos error da. De ahí sale `SÁBADO`, con el tracking resuelto
  numéricamente para respetar el ritmo del original.
- **Cormorant Garamond 600** para el `1` del `15`: el `5` del original no tiene
  terminal de bola en el brazo superior (Playfair sí), y Cormorant lo replica.
  El `5` y `AGOSTO` no se redibujan: se mueven desde el original.
- **Corinthia Bold** para el titular: alto contraste, del mismo ADN didone que el
  logo CH, y con peso suficiente para no volverse hilo sobre el papel `#F7F5F2`.

### Dos detalles que importan si se toca el script

- **Transferencia de diferencia, no unmatting.** Al mover un recorte se traslada
  el delta contra el papel (`píxel − papel_origen + papel_destino`), no el píxel
  crudo: el tono del papel se corre un par de niveles por fila y un pegado directo
  deja un rectángulo visible. Resolver `P = fondo·(1−a) + C·a` tampoco sirve acá —
  vira los dorados a rosa, porque asume tinta negra.
- **El moño arranca en `y=1088`.** Es el techo duro del bloque inferior; por eso
  el bloque petfriendly sube 24 px para hacerle lugar a la línea nueva. El script
  verifica el margen y lo imprime al final.

— Elaborado por GSG

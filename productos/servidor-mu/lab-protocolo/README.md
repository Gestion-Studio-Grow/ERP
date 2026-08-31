# Laboratorio de protocolo

El banco de trabajo para descubrir cómo habla un cliente de MU. El método
completo está en [`../docs/09-camino-propio.md`](../docs/09-camino-propio.md).

## Uso

**Calibrar contra lo conocido** (hacé esto primero, siempre):
```bash
node espia.mjs --proxy --puerto 45405 --destino 127.0.0.1:44405 --nombre s6-calibracion
```
El cliente apunta al 45405; el espía pasa todo al OpenMU del 44405 y registra las
dos direcciones.

**Escuchar un cliente desconocido:**
```bash
node espia.mjs --puerto 44405 --nombre s21-primer-contacto
```

Ctrl+C cierra y te imprime el resumen de opcodes vistos. Las capturas quedan en
`capturas/` como JSONL, una línea por paquete, con el hexadecimal completo.

## Probarlo

```bash
node prueba.mjs
```
Le manda paquetes MU conocidos partidos en pedazos arbitrarios —como los parte
TCP de verdad— y verifica que los reconstruya enteros y lea bien opcode,
subopcode y el flag de cifrado.

## Qué hace y qué no

Desarma el framing de MU (`C1`/`C2` en claro, `C3`/`C4` cifrados), que no cambió
entre seasons, y te muestra cada paquete en hexadecimal. **No descifra** los
`C3`/`C4`: eso es trabajo de descubrimiento, no de herramienta.

Los bytes que no arrancan ningún paquete conocido se marcan `BASURA` en vez de
descartarse en silencio: si aparecen, son un dato.

— Elaborado por GSG

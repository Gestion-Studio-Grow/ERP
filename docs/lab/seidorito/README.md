# Seidorito en la app de GSG — handoff

**Pedido del dueño:** "pasá Seidorito a la GSG app" (2026-10-12).

## Qué es

Seidorito es el personaje/asistente animado del proyecto `sap-activate-copiloto` (Factory-SAP). Su
"video" no es un video: es un SVG cuya boca cambia de dibujo (sprite-swap) según las formas de
**Rhubarb Lip Sync**. Es la misma técnica de Azi (`Factory-GSG/agencia-turismo/video/personaje/BOCETOS.md`).

## De dónde salió

El código fuente **no está en GitHub**: vive en la máquina del dueño. Lo que hay publicado está en
Vercel, equipo `maxilloveras23-collabs-projects`, proyecto `seidorito-console`, deploy de producción
`dpl_2Vjc58iSeFPH2rVThpo2mZJLoGFY`. Se leyó **solo en modo lectura**: no se tocó el proyecto ni se
deployó nada.

| Archivo del deploy | Qué pasó |
|---|---|
| `public/seidorito.svg` | **Recuperado completo** (se sirve como estático). Copia fiel en `recuperado/seidorito.svg`; redibujado inline en `src/components/personaje/Seidorito.tsx`. |
| `src/components/SeidoritoPlayer.tsx` | **No se pudo bajar entero.** El MCP de Vercel corta los archivos a ~1,5 KB y Vercel no sirve los `.tsx`. Se leyó la cabecera (las 3 capas de voz, `PATRON_GENERICO`) y se **reconstruyó** con la misma técnica en `src/components/personaje/SeidoritoPlayer.tsx`, sin sus dependencias de SAP Activate (`@/lib/ruta`, `@/lib/arte`, `ArteEscenario`, `progreso-ruta`). |
| `public/videos/*.visemas.json` (13) | Formato verificado con el primer tramo de `bienvenida.visemas.json` (`metadata.duration` + `mouthCues[{start,end,value}]`), que quedó como fixture en `lipsync.test.ts`. No se migraron: son las bocas de los guiones de SAP Activate. |
| `public/videos/*.m4a` (13) | No se migraron: son locuciones de contenido SAP Activate/Seidor (bienvenida, business partner, plan de cuentas, etc.), no de GSG. |
| `content/seidorito/*.md`, `public/don-seidor.svg`, `seidorito-fuente.svg`, `seidoro*.svg` | Inventariados, no se migraron (persona y guiones de Seidor). |

> Si el dueño quiere el player **idéntico** al original, el camino es copiar
> `src/components/SeidoritoPlayer.tsx` desde la máquina Windows (Factory-SAP) al repo; el componente
> de acá acepta el mismo formato de visemas.

## Dónde quedó en el ERP

- `src/components/personaje/lipsync.ts`: lógica pura (formas A–H/X, `bocaEn`, `PATRON_GENERICO`,
  duración de lectura, reparto de subtítulos, elección de voz es-AR). Con tests en `lipsync.test.ts`.
- `src/components/personaje/Seidorito.tsx`: el personaje con 9 bocas (X = la sonrisa original).
- `src/components/personaje/SeidoritoPlayer.tsx`: reproductor con 3 capas de voz (audio + Rhubarb →
  voz del navegador → lectura), subtítulo con `aria-live`, pausar/seguir, respeta reduced-motion.
- **`/operador/lab/seidorito`**: banco de prueba dentro de la consola del operador (requiere sesión de
  operador, `noindex`).

**Supuesto anotado:** el encargo decía "primero en GSG Lab (`/lab`)". En este repo no existe una ruta
`/lab` (el hub de GSG Lab es un Artifact, ver `.claude/commands/lab.md`), y una ruta pública
`/lab/seidorito` expondría la marca Seidor a cualquiera. Por eso quedó bajo la consola del operador,
que es interna y ya tiene su portón.

## Para usarlo con audio real (Rhubarb)

```bash
rhubarb -f json -o guion.visemas.json guion.wav   # opcional: -d guion.txt mejora la precisión
```

```tsx
<SeidoritoPlayer titulo="…" escenas={[{ texto: "…" }]} audio={{ url: "/…/guion.m4a", visemas: json }} />
```

## Decisiones del dueño (§C, irreversibles o de marca)

1. **Marca Seidor en producto GSG:** mostrar a Seidorito con su identidad (nombre, colores, la persona)
   fuera de la consola, en un producto o vidriera de GSG, lo decide el dueño. Hoy no aparece en
   ninguna vidriera de negocio.
2. **Personaje propio de GSG:** si se quiere un asistente con marca GSG, el componente sirve tal cual
   cambiando el dibujo (`Seidorito.tsx`); la lógica (`lipsync.ts`) y el player no dependen de Seidor.
3. **Fuente original:** traer el `SeidoritoPlayer.tsx` original desde Factory-SAP si se quiere
   paridad exacta (escenas con arte, gestos, progreso de la ruta).

— Elaborado por GSG

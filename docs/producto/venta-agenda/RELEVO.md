# Venta y agenda simples — relevo (05/11/2026, rama `claude/venta-agenda-simple`)

Plan: `PLAN.md` (misma carpeta). Todo detrás del interruptor `venta-agenda-simple` (apagado = como siempre). Nada en `main`, sin migraciones, sin gasto.

## Hecho
- **T1** cobro único turno + productos desde el cajón (1 Order + 1 cobro + stock en 1 tx, idempotente por turno) y tarjeta «Hoy» en el Inicio del dueño. Certificación adversarial: 2 hallazgos MEDIA corregidos, 10/10 tests del certificador. QA e2e 44/45.
- **T2 (parte cobro)** «Paga con → vuelto» (Exacto, billetes, Otro; sólo muestra), «Listo ✓» con [Mandar comprobante por WhatsApp] (`wa.me`, no despacha) y [¿Le damos el próximo?]. QA e2e 96/99.
- E2E: `src/tenants/ch/e2e/venta-agenda.e2e.mjs <carpeta-de-capturas>` (Postgres local 5433 + `next start`).

| Recorrido (prendido) | Antes | Después |
|---|---|---|
| Turno + producto cobrados | 7 toques · 2 cobros · sale a Pedidos | 4 toques · 1 cobro · en el cajón |
| Turno en efectivo con vuelto | 2 (vuelto a mano) | 3 con vuelto a la vista (o 2 sin tocar billete) |
| Dueño: el día | 3 pantallas | tarjeta «Hoy» en el Inicio |

## Pendiente
1. Campo «Otro» del vuelto mide 36 px en escritorio (375 OK); no se halló la regla que lo achica (`VueltoEnEfectivo.tsx`, ni `min-h-12` alcanzó). Cosmético.
2. E2E T2-10b: el «próximo» en la vista Lista no se pudo recorrer (el script no abre ese cajón).
3. T2 alta (categorías + «Los de siempre», C7-V1) sin hacer. Link de reseña y fecha del próximo piden `linkResenaGoogle` / `cadenciaDias`, que no están en el schema.
4. **T3** seña por transferencia: «llegó la seña» con un toque ya existe (`LlegoLaSenia.tsx`); falta dónde guardar alias + horas de vencimiento para negocios de turnos (sólo Taller/Inmo/Pádel tienen `aliasCbu`). Propuesta: migración aditiva sin aplicar (2 columnas opcionales en la config del negocio) → **Gate 2, decide el dueño**.
5. **T4** seña MP: depende de la conexión MP real del negocio (credenciales las pega el dueño).
6. Merge con `origin/claude/fantasma-agenda`: Fantasma ya choca con `main` (route.ts, interruptores.ts, brain). Lo nuestro sólo suma un bloque en `interruptores.ts`: resolver dejando los dos. Falta `tsc` + suites sobre el merge.
7. Fuera de alcance: en Pedidos, «Efectivo» seleccionado con poco contraste (blanco sobre celeste).

## Deuda anotada
La capa `lib` importa de `app/.../vender/datos.ts` y `turnos/agenda-core` (`pesos`); insumos/factura copiados de cobro dividido; la orden del producto no se factura; DEBITO/CREDITO con cast. `redondeos-locales` falla también en `main` (37 líneas ajenas).

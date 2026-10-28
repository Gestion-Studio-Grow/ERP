Veredicto final: CON OBSERVACIONES

# Dictamen M1 · vuelta 5 (final) · tip fd93e5a · diff 9be066c..fd93e5a

Correr con cwd /tmp/wt/magra-m1: `node --import tsx --test <archivo>`. Base efímera localhost:5433; N2_enums.sql
aplicada sólo en la base efímera. Nada contra Neon.

## Verificación
- a) F1..F8 sin reapertura: `cert-magra-tM1/*.test.ts` (vueltas 1-4) 21/21, F8 incluida.
- Suites del repo (`src/lib/caja/*.test.ts`, `src/lib/cierre-mes/*.test.ts`, cuaderno-core, paquete-gate2): 320/321,
  1 salteado (paquete Gate 2 sin GATE2_PG_URL). `tsc --noEmit`: 0 errores.
- b/c) `cert5-redaccion-postgres.test.ts`: 4/5 subtests.
  - (1) B sin interruptor: nada blanqueado, esperado 7.000 (el interruptor de A no cruza). ok
  - (2) A con turno abierto tras conteo ciego con motivo: efectivoACiegas=false, montos visibles, esperado 10.000. ok
  - (3) pantalla del cierre con el interruptor y sin turno: conteo C4, causas (hechos) y TARJETA 5.000 llegan. ok
  - (5) doble `cerrarDia` en Promise.all después de leer a ciegas: un cierre, 0 ajustes, B intacto. ok
  - (4) FALLA F9 (abajo).
  - Ningún flujo de escritura (abrir/cerrar turno, cerrar/reabrir día) llama a los loaders redactados: leen la base.
  - Doble apertura, doble reabrir, mes congelado y Tarjeta con/sin ADD VALUE: cubiertos por la suite del repo
    (m1-caja-medios-postgres, m1-tarjeta-venta-postgres, m1-cert-*) y por cert3-f5/cert-reabrir-mes: verdes.
- d) `cert5-grafo-cliente.mjs` (esbuild, plataforma navegador, corta en "use server"): los 10 "use client" del
  diff + CajaRenglon sin prisma / next/server / server-only / *.server. El verificador sí detecta arqueo-ciego.ts.

## F9 · BAJA · C3: el detalle de la APERTURA lleva los montos escritos
- Dónde: `src/lib/caja/arqueo-ciego-core.ts:57` blanquea `amount` pero no `detail`; el texto lo arma
  `src/lib/caja/apertura-sugerida.ts:151` («A ciegas se contó $X (el libro decía $Y); al abrir, $Z») y se pinta en
  `caja/page.tsx` ResumenDelDia y `CajaRenglon.tsx` (título de la fila).
- Reproducción: A con $12.000, abre a ciegas contando 10.000 + motivo; turno sin movimientos en efectivo; cierra con
  10.000. Sin turno, la Caja lista la fila con «al abrir, $10.000»; `openCashSession(10.000)` → ok, 0 filas
  `caja.apertura-a-ciegas`. Con ventas en efectivo en el medio sólo da el fondo (parcial): por eso baja.
- Test: `cert5-redaccion-postgres.test.ts` › (4).
- Arreglo: en `diaALaVista`, a las filas EFECTIVO también `detail: ""` (la pantalla cae en «Fondo del turno» /
  el rótulo de origen), o un detalle sin montos para APERTURA.

## Observaciones (no fallas)
- `getCierreDiarioData` es acción invocable: con `{esperadoALaVista:true}` o con el día de ayer ya cerrado
  (`registro`) devuelve el efectivo. Decidirlo en el servidor por rol si el dueño oculta el saldo a recepción.
- Texto libre de movimientos manuales (motivos) puede traer montos tipeados por la persona.
- Fuera del alcance a ciegas: reconstruir sumando ventas desde reportes/pedidos; `/admin/caja/libro` y `/cierre`.
- C9 (toques): QA clic por clic pendiente del dueño.

---

## Historia de la certificación (workflow tanda-gsg, run wf_d96f149e-f2d + cierre del orquestador)

| Vuelta | Commit | Veredicto | Fallas alta/media |
|---|---|---|---|
| Construcción | 5aae4ac | — | — |
| 1 | 5aae4ac | NO CERTIFICA | alta: reabrir el día descongelaba días de un mes congelado; alta: Tarjeta sin cablear; media: conteo ciego sin rastro; media: cerrar día vs abrir turno a la vez |
| 2 | be9a48f | NO CERTIFICA | media: reabrir vs congelar el mes a la vez; media: pantalla Caja (OpenCajaForm) sin el interruptor |
| 3 (Opus agotado → Fable) | 3ea35e3 | NO CERTIFICA | media: F7, resumen del día con el esperado a la vista |
| 4 (post Fable) | 94ac9a8 | NO CERTIFICA | media: F8, «movimientos de hoy» reconstruían el esperado |
| Corrección del orquestador | fd93e5a | — | arreglo de raíz de F8 (una sola redacción en el borde del servidor) + alta encontrada por el orquestador: `CajaRenglon.tsx` (cliente) importaba prisma vía `arqueo-ciego.ts` (rompía el test de navegador y el build) |
| 5 (final) | fd93e5a | **CON OBSERVACIONES** | ninguna; F9 baja abierta |

Suite completa en fd93e5a: 6824/6831 (6 fallas, 1 salteado). Las 6 fallas están en archivos que M1 no toca
(club/buffet en navegador, pie-pegado-zona-segura sobre `layout.tsx`, cron de recordatorios, inventario de redondeos
de club/pedidos/vender): vienen de la base. Tests adversariales de la certificación (vueltas 1 a 5): en el
scratchpad de la sesión (`cert-magra-tM1/`), no versionados.

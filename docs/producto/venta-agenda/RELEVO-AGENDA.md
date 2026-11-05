# Relevo — agenda y CH (sesión del 04–05/11/2026)

Cierre por techo de contexto (CLAUDE.md). Todo pedido por el dueño en la sesión; nada se aplicó a Neon.

## En `main` (publicado por orden del dueño, a98c867)
- PR #6 Venta y agenda simples + Agenda interactiva T1/T2 (`AGENDA-INTERACCION.md`, estado al pie) + barra de recepción de CH (`src/apps/visibles.ts` `barraDeRecepcionDeCH`) + pulido 375.
- Verificado al publicar: tsc 0 · 510/510 · build OK · e2e agenda 47/47 · certificación T2 con observaciones (O-1 baja, `src/lib/turnos/duracion-actions.ts:67-75`).
- **Para verlo en CH:** /operador → CH → Interruptores: «Agenda interactiva», «Venta y agenda simples», «Agenda práctica».

## Listo en ramas, SIN publicar (sin migraciones)
| Rama | Qué | Verificación |
|---|---|---|
| `claude/agenda-interaccion` (1292dd5, = `claude/agenda-editar`) | Editar turno (servicio/fecha/hora/profesional), WhatsApp arriba del cajón, sección Pagos. `src/lib/turnos/editar-actions.ts:147` | 574/574 · e2e 71/71 · certificado con obs. bajas O-1..O-4 (`docs`: certif en el scratchpad de la sesión; resumen: cobro anulado bloquea cambio de servicio `editar-actions.ts:88-94`; `collectedBy` viaja en `conCobros` `actions.ts:1098`; seña pedida no cuenta; «avisado» tras cambiar servicio `:396`) |
| `claude/ch-venta-buscar-turnos` (19b937c) | Buscador único en Vender: servicio → turnos libres por profesional → alta precargada. `pedidos/buscar-turnos/`, `src/lib/turnos/turnos-libres-actions.ts:24` | 840/840 · e2e 19/19 · pendiente: sugerencias tapan «Turnos libres»; ¿profesionales sin box? |
| `claude/ch-historia-clinica` (f53ddc0 + arreglo en curso) | Historia por clienta `/admin/historias/[id]`, índice, enlace en cajón y ficha, rastro de auditoría por turno, roles. `src/lib/clientes/historia.server.ts:56`, `historia-core.ts:41` | 230/230 · certificada con obs.: MEDIA auditoría de apertura fail-open + denegados sin registro → **cerrada en d3a0f31** (`historia.server.ts:199` estricto en la misma tx, `historia_denegada`; zona 58/58, tsc 0; falta QA clic de la pantalla de error); BAJA profesional ve notas de turnos de otras profesionales → **decide el dueño (Ley 26.529)** |

## En curso al cerrar (agentes con push a su rama; revisar el último commit)
- `claude/ch-servicio-completo`: alta de servicio con precio a definir, tiempo en agenda (`calendarMin`), seña %, modalidad, tipo (regular/cupos/recurrente), aclaración de recordatorio, hasta 4 imágenes (patrón `InmoFoto`). **Lleva migración aditiva sin aplicar → no va a main sin OK del dueño (Gate 2).** Brief en el commit/rama.
- `claude/ch-liquidacion-comisiones`: diseño `docs/producto/comisiones/LIQUIDACION.md` (f41ea8f) y **T1 hecha (a3c0dca, 2a6af4a)**: período (`src/lib/comisiones/periodo.ts:156`, usado por `settleCommissions` `commission-actions.ts:200`), vista previa (`vista-previa.ts:57`), comprobante WA, «Mi liquidación» (`commissions:read-own`). 15/15 puros + 1/1 postgres; suite 8008/8019 (las 9 fallas también fallan en main). **Falta la certificación adversarial del diff antes de integrar** (diff en el scratchpad de la sesión, `qa-comisiones/t1.diff`; regenerable con `git diff origin/main...origin/claude/ch-liquidacion-comisiones -- src`). Pendientes: período MES provisional; turnos de períodos anteriores entran marcados; zona horaria fija AR.

## Falta
- QA de todos los botones sobre el build de `main`: la corrida parcial (recepción, 1366: 44/49 OK, consola limpia) marcó 5 a verificar: hueco «no hay huecos» (corrió de noche), Mover desde el cajón (timeout), arrastrar no movió, buscar en Clientes sin resultados, abrir ficha (timeout). Corrió con build viejo.
- Agenda T3 (Semana + «Llegó»); dar turno 5 → 4 toques.
- **Pedidos de otra sesión, no hechos (el dueño dijo acá «desestimá lo de 1 hora» y «trabajá la agenda para CH»):** tarifas fijas 1 h/1:30/2 h con pantalla; grises con contraste AA medido; mensaje «OK» colgado y «+ Consumo» en Break Point; sección «¿Hace falta?» de Fable en `AGENDA-INTERACCION.md`. Confirmar con el dueño antes de abrirlos.
- Decisiones del dueño: prender interruptores en CH; publicar cada rama; migración de servicio completo y T2 de comisiones (Gate 2); período/base/productos de comisiones; notas de historia entre profesionales.

Nota técnica: build/tsc con `NODE_OPTIONS=--max-old-space-size=8192`; en worktrees, `node_modules` por hardlink (`cp -al`), no symlink.

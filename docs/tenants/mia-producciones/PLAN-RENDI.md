# Rendí en MIA — plan de integración (Fable, 04/11/2026)

Decisiones del dueño: «productor» = rol PRODUCCION; motor desde `origin/frente/rendiciones` (`gsg-rendi` se perdió); Producción y
Comercial rinden lo propio; ingreso con PIN dinámico. Objetivo: carga de gasto propio (foto; de su bolsillo o con anticipo) contra un
proyecto donde participa; Dirección/Administración aprueba (nunca lo propio); el reintegro entra a su liquidación o sale por caja **una sola vez**.
## 1. Qué se porta del motor (`git show origin/frente/rendiciones:src/lib/rendiciones/<a>`) y qué no
| Origen (rama) | Destino en `main` | Qué queda |
|---|---|---|
| `dinero.ts` (+test) | `src/lib/rendiciones/dinero.ts` | `pesos`, `formatearPesos(Corto)`, `ivaDeLinea`, `sumar`. Sin USD (`convertirAPesos` afuera). |
| `aprobacion.ts` (+test) | `src/lib/rendiciones/aprobacion.ts` | `puedeAprobar` + «nadie aprueba lo propio». `nivelesDeAprobacion` se simplifica: un nivel = {DIRECCION, ADMINISTRACION} menos quien rinde; sin legajo/jefes/suplencias. |
| `rendicion.ts` (+test) | `src/lib/rendiciones/rendicion.ts` | Reducer `aplicarAccion` con estados recortados `borrador→enviada→(devuelta\|rechazada)→aprobada→reintegrada`; `calcularCuadratura` para anticipo. Sin `en_control/contabilizada/cerrada`. |
| `tipos.ts` | `src/lib/rendiciones/tipos.ts` | Sólo `Centavos`, `MedioPago` (`propio_a_reintegrar` \| `efectivo_anticipo`), `EstadoRendicion`, `EventoRendicion`. Persona = `ProyectoPersona` de MIA. |
| `README.md` | `src/lib/rendiciones/README.md` | Reglas de la casa (puro, centavos, fecha por parámetro). |
**Se descarta:** `src/plugins/sap/*`, `lote-contable`, `conciliacion`, `haberes`, `motor-fiscal` (12 reglas), `qr-arca`, `textos`, demo
`/demo/rendiciones`, cascarón `origin/frente/rendi-app` (810 commits atrás: no se rebasa). README MIA punto 11: sin Compras ni IVA compras.
## 2. Matriz de usuarios (módulo nuevo `rendiciones` en `MODULOS`, `gestion-core.ts:608`; permiso fino por acción, no sólo ver/editar)
| Rol | Rendir lo mío (proyectos donde está) | Aprobar / devolver / rechazar | Pagar o reintegrar | Ver cifras |
|---|---|---|---|---|
| DIRECCION | sí | sí (no lo propio) | sí | todo |
| ADMINISTRACION | sí | sí (no lo propio) | sí (caja y liquidación) | todo |
| COMERCIAL | sí | no | no | sólo lo propio (sigue sin `costos`/`pagos`) |
| PRODUCCION | sí | no | no | lo propio + `pagos: E` que ya tiene |
| DISENO | no (provisional a confirmar) | no | no | nada |
`PERMISOS_BASE` (`gestion-core.ts:636-642`) suma `rendiciones`; «rendir lo mío» no exige `pagos`: guarda `actorRinde(proyectoId)` = está en `ProyectoEquipo` (ver todos no alcanza para rendir).
## 3. Modelo de datos (migración ADITIVA `prisma/migrations/20261104121000_rendiciones/`, SIN aplicar; el código tolera su ausencia)
- `ProyectoRendicion`: `id, tenantId, proyectoId, gastoId @unique por tenant, personaId, medio ("PROPIO"|"ANTICIPO"), anticipoId?,
  montoCentavos Int, archivoId? → ProyectoArchivo (tipo nuevo COMPROBANTE), estado, eventos Json, aprobadoPor?, aprobadoEl?,
  liquidacionId?, reintegradoEl?, createdAt`. Claves: `@@unique([tenantId, gastoId])` (un gasto, una rendición) y
  `@@unique([tenantId, liquidacionId, gastoId])` (un extra por gasto por liquidación). RLS como `proyecto_gastos/migration.sql:41`.
- `ProyectoAnticipo`: `id, tenantId, personaId, proyectoId?, montoCentavos, entregadoEl, devueltoCentavos, estado`. Su egreso usa
  `CashMovement.proyectoAnticipoId` (columna nueva) con `@@unique([tenantId, proyectoAnticipoId, type])`.
- `ProyectoLiquidacion`: columnas `pagadaEl?`, `pagadaPor?` (estado `PAGADA`); `CashMovement.proyectoLiquidacionId` nueva,
  `@@unique([tenantId, proyectoLiquidacionId, type])`. `ExtraGuardado` (`empresa-core.ts:178`) suma `gastoId?` y `reintegro: true`.
- `ProyectoGasto` sigue en Float pesos (deuda anotada); la rendición guarda centavos y convierte con `pesos()`. **Regla de caja (3 líneas):** un gasto PROPIO no asienta egreso al cargarse ni al aprobarse (la plata salió del bolsillo de la persona,
no de la caja): el único egreso es el reintegro, al pagar la liquidación (un egreso por liquidación, el gasto queda `liquidacionId`) o
al reintegrar directo (egreso con `proyectoGastoId`, clave única existente `CashMovement_tenantId_proyectoGastoId_type_key`), nunca ambos:
el claim es `updateMany where liquidacionId IS NULL AND reintegradoEl IS NULL`. Anticipo: el egreso se asienta al entregarlo; los gastos
pagados con anticipo no asientan nada; `calcularCuadratura` da el sobrante (INGRESO «devolución de anticipo») o el faltante (reintegro).
## 4. PIN dinámico de ingreso (`src/lib/rendiciones/pin-core.ts` puro + `pin.server.ts`, patrón de `segundo-factor-core.ts:9-13`)
- Quién: COMERCIAL/PRODUCCION de una productora (`ROLES_CON_PIN`); la clave sigue siendo el primer paso; el PIN reemplaza al TOTP para
  quienes no tienen app. Dirección/Administración siguen con TOTP. Tabla `ProyectoPinIngreso`: `tenantId, userId, hash (HMAC-SHA256 con clave derivada de AUTH_SECRET, nunca el código), venceEl,
  usadoEl?, intentos, bloqueadoHasta, createdAt`, `@@unique([tenantId, userId])` → **un código vivo por usuario**: pedir otro pisa el anterior.
- 6 dígitos de `randomInt`, vence a los 5 min, un solo uso (`usadoEl` se marca con `updateMany where usadoEl IS NULL` en la misma
  transacción que da el pase), `MAX_INTENTOS = 5`, `BLOQUEO_MS = 15 min`, comparación `timingSafeEqual`, `darPase` de
  `segundo-factor.server.ts:41`. Pedido y envío atados al `tenantId` de la sesión del primer paso, nunca a un mail suelto.
- Anti enumeración: `pedirPin` y `confirmarPin` devuelven siempre «Si tu usuario existe, te llegó un código» en el mismo tiempo
  (trabajo mínimo constante: siempre se calcula un HMAC); no se distingue bloqueado/vencido/inexistente al usuario, sólo en bitácora.
- Canal propuesto: mail (`enviarMailInterno`, `src/lib/notifications.ts:81`, Resend free tier **provisional a confirmar**: hoy sin
  `RESEND_API_KEY` corre en modo simulado). Alternativa costo cero: Dirección/Administración ven el código en «Equipo» y lo pasan por
  WhatsApp a mano (`wa.me`, sin API paga). Nada de SMS ni WhatsApp Business hasta la venta (DEMO→VENTA).
## 5. Tandas (1–2 constructores cada una, Opus; adversarial sólo plata/seguridad sobre el diff)
1. **Motor + datos.** `src/lib/rendiciones/{tipos,dinero,aprobacion,rendicion}.ts` + tests portados; migración `20261104121000_rendiciones`
   escrita sin aplicar; `schema.prisma`; `gestion-core.ts` (módulo, matriz, `actorRinde`). Tests: aprobación (nadie lo propio; Comercial
   no aprueba), reducer (doble `aprobar` rechazado), cuadratura. Adversarial: tenant cruzado en claves únicas, RLS.
2. **Cargar y aprobar.** `src/lib/proyectos/acciones-rendiciones.ts` (`rendirGasto` crea `ProyectoGasto` sin egreso + rendición + archivo,
   `aprobar/devolver/rechazar`), pantalla `proyectos/[id]/_rendiciones.tsx` y «Mis rendiciones». Tests: Producción rinde donde está y no
   donde no; Comercial rinde; doble envío del form = una rendición (`@@unique gastoId`). Adversarial: aprobar lo propio por POST directo.
3. **Reintegro y caja.** `acciones-empresa.ts`: `generarLiquidaciones` suma extras `reintegro` de rendiciones aprobadas sin reclamar;
   `pagarLiquidacion` (PAGADA + un egreso); `reintegrarDirecto`; anticipos. Tests: gasto aprobado → entra una vez aunque se genere dos veces;
   reintegro directo + liquidación concurrentes → un solo egreso; anticipo con sobrante → INGRESO. Adversarial: doble asiento, montos negativos, centavos.
4. **PIN.** `pin-core.ts` + `pin.server.ts` + `login/pin/` (reusa `segundo-paso/`). Tests: vence, un solo uso, bloqueo a los 5, respuesta
   idéntica usuario inexistente, código de otro tenant no entra. Adversarial completo (fuerza bruta, enumeración, reuso, timing). Entrega 1–2 pueden ir en paralelo; 3 espera a 1.
## 6. Lo que se eleva al dueño
- **Gate 2:** `prisma migrate deploy` de `20261104121000_rendiciones` en Neon (y si Vercel tiene `MIGRATE_DATABASE_URL`, el push a `main` la aplica solo).
- Canal del PIN: Resend (cuenta y `RESEND_FROM_EMAIL`, secreto lo pega el dueño) o código a mano por WhatsApp. Si DISENO rinde.
- Confirmar con MIA: 5 min / 5 intentos; reintegro por liquidación (default) o directo por caja; quién entrega anticipos. Y corregir el
  encabezado del README MIA (`:3-5`, `:16`): dice «sin aplicar» cuando `lote-deploy.txt:46-54` dice aplicado el 02/11.

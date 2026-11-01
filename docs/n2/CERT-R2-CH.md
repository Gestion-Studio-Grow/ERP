Veredicto final: NO CERTIFICA

# Dictamen — ronda 2 (`estetica/ronda2`, HEAD `fc0aec24`, contra `origin/main` `8d3057f5`)

Modo completo. Certificador independiente: no se corrigió nada.

**Motivo del rechazo:** un solo hallazgo ALTO de plata (F1): una seña deshecha o anulada y vuelta a cobrar no entra al libro, y la pantalla le dice a la recepción que quedó confirmado.

**Aclaración para decidir:** F1 no es una regresión. También está en `origin/main`, reproducido con el mismo caso. Rechazo igual porque está dentro de lo pedido (A1, anular y devolver seña) y CH lo recibe por primera vez con este pase, ya que hoy no está en producción. Lo que la rama trae nuevo aguantó todos los ataques de plata.

Etiquetas: `[VERIFICADO]` = ejecutado o leído en el código citado · `[POR LECTURA]` = leído, no ejecutado · `[A VALIDAR]` = con modo de cierre escrito.

---

## Hallazgos

### F1 · ALTO · plata · también en main — la seña vuelta a cobrar no entra al libro `[VERIFICADO]`

**Dónde**
- `src/lib/turnos/cobro-dividido.ts:133` `claveDeSenia(appointmentId)`: la clave depende sólo del turno.
- `src/lib/turnos/cobro-actions.ts:372`: el cobro usa esa clave fija.
- `src/lib/turnos/cobro-turno-repo.ts:201-206`: si la clave ya existe, devuelve `applied:false, reason:"duplicate"`, aunque ese cobro esté anulado.
- `src/lib/turnos/cobro-actions.ts:378-385` y `:434-440`: confirma el turno igual y avisa «La seña ya estaba cobrada: quedó confirmado.»
- `src/lib/turnos/cobro-actions.ts:683-779` `deshacerSenia`: vuelve el turno a PENDING.
- `src/app/admin/(dashboard)/turnos/agenda-core.ts:150-153` y `_agenda/TurnoCajon.tsx:310,413`: con el turno en PENDING reaparece «Llegó la seña».

**Caso ejecutado** (`adv-sena2`, Postgres efímero, acciones reales)
1. La dueña cobra una seña por Transferencia de $5.000.
2. La dueña toca Deshacer. El turno vuelve a PENDING y reaparece «Llegó la seña».
3. Llega de nuevo la seña, en efectivo, y se toca «Llegó la seña».
4. Respuesta: `{ok:true, cobroId:null, monto:0, confirmo:true, aviso:"La seña ya estaba cobrada: quedó confirmado."}`.
5. Resultado: turno CONFIRMED, filas +5.000 y −5.000, **0 asientos de efectivo**.

**Efecto:** la plata está en la mano, no está en el libro, el turno figura confirmado sin seña y el cajón va a dar sobrante.

**Otros caminos**
- `adv-anular`: lo mismo por recepción tras anular con código. Ahí el turno queda CONFIRMED y la pantalla no ofrece el botón, pero la acción sí lo permite.
- `[POR LECTURA]` También se llega en pantalla si la profesional cobró la seña sin confirmar (queda PENDING) y después se anula.

**Arreglo sugerido (no aplicado):** clave con número de intento, como `previos.length+1` de `cobrarVariosTurnos`, o ignorar las claves de cobros ya anulados. Además, no confirmar con `applied:false` si la seña sigue faltando.

### F2 · MEDIO · plata · preexistente — comisión ya pagada de un cobro que después se anula `[VERIFICADO]`

**Dónde:** `src/lib/turnos/anulacion.ts:369` `anularCobroTurnoInTx` no mira `commissionPayoutId` (grep sin resultados en `anulacion.ts`).

**Caso** (`adv-com2`): se liquida y paga la comisión, y después se anula el cobro. El pago de $9.000 sigue en pie, el `Payment` queda en 0/PENDING, y no hay aviso ni contrapartida.

**Efecto:** la profesional queda cobrada de más y nadie se entera.

**Arreglo sugerido:** avisar al anular o dejar un saldo a favor del negocio para la próxima liquidación.

### F3 · MEDIO · plata · preexistente, sólo Taller/AGR — Taller escribe dentro de un día cerrado `[VERIFICADO]`

**Dónde:** `src/lib/taller/caja.ts:50-76` `asentarCobroInTx` y `:79-105` `revertirCobroInTx` no tienen frontera de cierre y usan `occurredAt` = ahora. Los llaman `src/lib/taller/acciones.ts:388` y `:434`. El comentario de `caja.ts:9` dice que un día ya cerrado no se reescribe, y el código no lo cumple.

**Caso** (`adv-cuenta`): con el día de hoy cerrado, `registrarPago` y `anularPago` asientan VENTA 1.234 y EGRESO 7.000 dentro de ese día. Los turnos, en el mismo caso, rechazan.

**Efecto:** cambia lo que el libro dice de un día ya cerrado y mueve la apertura siguiente sin explicación.

**Arreglo sugerido:** la misma guarda de turnos.

### Observaciones BAJAS

| # | Qué | Dónde | Estado |
|---|---|---|---|
| B1 | Taller `registrarPago` sin clave: dos envíos simultáneos por servidor dan 2 cobros. La pantalla lo frena con `BotonEnviar`. | `src/lib/taller/acciones.ts:367` | `[VERIFICADO]` |
| B2 | «-100» en una columna sin contar, enviado directo al servidor, queda sin conciliar en silencio. La pantalla lo bloquea. Preexistente. | `src/lib/cierre-diario-actions.ts:651` | `[VERIFICADO]` |
| B3 | Modal de reserva: cualquier `res.ok===false` (también cupón, teléfono o error genérico) oculta esa hora libre hasta cambiar servicio o profesional. | `src/app/(site)/_ch/BookingModal.tsx:279,451,669` | `[POR LECTURA]` |
| B4 | EGRESO de Taller con `createdBy user:` probablemente figura «cargado a mano» en el CSV, aunque no se puede borrar. | `src/lib/caja/libro-caja.ts` | `[POR LECTURA]` |
| B5 | El libro selecciona `tallerPagoId` sin guarda de columna. Si faltara en producción, el libro entero falla. Cierre: consultar `_prisma_migrations` por `20261009120000_taller_caja`, por quien tenga acceso. | `src/lib/libro-caja-actions.ts:247` | `[A VALIDAR]` |

---

## A. Plata: lo que aguantó `[VERIFICADO]`

- **Cuenta a mano (A5)**, `adv-cuenta`, día con turnos, Taller, anulaciones, gastos a mano y comisión por Transferencia: EFECTIVO 8.000 · MP 8.500 · TRANSFERENCIA 19.900 · TARJETA 2.000. Da igual en hoja de cierre, `getLibroCajaData`, CSV (suma de filas y resumen) y `esperadoEnElCajon` (8.000).
- **Cierre (A3):** aviso «Lo contado coincidió con el libro. Sin conciliar: Mercado Pago ($8.500,00), Tarjeta ($2.000,00).». Anular un turno con el día cerrado rechaza. `cierre-aviso-sin-contar` pasa.
- **Anulaciones (A1):**
  - Carreras (turno y Taller): 1 solo egreso.
  - Roles: `anular-*-roles-postgres` y `devolucion-medio` pasan en la suite.
  - Ventas: puerta única por `anularVentaCore`. `anularRenglonDeCaja` es de ticket sin cobrar.
  - No se objetan, por decisión del dueño: inmobiliaria sin código y egreso a mano de recepción sin código.
- **Comisión (A2):** un parcial anulado espera. Al condonar da 10 % de lo cobrado real ($1.000), con egreso en TRANSFERENCIA. La segunda liquidación da `error_nada`. Recepción es redirigida. `comision-medio` pasa.
- **Taller (A4):** `metodoDeCaja` (`src/lib/taller/caja.ts:25-40`) manda Transferencia a su columna (`9e4e5ea8`). VENTA y EGRESO de Taller no se borran del libro y figuran `borrable:false` (`ca2e16a7`).

## B. Aislamiento `[VERIFICADO]`

`adv-rls` pasa. Con sesión del negocio B e ids del negocio A, ninguna acción escribe ni lee: anular, autorizar, cerrar, seña, deshacer, Taller, libro, comisión, `getClient`. Libro, hoja y espera de B quedan limpios. Contexto RLS de B mirando A: 0 filas.

- La cobertura cruzada de ventas la da el test del repo «otro negocio» de `anular-venta-roles-postgres`; en mi test ese caso cortó antes por un nombre de campo equivocado.
- Queries nuevas con `tenantId`, sin SQL crudo nuevo, `force-dynamic` en sitemap. Caché pública sólo en `/tenants`, `/team` y `/sin-negocio`.
- `gate:rls` OK.

## C. Modal y deslizar `[VERIFICADO salvo lo indicado]`

`reserva-modal-flujo` (jsdom, prendido y apagado: doble toque, respuesta vieja, rechazo, plazo) y `deslizar-tactil` (Chromium táctil real) pasan: 35/35. Ver B3.

Cierre de mes y bancos: **no recorridos en página real**. `ContarYCerrar.tsx:343`, `CongelarDeslizando.tsx:77` y `EmitirDeslizando.tsx:56` usan el mismo componente con `key={intento}`, verificado por lectura. `U4.5` figura SIN PROBAR en el UAT.

## D. Otros negocios `[POR LECTURA]`

- `4b2eb958` y `f4adf368` entran sólo por `esEstetica` (slug `beauty-spa`). Los demás rubros tienen textos idénticos.
- `chConDisenoNuevo` corta por slug.
- `textoDeEsperaPorSaldo(null)` da el texto de siempre.
- Inmobiliaria: sólo lectura de código, nada ejecutado sobre sus datos. `src/app/inmobiliaria/page.tsx:79` y `src/components/inmobiliaria/Recibo.tsx:16` sólo toleran el «+». `src/lib/inmobiliaria/acciones.ts` sin cambios de lógica salvo `29c260cf` (WhatsApp canónico).
- La orden del dueño de anular vale para todos los negocios a propósito.

## E. Compilación y suite `[VERIFICADO]`

| Control | Resultado |
|---|---|
| `git diff --name-only origin/main...HEAD -- prisma` | vacío, sin migraciones |
| `npx tsc --noEmit` | exit 0 |
| `next build` | exit 0, sin tocar `.next/cache` |
| `gate:rls` | OK |
| `npm test` completo, sin navegador disponible | 7675 tests · **pass 7320 · fail 60 · cancelled 293 · skipped 2** |
| Re-corrida de los 74 archivos con fallas, con `.efr/_pw-shell.mjs` | 639 tests · pass 576 · **fail 63** |
| Los 39 archivos que siguen fallando, en `8d3057f5` | 417 tests · pass 369 · **fail 48** |

**Comparación por test: 48 fallan en ambos, 15 sólo en la rama, 0 sólo en main.**

Límite: para los 48 quedó establecido que también fallan en main. No busqué la causa de cada uno, salvo los que se detallan.

Limitación: `facturar-turno-con-cobro-anulado`, `facturar-venta-anulada`, `cartera-abonos` y `lista-postgres` fallaron en la corrida completa y pasaron al re-correr sin carga. No establecí la causa de esa intermitencia.

### Las cinco pedidas

| Test | ¿En main? | Causa |
|---|---|---|
| `src/lib/caja/m1-caja-medios-postgres.test.ts` | Sí | Test viejo desde la migración `20261030120000_m1_enums_caja` («la base nace sin DEBITO» es true). Corta en la línea 75 y no ejecuta sus controles de plata. **Una copia adaptada (`EGRESO TRANSFERENCIA 500`) pasa entera: no es rechazo, es deuda de cobertura.** |
| `src/lib/caja/corte-inicial.test.ts` | Sí | Etiqueta vieja «MP / Transf.» contra «Mercado Pago». No es plata. |
| `src/lib/turnos/mi-turno.test.ts` | **No** | `leerMiTurno` agrega `service.depositAmount` y el test es viejo. No es fuga: es página de servidor. `[CONTRADICTORIO]` el TRASPASO lo daba por anterior a la rama; en `8d3057f5` pasa. |
| `src/lib/guardia-bundle-cliente.test.ts` | Sí | Separador `\` de Windows en la salida contra `/` en el test. |
| `src/app/admin/(dashboard)/armazon/armazon-ch.test.ts` (2) | **No** | Fixture vieja: las clases `lg:min-h-10` y `lg:py-[7px]` de `AdminShell.tsx:91` no están en `armazon-head.json`. Es la primera diferencia; no pude confirmar que sea la única. |

### Fallas sólo en la rama (15): ninguna es defecto de producto

| Test | Causa | Estado |
|---|---|---|
| `armazon-ch` (2), `mi-turno` (1) | Ver arriba. | `[VERIFICADO]` |
| `src/app/contador/MesDelEstudio.test.ts` (1) | Busca `/h-11 sm:h-9/`; la escala cambió. | `[VERIFICADO]` |
| `src/lib/pos-peso.test.ts` (1) | Busca el texto en `MagraTienda`; el contador se mudó a `magra/Etiqueta.tsx:26`, que sigue con `formatearCantidad`. | `[VERIFICADO]` |
| `src/lib/reserva-publica-postgres.test.ts` (1) | Test con franjas que se pisan: la 2.ª reserva da «Ese horario ya no está disponible». La primera guarda. **El caso «sin nota» no se ejercita.** | `[VERIFICADO]` |
| `src/lib/stock/alta-producto.test.ts` (1) | `9192396b` sacó la opción WEIGHT del alta, a sabiendas. | `[VERIFICADO]` |
| `src/apps/kpis/fila.test.ts` (1) | 46-47 ms contra tope de 45. La rama no toca `src/apps/kpis`. Tiempo de esta máquina. | `[VERIFICADO]` |
| `src/app/admin/(dashboard)/vender/vender-pantalla.test.ts` (1) | Pasa solo: intermitente. | `[VERIFICADO]`; causa no establecida |
| `src/app/tienda/magra-bolsa-navegador.test.ts` (1) | La rama agregó `scroll-behavior:smooth` (`magra/estilos.ts:350`) y el test mide durante el desplazamiento. Una copia con `behavior:'instant'` pasa 8/8: la barra no tapa el pie. | `[VERIFICADO]` |
| `src/app/tienda/tienda-nueva-entrega-navegador.test.ts` (5) | `w.__montar is not a function`: el arnés no tiene falso de `next/font`. Una copia con el falso pasa 5/5. **El test del repo sigue roto y MG-032/034/036 hoy no protegen nada en la suite.** | `[VERIFICADO]` |

### Fallas en ambas (48)

Las 5 de esta lista que coinciden con las pedidas ya se explicaron arriba.

- vercel-build 10
- acceso-comun-lab 4
- cuenta-y-buffet-pantalla 3
- demo-local 2, tenant 2, seed-postgres 2, guardia-bundle 2, design/hoja 2
- 1 cada uno: sitio-estatico, seguridad-hallazgos, reset-golive-postgres, rechazo-de-dominio (CRLF), facturacion/motor-postgres, ensayo-lote-neon, redondeos-locales, reminder-sweep-postgres, links-y-clientes-postgres (p95), club/estado-postgres, club/anonimizar, m1-caja-medios-postgres, corte-inicial, arca-procesador-sin-operador-postgres, integraciones/redaccion y contrato (ruta `C:\C:\`), eventos vuelta4, vuelta5 y emitir (`psql ENOENT`), vuelta6 (tiempo), cuaderno-postgres

---

## Lo que no pude probar

- Deslizar en la página real de cierre de mes y de bancos, en un celular.
- Recorrido en vivo de otros negocios. D es por lectura de código y suite.
- CI en Linux/LF: todo corrió en Windows con checkout CRLF, que explica parte de las 48.
- Columnas de producción (B5): sin acceso a Neon, por prohibición del brief.
- Causa de cada una de las 48 en ambas, y de las intermitencias bajo carga.

## Entorno

- `C:\r2` quedó limpio salvo este archivo. Los tests reescriben `.qa/facturacion-escala/rendimiento*.txt` (versionados): los restauré con `git checkout -- <ruta>` en `C:\r2` y `C:\reportes`.
- Para comparar contra main usé `C:\reportes` (limpio en `8d3057f5`) y reconstruí su `.next`, que está ignorado.
- Procesos ajenos colgados, no tocados: PID 25792/37676 (corrida con `--test-concurrency=2`, `demo-local`) y 19592/3708/39424/19968 (`reserva-modal-flujo`).
- Tests adversariales, fuera del repo: `C:\Users\MLLOVE~1\AppData\Local\Temp\claude\C--Users-mlloveras2-Documents-Claude\392f7e71-179a-4e6c-a710-485cda5528a4\scratchpad\certr2\` (`adv-sena2`, `adv-anular`, `adv-com2`, `adv-cuenta`, `adv-rls`, `m1-adaptado`, `tienda`, `mb`).

## Pendientes

- Arreglar F1 antes del pase de CH, o que el dueño acepte el riesgo por escrito. **Una vez en producción, las señas mal cobradas no se recuperan solas.**
- Decidir F2 y F3: preexistentes, se pueden tratar aparte.
- Reparar los tests rotos sin defecto de producto. Primero `tienda-nueva-entrega` y `m1-caja-medios-postgres`, que hoy dejan plata y envíos sin cobertura.
- Cerrar B5 contra `_prisma_migrations` de producción, por quien tenga acceso.
- Revisar los procesos ajenos colgados.

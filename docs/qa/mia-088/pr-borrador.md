> Borrador contra `mia-083/administracion` (77f1a6ba). Sin merge, sin Vercel, sin Neon. Sin cambios propios en `prisma/`: el diff contra 77f1a6ba trae 2 migraciones (`20261117120000_consola_cuadrilla`, `20261117130000_cuadrilla_correcciones`) y el `schema.prisma` (+101, −0) por la unión con #188 (87e8f1e9), tal como vienen, aditivas y SIN APLICAR (Gate 2 del dueño). La integración la hace GSG-PLAT-024. Cabeza 4909727 (`mia-088/permisos`): WIP de MIA-088, #188 (87e8f1e9), A1 de DIR-007 y H1/H2 (MIA-091), cierre de MIA-096.

## Qué cambia y por qué

GSG-MIA-088 · permisos de Proyectos y Administración de MIA. Origen: PRY-100, PRY-099 y ADM-143; Lote 2: ADM-134, ADM-135 y ADM-140 (= P3). PRY-013 no se toca (pregunta 3).

**P1 · la regla escrita una vez.** Tabla rol × módulo en `docs/qa/mia-088/tabla-de-permisos.md`:

| Módulo | Dirección | Administración | Comercial | Diseño | Producción |
|---|---|---|---|---|---|
| Proyectos y leads | E | V | E | V | E |
| Ficha del evento | E | V | V | V | E |
| Costos y márgenes | E | V | N | N | E |
| Proveedores | E | E | N | N | E |
| Cotizaciones y planilla de venta | E | V | E | V | E |
| Diseño | E | N | E | E | E |
| Pagos y cobros del evento | E | E | N | N | E |
| Cuentas, cashflow y bancos | E | E | N | N | N |
| Liquidaciones del equipo | E | E | N | N | N |
| Tablero, Rentabilidad y Configuración (`direccion`) | E | N | N | N | N |
| Equipo, roles y permisos | E | N | N | N | N |
| Estudio IA y agentes | E | N | E | E | E |
| Rendiciones de gastos | E | E | V | N | V |

Columnas de costo de la ficha ocultas a Comercial y Diseño. **Quién la cambia: sólo Dirección** (`gestion-core.ts:737`). Los agentes tienen la fila de su rol: ninguna puerta nueva pregunta si el actor es agente.

**Preguntas del plan:**
- Pregunta 1: opción A, sólo Dirección cambia la matriz. Confirmada por el dueño el 18/11 (vía ORQ-007).
- Pregunta 2: opción A, Rentabilidad y Configuración por el módulo `direccion` (ver lee, editar guarda). Confirmada por el dueño el 18/11 (vía ORQ-007).
- Pregunta 3 (PRY-013): opción A, Producción sigue viendo costo y margen; no se toca. Provisional a confirmar por el dueño.

**Filas ya guardadas:** quedan como están, sin revertirse solas. Dirección las ve en Equipo › Permisos y, con quién y cuándo, en Equipo › Registro de cambios.

**Arreglos:**
- **P2 · PRY-100.** `guardarPermisos` exige `cambiaLosPermisos` (`acciones-gestion.ts:275`), con un candado por negocio para dos guardados a la vez (`:280`). `guardarPersona` no deja que alguien sin Dirección desvincule su cuenta o la pase a otra ficha (`:214`). En la pantalla, las casillas siguen la misma regla (`equipo/page.tsx`).
- **P3/P10 · PRY-099.** `exigirPlataDeDireccion` (`gestion.server.ts:70`): capability de agenda como techo y, además, el módulo `direccion` del rol de gestión. Va en `reporteProyectos` (`datos.server.ts:160`), `proveedoresConGastos` (`:194`), `guardarConfig` (`acciones.ts:684`) y las páginas `reportes` y `config`. El calendario por token arma el rol con `rolDelActor`: sin ficha, nada (`gestion-lecturas.server.ts:163`).
- **P4 · ADM-143.** En `acciones-empresa.ts`, un id ajeno o inventado contesta «no existe»; lo propio sigue diciendo su estado.
- **P9 · ADM-134.** `motivoSinRendiciones` en las 7 acciones (`acciones-rendiciones.ts:73,175,254,297,339`; `:175` cubre aprobar, devolver y rechazar). Las lecturas usan `revisaRendiciones` (`rendiciones.server.ts:90,136`; `comprobante.server.ts:20`).
- **P11 · ADM-135.** El botón usa `pagaLiquidaciones`, la misma regla que `pagarLiquidacion` (`administracion/page.tsx`).

**P3 · los usos de `veLaPlata` de Proyectos (capability `agenda:manage`, el techo del rol ERP) y qué decide cada uno:**
1. `acciones.ts:394` `pagarGasto`: techo ERP del pago directo; la matriz ya pidió `pagos` E.
2. `[id]/_pestanas-plata.tsx:210`: carga directa = `pagos` E y techo ERP.
3. `proveedores/page.tsx:29`: pagar = ve la plata, `pagos` E y techo ERP.
4. `proveedores/[id]/page.tsx:29`: lo mismo que el 3.
5. `configuracion/page.tsx:67`: el link a Configuración = techo ERP y `direccion` E.
6. `config/page.tsx:24`: sólo el ítem «Plata» de la barra; la página la frena `exigirPlataDeDireccion("editar")`.
7. `reportes/page.tsx:28`: lo mismo que el 6, con `("ver")`.
8. `clientes/ClientesProductora.tsx:15`: Clientes del ERP, fuera de la matriz.
9. `clientes/[id]/FichaProductora.tsx:26`: lo mismo que el 8.
10. `datos.server.ts:76` (`tableroProyectos`): código sin llamadores.
11. `datos.server.ts:83` (`fichaProyecto`): código sin llamadores.

Más el calendario por token, arriba. `reporteProyectos` y `proveedoresConGastos` dejaron de decidir por capability.

**P4 · las acciones con id de `acciones-empresa.ts`:**
- 14 de las 19 llevan id, probadas en 18 llamadas: `crearPagoEmpresa` (proveedor), `marcarCuotaEmpresa`, `anularCuotaEmpresa` (dos llamadas), `guardarDatoCuota` (tres campos), `guardarSaldo`, `importarExtracto`, `conciliarMovimiento` (movimiento y cuota ajenos), `desconciliarMovimiento`, `guardarGastoFijo`, `bajaGastoFijo`, `pagarLiquidacion`, `borrarLiquidacion`, `editarExtrasLiquidacion` y `marcarLiquidacionVista`.
- Las otras 5 no reciben id: `cuentasParaMarcar`, `crearCuenta`, `guardarTipoCambio`, `generarLiquidaciones` y `publicarBorradores`.
- También se prueban las 7 de rendiciones y `guardarPersona`, que ya contestaban igual y quedan de guardia: 27 casos en total.

## Cómo se verificó

Todo contra Postgres del contenedor, con la app como `app_rls` (sin BYPASSRLS) y Server Actions reales con sesión.

- **Rojo** en 89b7a5c (sólo tests sobre 77f1a6b): 9 tests, 8 fallan por aserción (resumen abajo). El rojo de P9 acción por acción en 77f1a6b: sin acceso, las 7 pasan y escriben; con «ver», `entregarAnticipo` pasa. P11(a) ya se rechazaba en la base y queda de guardia.
- **Verde** en 70a5471 (arreglo, sin tocar tests) y en la cabeza 4909727: 18/18 (los 3 archivos de arriba más `gestion-core-matriz`, `matriz-permisos` y `mia091-cuenta-owner-postgres`), corrido por MIA-096.
- **Suite completa por nombre** contra 77f1a6b (`resumen-tests.mjs`, tres veces cada una, alternadas, mismo Postgres): base 77f1a6ba 9892, 9893 y 9892/9896; cabeza 4909727 10040/10043 las tres. Ningún rojo nuevo por nombre: la cabeza tuvo 0 rojos; la base, la medición de tiempo de `club/almacen.test.ts:132` en 2 de 3. Los 3 salteados son los mismos por nombre. `tsc --noEmit` 0 y `next build` 0 en 4909727 (con `--max-old-space-size=6144`: con el heap de fábrica `tsc` se queda sin memoria en este contenedor).
- **Rojo de tiempo, intermitente y anterior a esta rama:** «medición: una acción con el almacén…» (`:132`; la aserción es `:161`, dentro de la misma prueba). Sola, 10 veces cada una: base 1 rojo (1,58 ms contra 1,17), cabeza 0. En la suite: base 2 de 3, cabeza 0 de 3. La rama no toca `club/`. No es regresión. Queda anotado y no se toca acá.
- **P5:** unión con #188 (87e8f1e9), `git merge-tree` sin choques. Tests de #188 sobre la unión: 27 archivos, 337/337 (MIA-091, 7769c0e2); en la cabeza 4909727 entran en la suite completa, sin rojos.
- **Capturas** a 390 y 1.280 sobre la demo local (PGlite, datos inventados) en 4909727, miradas por un verificador visual distinto con lo esperado copiado del plan: A1 a A4 (rechazos) y D1 a D4 (la dueña). Coinciden las 16. A4 y D4 a 390 necesitaron una captura más, con la tabla corrida hasta Acciones. No van a Git.
- **Registro:** `docs/qa/mia-088/registro.md`, con `registro-agente.mjs` en 0 y un par revisor aparte.

```
# 89b7a5c (sólo tests sobre 77f1a6b), corrido por MIA-096
not ok 1 - ADM-143 · las acciones de Administración con id: un id de otro negocio contesta igual que uno inventado, sin afirmar estados y sin escribir
not ok 2 - PRY-100 · Administración con «Equipo» no cambia la matriz por fuera de la pantalla: ninguna fila, ninguna columna, 0 renglones
not ok 3 - PRY-100 · el camino de dos pasos: con «Equipo» en Comercial (se lo dio Dirección), Comercial no le sube nada a Administración
not ok 4 - PRY-100 · quien tiene «Equipo» carga personas, pero no se cambia de ficha (desvincularse es el primer paso para cambiarse el rol)
ok 5 - PRY-100 · Dirección sigue pudiendo todo: la dueña sin ficha y una Dirección con ficha cambian la matriz, con su renglón
not ok 6 - PRY-099 · Rentabilidad y Configuración las decide el rol de gestión: Comercial, Administración y Producción con agenda:manage, rechazados aunque llamen directo
not ok 7 - PRY-099 · Dirección (dueña sin ficha y con ficha) lee Rentabilidad y guarda Configuración; a quien Dirección le abre `direccion`, según ver o editar
not ok 8 - PRY-099 · el calendario por token arma el mismo rol que la sesión: sin ficha no es Dirección
not ok 9 - ADM-134 y ADM-135 · Rendiciones y pagar liquidación deciden por la matriz en el servidor, además del rol
# tests 9
# pass 1
# fail 8
```

**Para revisar:**
- `/admin/reportes` de las productoras embebe Rentabilidad. Quien no tiene `direccion` ahora termina en Inicio de Proyectos.
- `veLaRendicion` (rendiciones-core) quedó sin uso en la app.
- En la demo el menú de arriba mostró «Dirección» a Comercial. Es porque el negocio de prueba no está en panel cerrado (`layout.tsx:269-279`); en MIA filtra por la matriz.
- P8 (agente en Dirección, freno de #188) no está acá: va en otra sesión.
- Lo que vio el verificador visual, sin cambiar nada: a 390 la matriz, Rentabilidad y Liquidaciones se corren dentro de su caja (la página no desborda), y la pestaña «Seguridad» de Equipo se ve cortada como «S». A1 a 1.280 deja una franja en blanco bajo la barra donde otros roles tienen submenú.
- Ramas hermanas para PLAT-024: `mia-089/plata` (0b52fac7) entra limpia; `mia-084/n1-n8` (87305206) choca en `acciones-gestion.ts` (van PRY-100 y G4p) y en `empresa.server.ts` (no es de esta rama).
- Filas 25 a 27 del registro (A1 de DIR-007, H1 y H2): esperan la certificación adversarial del diff f5704da5..5b0e7566.

## Core/frente y sector

Proyectos y Administración (gestión de eventos) / ERP · MIA (productora de eventos).

---

## 🛡️ Gate de Excelencia

### 1. Auditoría SAP Fiori + ángulo argentino
- [x] Rol-based: la misma regla en pantalla y servidor; avisos en criollo («Los permisos los cambia Dirección…»).
- [x] Accesibilidad: casillas `disabled` reales, no ocultas; el aviso es texto.
- [x] Consistencia: reusa `permisoDe`, `rolDelActor` y `exigir*`.
- [x] 🇦🇷 Criollo claro. ARCA, MP y WhatsApp: N/A, sin cambios de cobro.

### 2. Sello de marca GSG
- [x] Commits con trailer. Metadata y footer: N/A, sin cambios de layout.

### 3. Excelencia Arquitectura
- [x] Reglas puras en `gestion-core.ts` con test; puertas en el servidor; `tenantTransaction` y RLS sin evadir. Deuda anotada arriba.

### 4. Confiabilidad de Producción
- [x] tsc 0, tests 18/18 y suite sin rojos nuevos, build 0 (en 4909727). Aislamiento por negocio probado con dos negocios. Sin migraciones propias; las 2 de #188 (aditivas, sin aplicar: Gate 2 del dueño) entran por la unión con 87e8f1e9.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01BtqRUMDUKZMMGzvoycizHU

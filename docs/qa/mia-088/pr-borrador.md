<!-- WIP: borrador del cuerpo del PR de GSG-MIA-088; los «…» entre comillas angulares son resultados que faltan correr. -->
> Borrador contra `mia-083/administracion` (77f1a6ba). Sin merge, sin Vercel, sin Neon, sin `prisma/`. La integración la hace GSG-PLAT-023.

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

**Provisional a confirmar por el dueño:**
- Pregunta 1: opción A, sólo Dirección cambia la matriz.
- Pregunta 2: opción A, Rentabilidad y Configuración por el módulo `direccion` (ver lee, editar guarda).
- Pregunta 3: opción A, Producción sigue viendo costo y margen; no se toca.

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
- **Verde** en 70a5471 (arreglo, sin tocar tests) y en la cabeza: «VERDE».
- **Suite completa por nombre** contra 77f1a6b (`resumen-tests.mjs`): «SUITE». `tsc --noEmit` 0. `next build` «BUILD».
- **P5:** unión con #188 (87e8f1e9), `git merge-tree` sin choques. Tests de #188 sobre la unión: «P188».
- **Capturas** a 390 y 1.280, miradas por un verificador visual distinto: A1 a A4 (rechazos) y D1 a D4 (la dueña). Coinciden las 8. No van a Git.
- **Registro:** `docs/qa/mia-088/registro.md`, con `registro-agente.mjs` en 0 y un par revisor aparte.

```
«ROJO»
```

**Para revisar:**
- `/admin/reportes` de las productoras embebe Rentabilidad. Quien no tiene `direccion` ahora termina en Inicio de Proyectos.
- `veLaRendicion` (rendiciones-core) quedó sin uso en la app.
- En la demo el menú de arriba mostró «Dirección» a Comercial. Es porque el negocio de prueba no está en panel cerrado (`layout.tsx:269-279`); en MIA filtra por la matriz.
- P8 (agente en Dirección, freno de #188) no está acá: va en otra sesión.

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
- [x] tsc «TSC», tests «VERDE», build «BUILD». Aislamiento por negocio probado con dos negocios. Sin migraciones.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01BtqRUKFLdmj82wWNWDMZXj

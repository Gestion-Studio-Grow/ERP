# Rendí × MIA Producciones — relevamiento (04/11/2026, sobre origin/*, sin checkout)

## 1. Rendí hoy
**Tres lugares, ninguno en producción:**
- `origin/frente/rendiciones` (d7ad20f2, 25/09): historia ANTERIOR a la de `main`. Su raíz es c36c4b1a (30/06/2026);
  las raíces de `main` son de octubre (dd8a1e9f, 603b45b6, 3aec1802): por eso no hay base común. Es archivo:
  `docs/adr/ADR-099-rendi-rendicion-de-gastos-con-sap.md:10` «esta rama no se mergea a main» (opción D, 25/09).
  Trae (34a69248): motor puro `src/lib/rendiciones/*` (150 tests), plugin SAP modo Archivo `src/plugins/sap/*`,
  demo pública `/demo/rendiciones` con datos ficticios, sin login ni base.
- `origin/frente/rendi-app` (eb2c3aeb, 15/10, base 68b43fd4 del 13/10, **810 commits detrás de main**): sólo cascarón.
  App `rendicion-de-gastos` `estado: "en-preparacion"` (`src/apps/catalogo/finanzas.ts:323,331`), módulo apagado
  `src/modules/descriptors/rendiciones.ts` (sin `nucleoPara`, ningún preset), `/admin/rendiciones/page.tsx:13-14`
  = `requireApp` + `notFound()`. Sin migraciones, sin pantalla.
- Repo del producto `gsg-rendi`: vive en `C:\gsg-rendi` (descriptor `rendiciones.ts:9`, `page.tsx:9`); el ADR-099
  vigente es `docs/adr/ADR-099-rendi-producto-propio-nucleo-portable.md` de ESE repo. **No está en GitHub
  accesible** (`list_repos "rendi"` vacío) → su modelo de datos actual no se pudo leer. Lo que sigue es el de la rama.

**Flujo (contrato `src/lib/rendiciones/tipos.ts`, rama rendiciones):**
- Carga: comprobante con datos de QR ARCA / IA / persona (`:121`, `:156-173`), `hashImagen` contra foto duplicada
  (`:167`), constatación y CUIT apócrifa (`:168-170`). Imputación: tipo de gasto + **centro de costo** + medio
  (`:132-148`): anticipo, tarjeta corporativa, recargable o `propio_a_reintegrar` (`:125-129`).
- Motor fiscal 12 reglas (`motor-fiscal.ts`), cuadratura contra anticipo (`rendicion.ts`).
- Estados `borrador→en_aprobacion→(devuelta|rechazada)→aprobada→en_control→contabilizada→cerrada` (`:367-384`).
- Aprobación por legajo y cadena de jefes, nadie aprueba lo propio, suplencias (`aprobacion.ts:1-30`).
- Reintegro/salida: lote contable SAP (`lote-contable.ts`), conciliación IVA Simple, archivo para Haberes (`haberes.ts`).
- Roles: `RolRendi = "rinde" | "aprueba" | "tesoreria" | "contador"` (`tipos.ts:220`); Persona con legajo, jefe,
  centro de costo (`:228-237`). Plata en centavos enteros (README `:23`).

## 2. MIA en origin/main
**Roles:** `ROLES_GESTION = DIRECCION, ADMINISTRACION, COMERCIAL, DISENO, PRODUCCION` (`src/lib/proyectos/gestion-core.ts:597`),
en `ProyectoPersona.rol` (migr. gestion_eventos `:93-105`). **«Comercial» existe; «productor» no**: el más cercano es
PRODUCCION («Producción»). Permisos base `gestion-core.ts:636-642`: PRODUCCION `pagos: E`; COMERCIAL `pagos: N`, `costos: N`.
COMERCIAL ve todos los proyectos; PRODUCCION sólo donde está en el equipo (`:701`).
**Gastos por proyecto:** tabla `ProyectoGasto` (`20261101130000_proyecto_gastos/migration.sql:6-24`): proveedor, rubro,
neto/iva **Float**, `comprobante` texto (≤60, número, no foto), `pagadoEl/medio/pagadoPor`, `anuladoEl`, `cargadoPor`.
Sin estado de aprobación, sin «quién lo puso de su bolsillo», sin anticipo.
- `registrarGasto` pide editar `pagos` (`src/lib/proyectos/acciones.ts:244-245`); si viene pagado asienta EGRESO en
  `CashMovement` con `proyectoGastoId` (`:228-242`, `:287`). `pagarGasto` (`:294-313`) con guarda contra doble clic.
- Cuota de pago marcada crea gasto + egreso (`acciones-ficha.ts:784-789`); anular devuelve la plata (`:889-902`).
- Pantalla: `src/app/admin/(dashboard)/proyectos/[id]/_gastos.tsx:8,25`, `_pestanas-plata.tsx:377`.
- README MIA punto 11 (`docs/tenants/mia-producciones/README.md:179-182`): no pasan por Compras ni IVA compras.
**Liquidaciones:** `ProyectoLiquidacion` (migr. `:267-282`): periodo, base, `extras` JSON, total, estado
`BORRADOR→PUBLICADA`, `vistaEl`. `generarLiquidaciones` = sueldoBase + plus por evento terminado
(`acciones-empresa.ts:306-340`, `gestion-core.ts:400`); extras manuales, descuento en negativo (`:369-390`);
«Mi liquidación» para todo el equipo (`gestion-core.ts:665`). **No hay estado PAGADA ni asiento en caja** de la liquidación.

## 3. Superposición y brecha
**Ya hay:** gasto imputado a proyecto con neto/IVA y rubro comparado contra presupuesto; egreso en caja atado
(`proyectoGastoId`); permisos por módulo y por visibilidad del proyecto; archivos (R2) por proyecto; avisos;
bitácora `registrarCambio`; liquidación con extras manuales.
**Falta para «productor/comercial rinde un gasto → liquidación → caja»:**
1. Rol: decidir si «productor» = PRODUCCION o rol nuevo; COMERCIAL hoy no tiene `pagos` (no puede cargar gastos).
   Hace falta un permiso propio «rendir lo mío» (el descriptor de rendi-app ya lo anticipa, `rendiciones.ts:30-31`).
2. Datos: en `ProyectoGasto` (o tabla nueva aditiva) quién pagó de su bolsillo (`personaId`), medio
   «propio a reintegrar»/anticipo, estado (borrador/enviado/aprobado/rechazado/reintegrado), foto del comprobante
   (vínculo a `ProyectoArchivo`), aprobador. Hoy un gasto no pagado es «deuda con proveedor», no con la persona.
3. Aprobación: no existe; Rendí trae la regla (nadie aprueba lo propio, cadena de jefes) en motor puro portable.
4. Liquidación: un gasto aprobado debería entrar como extra (`proyectoId`, reintegro) en `extras` al generar;
   hoy `generarLiquidaciones` sólo mira `plus` del equipo. O bien reintegro directo por caja.
5. Caja: la liquidación no asienta pago; el reintegro necesita un egreso con clave única (patrón `proyectoGastoId`)
   para no contar dos veces el gasto ya asentado ni duplicar al pagar la liquidación.
6. Anticipos al productor: no existen en MIA (Rendí los tiene: cuadratura). Fiscal: MIA guarda Float en pesos;
   Rendí centavos enteros: reconciliar.
7. Motor Rendí: el vigente está en `C:\gsg-rendi`, fuera de GitHub alcanzable; integrarlo exige el «plan de
   integración» que aprueba el dueño (`rendiciones.ts:10-11`). rendi-app debe rebasarse sobre main (810 commits).

## 4. Migraciones de MIA en producción (según docs, sin Neon)
`prisma/lote-deploy.txt:46,49,52,54`: `modulo_proyectos`, `proyecto_gastos`, `proyecto_entregables` y
`proyecto_gestion_eventos` **«aplicada en Neon el 02/11: sale de la lista»**; `20261102120000_consultas` aplicada el
02/11 por el build de Vercel (`:58`). Coherente con el alta de MIA «por comando … --produccion» del 02/11
(README `:95`). **Contradicción a corregir:** el encabezado del README MIA (`:3-5`, `:16`, `:250-252`) todavía dice
«sin tocar Neon / sin aplicar». Gana `lote-deploy.txt` (lo lee el build), pero no se verificó contra la base.

## Decisiones del dueño (04/11/2026)
- «Productor» = rol **Producción** de MIA (no se crea un rol nuevo).
- Rendí se construye **dentro del ERP partiendo del motor de `origin/frente/rendiciones`** (el repo `gsg-rendi` estaba sólo en la
  laptop perdida y no está en GitHub).
- **Ajustar la matriz de usuarios:** Producción y Comercial pueden rendir sus propios gastos contra los proyectos donde participan.
- **Ingreso con PIN dinámico** para quienes rinden (diseño en el plan; seguridad = certificación adversarial).

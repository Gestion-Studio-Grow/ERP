# 🎯 Set mínimo vendible — perfil EMPRESA (día 1)

**Qué es:** la lista priorizada y accionable de qué necesita el perfil **Empresa** (pyme) para poder
**venderse y usarse el día 1**, para que **S4 la habilite en la nav**. Sale del pedido del dueño ("producto
para pymes cuanto antes"). Validado contra el mapa de cobertura ya validado
(`mapa-cobertura-scope-items.md`), contra el código real (`src/modules/nav-groups.ts`, `AdminShell.tsx`) y
contra los 4 tenants reales.

**Autor:** Analista de mercado local (Consultores) · **Fecha:** 2026-07-08 · **Rama:**
`claude/sprint-startup-generic-rf6x0m` (sprint, sin merge a `main`, sin tocar Neon).
**Naming:** "Comercio" (lite) / "Empresa" (enterprise) de cara al cliente; `lite`/`enterprise` solo en código.

---

## 0. Respuesta en una línea

> **Empresa día 1 = TODO el piso Comercio (ya funciona) + framing de perfil "Empresa" + UN ancla nueva de
> alto valor pyme: Cuentas a pagar con cheque diferido (J59).** Todo lo demás profundiza pantallas que YA
> existen (Compras formales, Reportes de rentabilidad) o se difiere a fase 2. **No se cablea en la nav
> ningún ítem sin pantalla** — sería un callejón sin salida.

## 1. Tres hechos duros que mandan sobre la prioridad

**Hecho 1 — Empresa ⊇ Comercio: el piso ya está construido y funcionando.** Los 17 ítems de
`AdminShell.ALL_ITEMS` (Dashboard, Agenda, Clientes, Pedidos, Caja, Catálogo, **Compras**, Ajustes,
Reseñas, Recordatorios, **Facturación**, **Reportes**, Auditoría, Usuarios, Localización, Módulos) son el
piso `lite` y **todos operan hoy**. Por el invariante `enterprise ⊇ lite`, Empresa los ve **todos** sin
tocar nada. Es decir: **el 90% del producto Empresa ya existe** — es el mismo Core, más profundo.

**Hecho 2 — los 5 hrefs "enterprise" del backlog NO tienen pantalla.** Verificado en el repo hoy:
`/admin/cuentas-a-pagar`, `/admin/contabilidad`, `/admin/devoluciones-proveedor`, `/admin/inventario`,
`/admin/cuentas-a-cobrar` **no existen como ruta**. Si S4 los mete en la nav ahora, son **callejones sin
salida** (link que no lleva a nada) — exactamente el anti-patrón que QA marca. **Regla dura:** un ítem
entra a la nav **solo cuando su pantalla existe**, nunca antes (coherente con ADR-059 D3 fix #4: nada de
candados/links muertos por la nav).

**Hecho 3 — 0 de 4 tenants es Empresa.** CH (servicios), Magra (carnicería), Shine (velas), A Dos Manos
(pádel) son todos **micro/Comercio**. No hay hoy una pyme Empresa real operando ni (en el repo) un lead
identificado. Por **ADR-030 (no se invierte hasta vender)**, construir en masa pantallas enterprise
especulativas es el error a evitar: se construye **lo mínimo para vender el primer contrato Empresa**, y el
resto **cuando ese contrato lo justifique**. → ver "ELEVAR AL DUEÑO" (§4).

## 2. Set mínimo priorizado (lo que se lanza)

Tres niveles. **P0 no cuesta pantallas** (solo encender el perfil), **P1 profundiza lo que ya existe**,
**P2 es la única pantalla nueva imprescindible**.

| Prio | Qué | Scope | Naturaleza | Pantalla | Por qué es día-1 |
|---|---|---|---|---|---|
| **P0** | Perfil **Empresa** encendible + naming "Empresa" + tier en canal neutro + los 17 ítems Comercio visibles | — | Flag + UI (ya casi listo por PR-1/PR-2, ADR-059) | ✅ ya existe | Sin esto no hay "producto Empresa" que vender; con esto ya hay uno (⊇ Comercio) |
| **P1.a** | **Compras → órdenes formales a proveedor** (razón social, CUIT, N° orden) | J45/18J (aditivo) | Profundizar pantalla existente | ✅ `/admin/compras` existe | Diferencia Empresa de Comercio **sin pantalla nueva**; el pyme compra formal, el micro repone a ojo |
| **P1.b** | **Reportes → rentabilidad por producto/margen** | 16T (aditivo) | Profundizar pantalla existente | ✅ `/admin/reportes` existe | Idem: valor Empresa barato, sin dead-end |
| **P1.c** | **Home analítico por rol** (Empresa) vs. home de una acción (Comercio) | ADR-059 D8 | UI | ✅ `/admin` existe | Diferenciación **percibida** (anti-rechazo enterprise); es re-layout, no módulo nuevo |
| **P2** | **Cuentas a pagar con CHEQUE DIFERIDO** (fecha, banco, saldo a proveedor) | **J59** | **Pantalla NUEVA** | ❌ construir `/admin/cuentas-a-pagar` | **El ancla.** Es el dolor #1 de la pyme AR y lo que hace que "Empresa" **se sienta** Empresa. El cheque diferido es específico y no negociable en AR. Sin esto, Empresa = Comercio con reportes lindos. |

**El set mínimo vendible es P0 + P1 + P2.** P0/P1 no requieren construir módulos nuevos (framing +
profundización de 3 pantallas existentes). **La única construcción de pantalla nueva imprescindible es P2
(J59 Cuentas a pagar).**

## 3. Qué queda para FASE 2 (y por qué)

| Ítem | Scope | Por qué se difiere |
|---|---|---|
| **Contabilidad / libro mayor** | J58 | El contador de la pyme **ya tiene su software** (Tango/Colppy). El día 1 alcanza con un **botón "Exportar para el contador"** en Reportes (CSV/Excel), NO un módulo contable completo. El libro mayor formal espera un cliente que lo pida (ADR-030). |
| **Devoluciones a proveedor** | BMK | El mapa ya lo marcó **prioridad baja**. Cuando aparezca, es **sub-pantalla de Compras**, no ítem propio de nav. No mueve la venta. |
| **Inventario formal (recuento físico)** | BMC | El mínimo anti-oversell **ya lo cubren** `Compras` (suma stock) + `Ajustes` (merma/rotura) sobre el ledger F1b/F2 en `main`. El módulo de recuento físico formal espera demanda de rubro. Además es **rubro-gated, no enterprise-only** (aplica también a Comercio con stock). |
| **Cuentas a cobrar formal** | J60 | Es **profundización del fiado (2F3)**, que es **default-OFF gateado por rubro** (revisión S5/Opus). No es piso Empresa universal — se enciende para tenants de fiado, no para toda pyme. |

**Regla de fase 2:** cada uno se construye **cuando un contrato Empresa concreto lo pida** (ADR-030),
priorizado por el PO del Catálogo y desafiado por este rol. Ninguno bloquea la venta del set mínimo.

## 4. Lista ACCIONABLE para S4 (habilitar en la nav)

`src/modules/nav-groups.ts` ya tiene `BACKLOG_SCOPE_ITEM_NAV` con los `perfilMin` correctos. Ajustes para
el lanzamiento Empresa:

1. **P0 — encender el perfil, sin ítems nuevos.** Con `PROFILES_ENABLED` on + perfil del tenant =
   `enterprise`, los 17 ítems del piso ya se muestran (ninguno tiene `perfilMin` → todos `lite` → visibles
   en Empresa). **No agregar nada a la nav todavía.** Empresa día-1 arranca siendo Comercio con label
   "Empresa" + home analítico (P1.c).
2. **Regla de oro para los ítems del backlog:** **un ítem entra a la nav SOLO cuando su pantalla existe.**
   Hoy los 5 hrefs enterprise/backlog no tienen ruta → **NINGUNO se cablea aún**. Cablear = callejón sin
   salida.
3. **Orden de habilitación (a medida que las pantallas shippean):**
   - **(1º) `/admin/cuentas-a-pagar`** — `perfilMin: "enterprise"`, grupo `finanzas`. Entra a la nav
     **cuando su pantalla (J59 + cheque diferido) esté construida.** Es la P2, el ancla. **Prioridad #1 de
     construcción.**
   - **(2º) Compras formal (P1.a) y Reportes rentabilidad (P1.b)** — **NO son ítems nuevos de nav**: mismo
     href, se profundiza la pantalla. S4 no toca la nav para esto; es trabajo de pantalla.
   - **(3º, fase 2)** `/admin/contabilidad` (J58), `/admin/devoluciones-proveedor` (BMK),
     `/admin/inventario` (BMC): quedan en `BACKLOG_SCOPE_ITEM_NAV` **sin cablear** hasta fase 2.
4. **`defaultOff` / rubro-gating se mantiene** como está en `nav-groups.ts` (Inventario y Cuentas a cobrar
   son rubro-gated, no enterprise-only — no forman parte del set mínimo Empresa universal).

**Neto para S4 hoy:** el lanzamiento Empresa **no agrega ítems a la nav** — habilita el perfil y el home
analítico. El **primer ítem nuevo** (`/admin/cuentas-a-pagar`) entra cuando backoffice-ingeniería construya
su pantalla. Cero callejones sin salida.

## 5. Validación contra los tenants reales

- **Ninguno de los 4 es Empresa** → el lanzamiento Empresa necesita un **tenant de demo Empresa** para
  vender (ADR-059 D8: demo sobre un tenant de **su** rubro/tamaño, **nunca** la carnicería, con **su**
  marca). Hoy no existe. Es un item abierto (abajo).
- **El piso que Empresa hereda está probado en prod** (CH opera agenda/caja/catálogo/facturación/reportes
  reales) → el 90% de Empresa ya tiene rodaje real, no es humo.
- **J59 (cuentas a pagar) no está ejercitado por ningún tenant hoy** → su diseño se valida con el primer
  lead Empresa real, no con los 4 actuales (que cobran, no gestionan pago a proveedores con cheque).

## 6. ⤴️ Para ELEVAR AL DUEÑO

Ninguno toca §C (código/doc, sin Neon/deploy/migración). Pero dos decisiones exceden mi rol:

1. **¿Hay un lead Empresa real en el pipeline?** El set mínimo asume que construir **J59 (P2)** se justifica
   por una venta próxima (ADR-030). **Si NO hay lead Empresa concreto**, la recomendación cambia: parar en
   **P0 + P1** (Empresa = Comercio re-frameado + profundizaciones baratas, **cero pantalla nueva**) y
   **diferir J59** hasta que aparezca el lead. Esta es la decisión que más mueve el alcance — la necesito
   confirmada.
2. **Tenant de demo Empresa** (rubro + marca) para poder mostrar/vender Empresa (ADR-059 D8). Hoy no
   existe; sin él la venta Empresa no tiene vidriera. Definir con qué rubro/marca se arma (provisional: uno
   de servicios profesionales o retail mediano, **a confirmar**).

**Supuesto fuerte anotado:** asumo que el cheque diferido es la feature ancla de J59 por conocimiento de
mercado pyme AR (es el instrumento de pago dominante entre pyme y proveedor), **no** por dato de los 4
tenants (ninguno lo usa). El primer lead Empresa lo confirma o lo refuta.

— Elaborado por GSG (Analista de mercado local — célula Consultores), 2026-07-08

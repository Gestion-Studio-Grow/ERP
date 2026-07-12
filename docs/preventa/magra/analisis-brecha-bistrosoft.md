# MAGRA — Análisis de brecha vs Bistrosoft (backoffice)

**Para:** decisión de reemplazar el sistema actual de MAGRA Meat Market (Canning, Bs. As.).
**Qué es esto:** qué le da Bistrosoft hoy a MAGRA, qué le falta a nuestro `/admin` para reemplazarlo, y
dónde somos claramente superiores. Cada dato marca su confianza: **[VERIFICADO]** (sitio oficial o API en
vivo de MAGRA), **[INFERIDO]**, **[NO VERIFICADO]**.

> **Dato clave:** MAGRA **hoy usa Bistrosoft** — su "LISTA DE PRECIOS" apunta a
> `borders.bistrosoft.com/menu?commerceId=11113834`. Es el sistema que estamos reemplazando.

---

## 0. Corrección de un supuesto — Bistrosoft SÍ vende por peso

El brief interno asumía que "la venta por peso" era nuestro gran diferencial. **No lo es.** Leyendo la
API en vivo de MAGRA (`borders-webapi.bistrosoft.com`, `commerceId=11113834`, `listId=4289`) se confirma
que Bistrosoft maneja venta por kg de forma **nativa** **[VERIFICADO]**:

- Productos con `weightable: true`, `type: "PESABLE"`, `measureUnit: "Kg"`, y un parámetro
  `hasToFilterWeighableProducts`.
- **Stock fraccional real** de MAGRA (`"16.235"`, `"1.395"`, `"4.415"` kg).
- **Precio por kg** (ej. *Asado banderita $37.500/kg, Carne picada $18.500/kg*).
- SKU tipo balanza/PLU (`1011113834493`) → integración plausible con balanza (**[NO VERIFICADO]** el
  detalle físico).

**Conclusión:** la venta por peso es **paridad de tabla**, no diferencial. Nuestro `/admin` también la
tiene en el modelo (`Product.saleUnit=WEIGHT` + `pricePerKg`); lo que faltaba era **exponerla en la UI del
backoffice** (resuelto en este sprint, §4). El diferencial real está en el **rubro cárnico específico** y
en la **vidriera con marca propia** (§3).

---

## 1. Qué es Bistrosoft y qué le da a MAGRA

- Empresa **argentina** de software de gestión **gastronómica** (restaurantes, bares, cadenas). Se
  autodefine *"la primera solución Android de software gastronómico para Argentina"*. **[VERIFICADO]**
- **Está fuera de su rubro nativo:** una carnicería boutique usando una herramienta de restaurante. El
  ajuste a carne es por su motor genérico de "producto pesable", **no por diseño de rubro**. **[VERIFICADO/INFERIDO]**
- SaaS por suscripción mensual, sin contrato mínimo. **[VERIFICADO]**

**Módulos (sitio oficial + API de MAGRA) [VERIFICADO]:** POS/caja + arqueo, comandas, KDS cocina, salón/
mesas, móvil, **inventario/stock** ("detección de mermas" genérica + stock mínimo), delivery propio +
integración PedidosYa/Rappi, **carta digital QR**, **tienda online (Weborders)**, **facturación AFIP/ARCA**
(campos fiscales serios: `rootVat`, `rg5329`, `exempt/nonTaxed`), **Mercado Pago**, reportes en tiempo real,
API (solo Premium), multi-local.

**Lo que NO aparece en Bistrosoft [NO VERIFICADO por ausencia]:** módulo de **cuenta corriente de clientes**
ni de **compras/proveedores/órdenes de compra**. No hay evidencia en el sitio ni en el data model de MAGRA.

### La "lista de precios" que usa MAGRA hoy (`borders.bistrosoft.com`)
Es **"Bistrosoft Orders"** — una carta pública (SPA Vue) del comercio. En la instancia real de MAGRA
**[VERIFICADO en vivo]**:
- **306 productos, 202 disponibles**, categorías **CARNE BOVINA · CARNE DE CERDO · POLLO ORGÁNICO ·
  ACHURAS · PESCADO · QUESOS · PANIFICADOS · CONSERVAS Y ALGO MÁS · VARIOS HELADERA**.
- **Multi-canal de precios** (`Mostrador` · `Delivery` · `Weborders`): distinto precio/IVA por canal sobre
  el mismo catálogo (hoy MAGRA los tiene iguales, pero la capacidad existe). **← esto Bistrosoft lo tiene y
  nosotros no (ver §5).**
- **Vidriera genérica en subdominio ajeno:** URL `borders.bistrosoft.com`, **sin dominio propio**, branding
  mínimo, **casi sin fotos** (`image` vacío) ni descripciones, con **errores JS en consola**
  (`getOriginName ... 'origins'`). **[VERIFICADO]**

### Precios (AR, jul-2026, + IVA) [VERIFICADO]
| Plan | Precio/mes | Resumen |
|---|---|---|
| Licencia Web | **$36.000 + IVA** | 1 usuario, comandas, facturación, carta QR (1 menú), inventario básico |
| Avanzado | **$66.000 + IVA** | usuarios ilimitados, stock/costos/recetas, delivery propio, apps de delivery |
| Premium | **$96.000 + IVA** | API, multi-local, centro de producción, tienda online ilimitada |

Modelo "plan base + licencias adicionales" → el costo real sube según módulos. **MAGRA, por tener tienda
online + 306 productos + multi-canal, cae probablemente en Avanzado o Premium ($66k–$96k + IVA/mes)** **[INFERIDO]**.

### Debilidades conocidas
- **Soporte irregular** — es el dolor #1 en reviews (ComparaSoftware 1,5/5, mar-2024: *"llevo 3 días
  perdiendo mesas… atención al cliente pésima"*). **[VERIFICADO]**
- Vidriera pobre de cara al cliente (sin fotos, subdominio ajeno, errores JS). **[VERIFICADO]**
- Diseñado para gastronomía, no para carne. **[VERIFICADO/INFERIDO]**

---

## 2. Tabla de brecha — módulo por módulo

Estado de **nuestro `/admin`** (repo `estetica-erp`) frente a Bistrosoft. Leyenda: ✅ existe y opera ·
🟡 existe pero gateado/parcial · 🔧 **construido en este sprint** · 🔒 falta, requiere schema (Gate 2) · ➖ no lo tenemos.

| Capacidad | Bistrosoft | Nuestro `/admin` | Veredicto |
|---|---|---|---|
| POS / caja + arqueo | ✅ | ✅ `/admin/caja` (apertura, movimientos, arqueo, cierre) | **paridad** |
| Pedidos (mostrador/online/delivery) | ✅ | ✅ `/admin/pedidos` (canal + fulfillment PICKUP/DELIVERY) | **paridad** |
| **Venta por peso (kg, precio/kg)** | ✅ nativo | ✅ modelo (`saleUnit`/`pricePerKg`) + 🔧 **UI de cortes** | **paridad** |
| Catálogo por rubro cárnico | 🟡 categorías planas | 🔧 **góndolas Vaca/Cerdo/Pollo/Achuras/Preparados/Gourmet** | **superamos** |
| **Margen por corte** | ➖ (no expone margen) | 🔧 **margen vs último costo, con semáforo** | **superamos** |
| Stock / inventario valuado | ✅ | 🟡 `/admin/inventario` (valuación a último costo; hoy gateado por flag) | paridad (falta encender) |
| Compras / proveedores | ➖ no evidenciado | ✅ `/admin/compras` (compra a proveedor + costo + suma stock) | **superamos** |
| Cuenta corriente / fiado clientes | ➖ no evidenciado | ✅ `/admin/cuentas-a-cobrar` (saldo, vencimiento, cobros parciales) | **superamos** |
| Cuentas a pagar (proveedores, cheque diferido) | ➖ no evidenciado | ✅ `/admin/cuentas-a-pagar` | **superamos** |
| Devoluciones a proveedor | ➖ | ✅ `/admin/devoluciones-proveedor` | **superamos** |
| Facturación AFIP/ARCA | ✅ real | 🟡 `/admin/facturacion` (adapter ARCA, hoy **sandbox** — falta cert + homologación) | paridad al encender |
| Mercado Pago | ✅ | 🟡 módulo presente (sandbox por defecto) | paridad al encender |
| Libro IVA / exportar al contador | 🟡 (vía facturación) | ✅ `/admin/libros` | **superamos** |
| Carta / lista de precios pública | ✅ (genérica, subdominio) | ✅ vidriera **branded por tenant** (dominio propio, fotos, WhatsApp) | **superamos** |
| **Multi-canal de precios** (mostrador/delivery/web) | ✅ | ➖ un solo precio por producto | 🔒 **brecha en contra** |
| Reportes en tiempo real | ✅ | ✅ `/admin/reportes` | paridad |
| Reseñas | 🟡 | ✅ `/admin/resenas` | paridad+ |
| **Lotes / trazabilidad envasado al vacío** | ➖ (cero campos lote/venc.) | 🔒 falta (spec + migración Gate 2) | empate hoy — **potencial diferencial** |
| **Mermas / rendimiento de despiece** | ➖ (solo merma genérica) | 🔒 falta (spec + migración Gate 2) | empate hoy — **potencial diferencial** |
| Multi-local | ✅ (Premium) | 🔒 no aún (multi-sucursal = ADR aparte) | brecha en contra (no aplica a MAGRA hoy) |
| Soporte | 🟡 irregular (dolor #1) | ✅ soporte GSG en voz humana/criolla | **superamos** |

---

## 3. Dónde ganamos (el argumento de venta)

1. **Rubro cárnico de verdad.** Bistrosoft trata la carne como un "producto pesable" gastronómico.
   Nosotros mostramos el catálogo como lo que es: **góndolas por animal** (vaca/cerdo/pollo/achuras/
   preparados/gourmet), con **precio por kilo** y **margen por corte** — *donde se gana o se pierde la plata
   en este rubro*. (Ver §4, ya construido y renderizado.)
2. **Backoffice financiero que Bistrosoft no evidencia:** **compras a proveedores** (los reales: Estancia
   Don Ramón, Paladini…), **cuenta corriente de clientes** (fiado con vencimiento y cobros parciales),
   **cuentas a pagar** con cheque diferido, **devoluciones**, **libro IVA** para el contador.
3. **Vidriera con marca propia** — dominio MAGRA, identidad, fotos, WhatsApp-first — vs. la carta genérica
   sin fotos en subdominio `borders.bistrosoft.com`.
4. **Soporte humano** — el punto de dolor #1 en las reviews de Bistrosoft.
5. **Diferencial futuro y defendible:** **lotes/trazabilidad de envasado al vacío** y **mermas/rendimiento
   de despiece** — que Bistrosoft **no tiene** y una carnicería boutique necesita (§5 + la spec).

## 4. Dónde estamos en paridad (hay que igualar, no alcanza con prometer)

POS, pedidos, venta por kg, stock valuado, facturación AFIP/ARCA (al encender cert real), Mercado Pago,
reportes. **Nada de esto es diferencial** — es lo mínimo para reemplazar sin que el negocio pierda nada.

## 5. Dónde Bistrosoft nos gana hoy (honestidad)

1. **Multi-canal de precios** (mostrador / delivery / weborders con precio distinto): Bistrosoft lo tiene
   nativo; nosotros manejamos **un solo precio por producto**. Para MAGRA hoy los tres canales cuestan
   igual, así que **no es bloqueante**, pero es una capacidad a cerrar.
2. **ARCA/MP en producción real:** Bistrosoft ya factura en real; nosotros estamos en **sandbox** hasta el
   certificado + homologación (Gate 4, acción del dueño).
3. **Multi-local / centro de producción:** no aplica a MAGRA (un local), pero Bistrosoft lo ofrece.
4. **Integración física con balanza/etiquetadora:** Bistrosoft plausiblemente la tiene; nosotros no la
   verificamos ni construimos (peso se carga a mano o por peso variable por paquete — ver spec).

---

## 6. Veredicto — ver `veredicto-reemplazo.md`

Resumen de una línea: **para operar el día a día de MAGRA, nuestro backoffice ya iguala a Bistrosoft en lo
esencial y lo supera en catálogo cárnico, margen y finanzas; lo que falta para el reemplazo total (lotes/
trazabilidad, mermas de despiece, ARCA real, multi-canal) está especificado y acotado.** El detalle
cuantificado, en `veredicto-reemplazo.md`.

— Elaborado por GSG

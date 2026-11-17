# MIA Producciones — requerimientos del arco Finanzas y Control (insumo de la reingeniería)

Fuente: planilla de relevamiento que contestó la administración de MIA (11/11/2026, Drive del dueño) y el OK del cliente.
Sin datos personales ni montos: los datos reales viven en Drive y se cargan en una rama de prueba de Neon, nunca en Git.

## Perfil fiscal
- Responsable Inscripto en IVA. IIBB en Convenio Multilateral (CABA y Buenos Aires).
- Retenciones de IVA y Ganancias, sufridas y practicadas.
- Factura en el sitio oficial de ARCA (hoy no usa sistema). Proveedores: mayoría factura A.
- Estudio contable externo: hace retenciones, agenda de pagos, balance y VEP. Necesita salidas (archivos) y calendario de obligaciones.

## Operación
- Productora de eventos: cada proyecto se cotiza (plantilla de cotización), se cobra 70 % anticipo / 30 % saldo; una factura por cobro. Los adicionales son un proyecto aparte.
- Medios de cobro y pago: transferencia, Echeq; Payway (no lo usan). Monedas ARS y USD.
- Banco: ICBC en ARS y en USD; quieren Mercado Pago empresa.
- Comisiones por proyecto: se liquidan con el proyecto cobrado entero y el evento hecho. Reintegros contra ticket o factura.
- Estado «Finalizado» = cobrado y evento terminado.
- Cierre de mes: lo hace una persona (a confirmar quién y cómo).
- Hoy controlan en planillas por productor (la solapa «General» tiene errores) y un panel de control de proyectos. Pagos a proveedores no cargados. Datos hasta octubre.
- No hay padrón de clientes ni de proveedores: se arman desde las planillas y la agenda del banco.
- Es más grande de lo que pensábamos: el diseño tiene que escalar (muchos proyectos, productores y proveedores).

## Pendiente de confirmar con el cliente (provisional a confirmar)
7 respuestas en amarillo de la planilla, nombres y roles de usuarios, regla 70/30 en todos los casos, quién cierra el mes.

## Lo que ya existe en el ERP (punto de partida)
- `src/lib/contabilidad/` (plan de cuentas modelo, asientos, vencimientos 2026, roles) y modelos `CuentaContable`, `Asiento`, `AsientoLinea`, `ObligacionFiscal` en `prisma/schema.prisma:4385-4505`.
- Cobranza de proyectos MIA: `src/lib/proyectos/cobranza-core.ts`; bancos: `src/lib/bancos-glue.ts`; fiscal: `src/lib/fiscal/`.
- Método de scope items: `docs/estrategia/mapa-cobertura-scope-items.md`, ADR-058 (GROW-AR, un ScopeItem con perfiles lite/enterprise).

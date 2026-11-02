# Especificación funcional — apps de gestión de eventos para MIA, relevadas de Heka

Relevado el 01/11/2026 por pantallas en `heka.mapplyia.com` («Demo funcional · datos ficticios»). Es la fuente para construir.

Regla: **mismas apps, mismos flujos y mismos datos a la vista; código y textos nuestros; marca GSG**. No se copia código, logo, nombre ni textos de Heka. MIA opera sólo en Argentina: sin oficinas, sin países, sin portugués. Moneda: pesos y dólares (provisional).

## Navegación lateral

Inicio · Proyectos · Diseño · Calendario · Proveedores · Administración · Dirección · Agentes IA · Propuesta con IA · Mi liquidación · Equipo y permisos. Arriba: buscador global, campana de avisos, engranaje a Configuración. Abajo: persona, rol, salir.

## Inicio

Cabecera oscura con fecha, saludo, y tres números: proyectos activos, eventos en 30 días, tareas abiertas. Accesos: Nuevo lead, Propuesta con IA, Agentes IA, Cashflow, Dashboard. Abajo:
- **Agenda de 14 días**: líneas con HOY/MAÑANA/EN n DÍAS + fecha; tipo (Deadline de ítem, Confirmar checklist, Pago con monto, Cobro con monto, Tarea) y evento.
- **Mis tareas** (o «sin tareas asignadas»), con enlace a Tablero.
- **Mis proyectos**: código, nombre, cliente · ciudad, etapa, fecha.

Dirección ve la foto completa; cada rol ve lo suyo.

## Proyectos (pipeline)

Vistas **Kanban** y **Lista**. Botón Nuevo lead. Filtro por nombre o cliente. Totales: leads abiertos, pipeline en plata.

Columnas con contador: Lead/brief, Desglose, Propuesta creativa, Cotización, Enviado al cliente, Confirmado, Desarrollo técnico, Producción y seguimiento, Evento, Cierre, Perdido. Las tarjetas **se arrastran** entre columnas.

Tarjeta: código (`AAAA-NNN`), ciudad, nombre, cliente · tipo de evento, iniciales del equipo, venta, fecha.

Formulario Nuevo lead: nombre del evento, cliente (lista), tipo de evento, ciudad, fecha inicio, fecha fin, invitados, moneda de venta, presupuesto estimado, brief.

Tipos de evento: Convención, Congreso, Stand/Feria, Lanzamiento, Activación de marca, Gala/Fiesta, Incentivo, Roadshow.

## Ficha del proyecto

Encabezado: código, ciudad, tipo, etapa, nombre, cliente · lugar · fechas, iniciales del equipo, botón Carpeta (link), botón WhatsApp, y Venta / Costo / Margen. Línea de pasos con los 10 estados. Pestañas: Resumen, Ficha del evento, Cotización, Diseño, Finanzas, Seguimiento, Chat, Archivos, Historial.

**Resumen**: brief con Editar datos; lugar, invitados, moneda, responsable, anticipo del cliente %, presupuesto estimado, creado. Estado financiero: cobrado, a cobrar, pagado a proveedores, a pagar, avance de cobro %. Bloque «una carga, muchas salidas». Equipo del evento con Asignar: persona, función, plus por evento. Regla: cada persona ve sólo sus proyectos, salvo Dirección y Administración. Portal del cliente: contacto y acceso.

**Ficha del evento** (el corazón): tabla editable en línea, agrupada por rubro con subtotal de venta. Arriba: ítems, venta total, costo total, margen. Agregar ítem. Columnas: descripción, proveedor (lista), cantidad, costo unitario, moneda, recargo %, costo en moneda del evento, precio de venta, margen, fecha límite, estado (pendiente, cotizando, aprobado, contratado, entregado), visible al cliente, adjuntos del ítem, borrar. Rubros: Audio/video/iluminación, Catering, Escenografía y stands, Impresión y señalética, Logística y transporte, Mobiliario, Pantallas LED, Personal y staff, Producción general, Alojamiento, Artísticos, Tecnología, Venue.

**Regla central**: guardar la ficha regenera solos los pagos a proveedores (anticipo y saldo según el % de anticipo de cada proveedor), los cobros al cliente (anticipo y saldo según su %), y los deadlines. Lo generado lleva marca «auto». Lo ya pagado no se regenera.

**Cotización**: lista de versiones; cada una es una foto: número, estado (enviada, cliente aprobó, cliente pidió cambios), total, fecha, quién, margen, quién aprobó, nota, respuesta del cliente. Acciones: Nueva versión, Ver, **Qué cambió** (total anterior, nuevo, diferencia y por ítem: modificado/agregado/quitado con precio tachado y nuevo), PDF, Excel. Dirección aprueba precios antes de enviar. Debajo, planilla de venta en vivo: rubro con subtotal, ítem, cantidad, importe; sin costos.

**Diseño** con subpestañas:
- Tareas del proyecto.
- Versiones y devoluciones: subir versión; grilla con nombre, autor, fecha, cantidad de comentarios, estado. Abrir: imagen grande, **clic sobre la imagen deja un comentario numerado en ese punto**, lista lateral con autor, fecha, texto y «resuelto», comentario general, Aprobar, Pedir cambios.
- Ficha de la idea: concepto, narrativa, referencias, materialidades, información importante, proponer con IA, imágenes elegidas, moodboards vinculados.
- Estudio IA: pedido en texto, botones de variante, generar, elegir para la ficha, aviso de que no reemplaza el trabajo técnico.
- Presentaciones: generar con plantilla (3 opciones), lista con cantidad de láminas, estado, abrir, respuesta del cliente.

**Finanzas**: venta y costo presupuestados, saldo final, **máximo a financiar**. Cashflow del evento con filtros Todos/Cobros/Pagos/Pendientes y Movimiento manual. Columnas: fecha, concepto, contraparte, original, importe en moneda del evento, **saldo acumulado**, estado, Marcar cobrado/pagado.

**Seguimiento**: checklist hasta el evento (`n/m listos`; texto, categoría, fecha, Agregar). Se precarga con plantilla: contrato firmado, anticipo recibido, seguro, acreditaciones, plan de montaje aprobado, confirmación de proveedores, briefing en sitio. Conteo de ítems por estado. Pagos del cliente.

**Chat**: canales todo, general, logística, creatividad, pagos; mensajes con autor y hora; menciones con `@`.

**Archivos**: abrir carpeta, subir; filtro por tipo (otro, presupuesto, presentación, render, plano, contrato); tabla: archivo, tipo, vinculado a ítem, origen, quién, fecha, tamaño.

**Historial**: quién cambió qué, de qué valor a cuál y cuándo, sobre todo costos, precios y pagos.

## Diseño (general)

Pestañas: Tablero, Carga de trabajo, Chat de Diseño. Filtros: Todo el equipo / Solo mis tareas / por persona; por proyecto; solo Diseño. Columnas: Por hacer, En curso, Revisión, Aprobada, con contador. Tarjeta: proyecto, título, iniciales, nombre, vencimiento con ⚠ si pasó. Carga: barra por persona, proyectos, tareas, esta semana, vencidas, nivel Alta/Media/Baja. Chat del equipo con adjuntos.

## Calendario

Mes en grilla lunes a domingo, con Hoy, anterior y siguiente, «Solo lo mío». Colores por tipo: Reunión, Deadline de ítem, Pago a proveedor, Cobro al cliente, Evento, Montaje/desmontaje, Tarea, Confirmación, Evento tentativo. «+n más» si no entra. Botones: Suscribirme (iCal), Nueva reunión (título, fecha y hora, tipo, proyecto, lugar o link).

## Proveedores

Filtro por rubro. Contador. Tarjetas: iniciales, nombre, rubro, ciudad, puntaje con estrella, cantidad de eventos, condiciones, contacto. Nuevo: nombre, rubro, ciudad, contacto, mail, teléfono, condiciones, % anticipo, evaluación 1–5. Detalle: todo eso + moneda habitual, notas, **historial de eventos y precios anteriores** (evento, fecha, ítem, cantidad, precio unitario, estado).

## Administración

Arriba: A cobrar (y en 7 días), Cobros vencidos (cantidad), A pagar (y en 7 días), Pagos vencidos. Pestañas:
- **Cuentas a cobrar / a pagar**: filtros Pendientes, Vencidos, Pagados, Todos; buscador. Columnas: vence («hace n días»), evento (o «Empresa»), cliente o proveedor, concepto con marca auto, monto, referencia, factura, estado, Cobrado/Pagar, comentario. Filas vencidas en rojo.
- **Cashflow de empresa**: caja hoy por cuenta, saldo proyectado a 6 meses, necesidad de financiamiento, pipeline ponderado (enviadas al 40 %, no suma al saldo). Gráficos: ingresos contra egresos por mes y saldo proyectado. Tabla por mes: cobros, proveedores, sueldos, gastos fijos, impuestos, neto, saldo.
- **Bancos y conciliación**: tarjetas por cuenta con saldo y sin conciliar. Importar extracto CSV. Tabla: fecha, descripción, importe, conciliado con (propone la cuota por importe), lote.
- **Monedas y gastos fijos**: tipo de cambio editable. Gastos fijos e impuestos: tipo, nombre, frecuencia, monto; alta y baja.
- **Liquidaciones**: elegir mes, Generar/recalcular, Publicar borradores. Tabla: persona, factura a, base, extras por evento, total, estado, visto, Editar, PDF.

## Dirección

Pestañas:
- **Dashboard**: caja hoy, facturación del año, margen acumulado con %, eventos activos, pipeline abierto. Alertas: cobro vencido, caja proyectada negativa, margen real bajo lo presupuestado. Gráfico de venta confirmada por mes. Próximos eventos. Saldo de caja proyectado.
- **Reportes por evento**: etapa, venta, margen presupuestado, margen real, desvío en puntos, cobros %, vencido, Ver desvíos (ítem, proveedor, presupuestado, real, desvío con %).
- **Reportes comerciales**: tasa de conversión, embudo, facturación por cliente y por tipo de evento, motivos de pérdida.
- **Carga del equipo**: «¿se puede tomar un evento más?», tabla por persona.

## Agentes IA

Cinco agentes: Creativo, Diseñador, Productor, Administrador, Asistente. Cada uno ve sólo lo que permite el rol, y los bloqueados se marcan. Prepara y sugiere: enviar, pagar o cambiar un precio lo aprueba una persona. Elegir proyecto o contexto general, Nueva charla, sugerencias de arranque.

## Propuesta con IA

Tres pasos: concepto, imágenes, presentación. Elige proyecto (en etapas previas a confirmar) y pedido especial.

## Mi liquidación

Sólo la ve la persona y Administración. Períodos a la izquierda con total. Detalle: persona, puesto, total, sueldo base, extras por evento, factura a, Descargar PDF, fecha de publicación. Abrirla marca «visto».

## Equipo y permisos

Pestañas: Personas (nombre, mail, puesto, rol, sueldo, factura a, Editar; Nueva persona: nombre, mail, rol, puesto, sueldo, factura a), Permisos por rol, Registro de cambios (cuándo, quién, qué, antes, después), Seguridad.

Roles: Dirección, Producción, Diseño, Administración, Cliente. Dirección ve todo. Matriz ver/editar por rol y módulo: pipeline, ficha, costos y márgenes, proveedores, cotizaciones, diseño, pagos y cobros del evento, cuentas y cashflow de empresa, liquidaciones, dashboard de Dirección, equipo y permisos, IA. Columnas ocultas en la ficha por rol: costo unitario, costo total, recargo, margen.

## Configuración

Avisos por persona, en el sistema y por mail: me mencionan, me asignan tarea, deadlines próximos, aprobaciones, pagos a proveedores, cobros recibidos, mi liquidación publicada, cambios de estado de mis proyectos. Calendario: dirección de suscripción. Seguridad.

## Buscador y avisos

Buscador global: proyectos, proveedores, archivos, mensajes (ruta propia). Campana con contador, marcar leídos.

## Papeles

Planilla de venta imprimible sin costos (`imprimir/venta/:id`), recibo de liquidación imprimible, presentación a pantalla completa, portal del cliente: propuesta, presentación aprobada, cambios, aprobar o pedir cambios.

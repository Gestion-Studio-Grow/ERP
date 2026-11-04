# Plan — Link para publicar un servicio en redes (04/11/2026, Fable)

**Pedido del dueño:** compartir en Instagram/WhatsApp un link que lleve derecho a reservar *ese* servicio con *ese* profesional. Sin migración (Gate 2).

1. **Forma.** `/reserva?servicio=<slug>&profesional=<slug>` (cualquiera puede faltar). `slugDe`: NFD sin acentos → minúsculas → lo que no es `[a-z0-9]` pasa a `-` → sin guiones dobles ni en las puntas. Choque dentro del negocio: cada uno de los que chocan lleva `-` + 4 últimos caracteres del id (`limpieza-facial-k3f9`). Determinista: se calcula sobre la lista completa del negocio. El id crudo también resuelve (respaldo si renombran).
2. **Tres casos** (`BookingForm` recibe `preeleccion` del server). Lo preelegido se oculta y queda en el resumen con «Cambiar».
   - Sólo servicio → el paso 1 lista sólo quienes lo hacen; si es uno, queda elegido.
   - Sólo profesional → paso 1 oculto; el paso 2 lista sus servicios.
   - Los dos → arranca en la fecha.
3. **Nunca error; formulario normal + aviso** (`role="status"`):
   - Servicio inactivo o inexistente: «Ese servicio ya no está disponible. Elegí otro de la lista.»
   - Profesional inactivo o inexistente: «Esa persona ya no atiende por acá. Elegí con quién reservar.»
   - No hace ese servicio: se conserva el servicio, se suelta el profesional: «[Nombre] no hace [servicio]. Te mostramos quiénes sí.»
   - Los dos inválidos: sólo el aviso del servicio.
4. **Medición sin migración.** `utm_source` / `utm_medium` (`bio`, `post`, `whatsapp`) / `utm_campaign`. Viajan como campos ocultos; `createAppointment` antepone a `notes` una marca saneada `[via:instagram/bio/limpieza-facial]` (≤ 80 caracteres, sólo `[a-z0-9/-]`). Elegida sobre el registro de auditoría porque viaja con el turno y se ve en el backoffice; el backoffice la muestra como chip, no como texto. Conteo: reservas con `notes` que empieza con `[via:` de los últimos 30 días, agrupadas por origen.
5. **Open Graph.** `generateMetadata({ searchParams })` resuelve con la misma lista: «Limpieza facial con Ana — Negocio» (sólo servicio: «Limpieza facial — Negocio»; sólo profesional: «Reservá con Ana — Negocio»). Descripción «45 min · $ 18.000 · Reservás online en un minuto.». Imagen: ruta `src/app/(site)/reserva/og/route.tsx` con `ImageResponse` de `next/og` que lee los mismos parámetros (el archivo `opengraph-image.tsx` no recibe searchParams). Sin binarios en el repo.
6. **Backoffice (catálogo).** «Compartir» por servicio y por profesional → panel: copiar link, WhatsApp con mensaje armado (`utm_medium=whatsapp`), link para la bio de Instagram (`utm_medium=bio`), vista previa con título y descripción OG. Grilla profesional × servicio (sólo las combinaciones que existen) con el mismo panel. Tarjeta «Reservas desde redes (30 días)».
7. **Aislamiento.** `resolverPreeleccion(lista, query)` es pura sobre la lista que ya devuelve `getProfessionalsWithServices()` (prisma con scope de negocio); nunca toca la base. Tests con dos negocios: un slug de otro negocio no resuelve.
8. **Partición.** Contrato `src/lib/link-reserva.ts` (orquestador) → Tarea A: público (reserva, OG, utm, `createAppointment`). Tarea B: backoffice (Compartir, grilla, conteo). Ninguna toca schema ni migraciones.

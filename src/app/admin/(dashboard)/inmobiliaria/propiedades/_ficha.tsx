// El formulario de una ficha, para el alta y para la edición. De servidor: los campos son HTML
// de siempre con su valor inicial; lo único de cliente es el envoltorio que muestra el error.

import { Field, Input, Select, Textarea, cn } from "@/components/ui";
import { guardarPropiedad } from "@/lib/inmobiliaria/acciones";
import { TIPO_LABEL, TIPOS } from "@/lib/inmobiliaria/core";
import type { PropiedadAdmin } from "@/lib/inmobiliaria/datos.server";
import { RAIZ, subtitulo, tarjeta } from "../_vista";
import { BotonEnviar, FormAccion } from "../_piezas";

const tilde = "flex min-h-11 items-center gap-2 text-sm font-medium text-strong";
const caja = "size-5";
const num = (v: number | null | undefined): string => (v == null ? "" : String(v));
const plata = (v: number | null | undefined): string => (v ? v.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "");

export function Ficha({ p, personas }: { p?: PropiedadAdmin; personas: { id: string; nombre: string; telefono: string }[] }) {
  return (
    <FormAccion accion={guardarPropiedad} irA={p ? undefined : `${RAIZ}/propiedades/{id}`} mensajeOk="Guardado." className="grid grid-cols-1 gap-4">
      {p && <input type="hidden" name="id" value={p.id} />}

      <section className={cn(tarjeta, "grid grid-cols-1 gap-3")} aria-label="Qué es">
        <h2 className={subtitulo}>Qué es</h2>
        <Field label="Tipo" htmlFor="tipo" required>
          <Select id="tipo" name="tipo" defaultValue={p?.tipo ?? "DEPARTAMENTO"} required>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Título" htmlFor="titulo" hint="Qué es y qué la distingue, en letra normal. Si lo dejás vacío lo armamos con el tipo, los ambientes y la zona.">
          <Input id="titulo" name="titulo" defaultValue={p?.titulo ?? ""} maxLength={140} placeholder="Departamento de 3 ambientes al frente con balcón" />
        </Field>
        <Field label="Descripción" htmlFor="descripcion" hint="Los ambientes, el estado, qué hay cerca y qué se pide para alquilar. Con 200 caracteres o más recibe más consultas.">
          <Textarea id="descripcion" name="descripcion" defaultValue={p?.descripcion ?? ""} rows={6} maxLength={6000} />
        </Field>
      </section>

      <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-2")} aria-label="Operación y precio">
        <h2 className={cn(subtitulo, "sm:col-span-2")}>Operación y precio</h2>
        <fieldset className="grid grid-cols-1 gap-2">
          <legend className="sr-only">Venta</legend>
          <label className={tilde}>
            <input type="checkbox" name="enVenta" defaultChecked={p?.enVenta ?? false} className={caja} /> Se vende
          </label>
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Select name="monedaVenta" defaultValue={p?.monedaVenta ?? "USD"} aria-label="Moneda de venta">
              <option value="USD">USD</option>
              <option value="ARS">$</option>
            </Select>
            <Input name="precioVenta" importe inputMode="decimal" defaultValue={plata(p?.precioVenta)} placeholder="Precio de venta" aria-label="Precio de venta" />
          </div>
        </fieldset>
        <fieldset className="grid grid-cols-1 gap-2">
          <legend className="sr-only">Alquiler</legend>
          <label className={tilde}>
            <input type="checkbox" name="enAlquiler" defaultChecked={p?.enAlquiler ?? false} className={caja} /> Se alquila
          </label>
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Select name="monedaAlquiler" defaultValue={p?.monedaAlquiler ?? "ARS"} aria-label="Moneda del alquiler">
              <option value="ARS">$</option>
              <option value="USD">USD</option>
            </Select>
            <Input name="precioAlquiler" importe inputMode="decimal" defaultValue={plata(p?.precioAlquiler)} placeholder="Alquiler por mes" aria-label="Alquiler por mes" />
          </div>
        </fieldset>
        <Field label="Expensas ($ por mes)" htmlFor="expensas">
          <Input id="expensas" name="expensas" importe inputMode="decimal" defaultValue={plata(p?.expensas)} />
        </Field>
        <div className="grid grid-cols-1 content-end">
          <label className={tilde}>
            <input type="checkbox" name="aptoCredito" defaultChecked={p?.aptoCredito ?? false} className={caja} /> Apto crédito
          </label>
          <label className={tilde}>
            <input type="checkbox" name="aptoMascotas" defaultChecked={p?.aptoMascotas ?? false} className={caja} /> Se aceptan mascotas
          </label>
        </div>
      </section>

      <section className={cn(tarjeta, "grid grid-cols-1 gap-3 sm:grid-cols-2")} aria-label="Dónde queda">
        <h2 className={cn(subtitulo, "sm:col-span-2")}>Dónde queda</h2>
        <Field label="Dirección" htmlFor="direccion" className="sm:col-span-2">
          <Input id="direccion" name="direccion" defaultValue={p?.direccion ?? ""} maxLength={120} placeholder="Calle y número, piso y depto" />
        </Field>
        <label className={cn(tilde, "sm:col-span-2")}>
          <input type="checkbox" name="mostrarDireccion" defaultChecked={p?.mostrarDireccion ?? true} className={caja} /> Mostrar la dirección y el punto exacto en el sitio (si no, sólo barrio y localidad)
        </label>
        <Field label="Barrio" htmlFor="barrio">
          <Input id="barrio" name="barrio" defaultValue={p?.barrio ?? ""} maxLength={60} />
        </Field>
        <Field label="Localidad" htmlFor="localidad" required>
          <Input id="localidad" name="localidad" defaultValue={p?.localidad ?? ""} maxLength={60} required />
        </Field>
        <Field label="Partido" htmlFor="partido">
          <Input id="partido" name="partido" defaultValue={p?.partido ?? ""} maxLength={60} />
        </Field>
        <Field label="Provincia" htmlFor="provincia">
          <Input id="provincia" name="provincia" defaultValue={p?.provincia ?? "Buenos Aires"} maxLength={60} />
        </Field>
        <Field label="Latitud" htmlFor="lat" hint="Para el mapa. En Google Maps: botón derecho sobre el lugar y copiá los dos números.">
          <Input id="lat" name="lat" inputMode="decimal" defaultValue={num(p?.lat)} placeholder="-34.8145" />
        </Field>
        <Field label="Longitud" htmlFor="lng">
          <Input id="lng" name="lng" inputMode="decimal" defaultValue={num(p?.lng)} placeholder="-58.4682" />
        </Field>
      </section>

      <section className={cn(tarjeta, "grid grid-cols-2 gap-3 sm:grid-cols-4")} aria-label="Cómo es">
        <h2 className={cn(subtitulo, "col-span-2 sm:col-span-4")}>Cómo es</h2>
        <Field label="Ambientes" htmlFor="ambientes">
          <Input id="ambientes" name="ambientes" inputMode="numeric" defaultValue={num(p?.ambientes)} />
        </Field>
        <Field label="Dormitorios" htmlFor="dormitorios">
          <Input id="dormitorios" name="dormitorios" inputMode="numeric" defaultValue={num(p?.dormitorios)} />
        </Field>
        <Field label="Baños" htmlFor="banos">
          <Input id="banos" name="banos" inputMode="numeric" defaultValue={num(p?.banos)} />
        </Field>
        <Field label="Cocheras" htmlFor="cocheras">
          <Input id="cocheras" name="cocheras" inputMode="numeric" defaultValue={num(p?.cocheras)} />
        </Field>
        <Field label="m² cubiertos" htmlFor="supCubierta">
          <Input id="supCubierta" name="supCubierta" inputMode="decimal" defaultValue={num(p?.supCubierta)} />
        </Field>
        <Field label="m² totales" htmlFor="supTotal">
          <Input id="supTotal" name="supTotal" inputMode="decimal" defaultValue={num(p?.supTotal)} />
        </Field>
        <Field label="Antigüedad (años)" htmlFor="antiguedad" hint="0 = a estrenar">
          <Input id="antiguedad" name="antiguedad" inputMode="numeric" defaultValue={num(p?.antiguedad)} />
        </Field>
        <Field label="Comodidades" htmlFor="comodidades" hint="Separadas por coma: Balcón, Parrilla, Pileta…" className="col-span-2 sm:col-span-4">
          <Input id="comodidades" name="comodidades" defaultValue={p?.comodidades.join(", ") ?? ""} />
        </Field>
        <Field label="Video (link)" htmlFor="videoUrl" className="col-span-2 sm:col-span-4">
          <Input id="videoUrl" name="videoUrl" type="url" defaultValue={p?.videoUrl ?? ""} placeholder="https://…" />
        </Field>
      </section>

      <section className={cn(tarjeta, "grid grid-cols-1 gap-3")} aria-label="Puertas adentro">
        <h2 className={subtitulo}>Puertas adentro (no sale en el sitio)</h2>
        <Field label="Propietario" htmlFor="propietarioId" hint="Se elige entre los clientes del negocio. Si no está, cargalo primero en Clientes.">
          <Select id="propietarioId" name="propietarioId" defaultValue={p?.propietario?.id ?? ""}>
            <option value="">Sin asignar</option>
            {personas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {c.telefono}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notas internas" htmlFor="notasInternas">
          <Textarea id="notasInternas" name="notasInternas" defaultValue={p?.notasInternas ?? ""} rows={3} maxLength={2000} placeholder="Llaves, horarios de visita, condiciones del dueño…" />
        </Field>
      </section>

      <BotonEnviar pendingText="Guardando…" className="h-14 w-full justify-center text-lg sm:w-auto sm:justify-self-start">
        {p ? "Guardar cambios" : "Guardar y seguir con las fotos"}
      </BotonEnviar>
    </FormAccion>
  );
}

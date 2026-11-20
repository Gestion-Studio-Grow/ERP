"use client";

// CRM COMERCIAL · cargar una consulta que entró o un prospecto (GSG-CRM-011). Una persona carga consultas;
// un puesto del equipo sólo propone prospectos (el servidor rechaza lo demás). Si la marca × evento ya tiene
// una oportunidad abierta, el servidor la une a esa y se va a su ficha.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { crearContacto, proponerOportunidad } from "@/lib/crm-comercial/acciones";
import { Resultado, ROTULO } from "../Avisos";
import { useAccion } from "../useAccion";

export function FormularioNueva({ puedeConsulta, puedeContacto, eventos, manana }: { puedeConsulta: boolean; puedeContacto: boolean; eventos: readonly { id: string; etiqueta: string }[]; manana: string }) {
  const router = useRouter();
  const { correr, pendiente, motivo } = useAccion();
  const [f, setF] = useState({
    tipo: puedeConsulta ? "CONSULTA" : "PROSPECTO",
    marca: "",
    web: "",
    cuit: "",
    eventoId: "",
    consultaTexto: "",
    proximoPaso: puedeConsulta ? "Responder la consulta" : "Verificar la fuente",
    proximoPasoEl: manana,
    fechaLimite: "",
    cNombre: "",
    cEmail: "",
    cTelefono: "",
    cCargo: "",
    cPapel: "PIDE",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const consulta = f.tipo === "CONSULTA";
  const conContacto = consulta && puedeContacto && (f.cNombre.trim() || f.cEmail.trim() || f.cTelefono.trim());

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    correr(
      () =>
        proponerOportunidad({
          tipo: f.tipo,
          marca: f.marca.trim() ? { nombre: f.marca.trim(), web: f.web.trim() || null, cuit: f.cuit.trim() || null } : null,
          eventoId: f.eventoId || null,
          consultaTexto: consulta ? f.consultaTexto : null,
          proximoPaso: f.proximoPaso,
          proximoPasoEl: f.proximoPasoEl,
          fechaLimite: f.fechaLimite || null,
        }),
      {
        alTerminar: async (r) => {
          if (conContacto) {
            const c = await crearContacto({ oportunidadId: r.id, nombre: f.cNombre, email: f.cEmail || null, telefono: f.cTelefono || null, cargo: f.cCargo || null, papel: f.cPapel || null, deConsultaEntrante: true });
            if (!c.ok) {
              // La oportunidad ya quedó: se avisa y se sigue en su ficha, donde se carga el contacto.
              window.alert(`La oportunidad quedó cargada, pero el contacto no: ${c.motivo} Cargalo desde la ficha.`);
            }
          }
          if (r.aviso) window.alert(r.aviso);
          router.push(`/admin/crm/${r.id}`);
        },
      },
    );
  }

  return (
    <form onSubmit={enviar} className="grid gap-5 rounded-lg border border-line bg-surface p-4">
      {puedeConsulta && (
        <fieldset>
          <legend className={ROTULO}>Qué cargás</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="radio" name="tipo" value="CONSULTA" checked={consulta} onChange={set("tipo")} /> Una consulta que entró
            </label>
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="radio" name="tipo" value="PROSPECTO" checked={!consulta} onChange={set("tipo")} /> Un prospecto (una marca para salir a buscar)
            </label>
          </div>
        </fieldset>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className={`${ROTULO} sm:col-span-3`}>La marca {consulta && <span className="font-normal text-muted">(si se sabe)</span>}</legend>
        <div>
          <label htmlFor="n-marca" className={ROTULO}>Nombre</label>
          <Input id="n-marca" value={f.marca} onChange={set("marca")} required={!consulta} maxLength={200} />
        </div>
        <div>
          <label htmlFor="n-web" className={ROTULO}>Web o dominio</label>
          <Input id="n-web" value={f.web} onChange={set("web")} maxLength={300} placeholder="marca.com.ar" />
        </div>
        <div>
          <label htmlFor="n-cuit" className={ROTULO}>CUIT</label>
          <Input id="n-cuit" value={f.cuit} onChange={set("cuit")} inputMode="numeric" maxLength={13} />
        </div>
      </fieldset>

      <div>
        <label htmlFor="n-evento" className={ROTULO}>Evento</label>
        <Select id="n-evento" value={f.eventoId} onChange={set("eventoId")} required={!consulta}>
          <option value="">{consulta ? "Sin evento o no se sabe" : "Elegí el evento"}</option>
          {eventos.map((e) => <option key={e.id} value={e.id}>{e.etiqueta}</option>)}
        </Select>
        {!consulta && eventos.length === 0 && <p className="mt-1 text-sm text-muted">No hay eventos relevados todavía: se cargan en «Eventos y sponsors».</p>}
      </div>

      {consulta && (
        <div>
          <label htmlFor="n-texto" className={ROTULO}>Qué escribió (se guarda como dato, tal cual)</label>
          <Textarea id="n-texto" rows={4} value={f.consultaTexto} onChange={set("consultaTexto")} maxLength={8000} />
        </div>
      )}

      {consulta && puedeContacto && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className={`${ROTULO} sm:col-span-2`}>Quién escribió <span className="font-normal text-muted">(opcional; también se carga después)</span></legend>
          <div>
            <label htmlFor="n-cnom" className={ROTULO}>Nombre</label>
            <Input id="n-cnom" value={f.cNombre} onChange={set("cNombre")} maxLength={200} />
          </div>
          <div>
            <label htmlFor="n-ccargo" className={ROTULO}>Cargo</label>
            <Input id="n-ccargo" value={f.cCargo} onChange={set("cCargo")} maxLength={200} />
          </div>
          <div>
            <label htmlFor="n-cmail" className={ROTULO}>Mail</label>
            <Input id="n-cmail" type="email" value={f.cEmail} onChange={set("cEmail")} />
          </div>
          <div>
            <label htmlFor="n-ctel" className={ROTULO}>Teléfono</label>
            <Input id="n-ctel" type="tel" value={f.cTelefono} onChange={set("cTelefono")} maxLength={40} />
          </div>
          <div>
            <label htmlFor="n-cpapel" className={ROTULO}>Papel</label>
            <Select id="n-cpapel" value={f.cPapel} onChange={set("cPapel")}>
              <option value="PIDE">Pide</option>
              <option value="DECIDE">Decide</option>
              <option value="PAGA">Paga</option>
            </Select>
          </div>
        </fieldset>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className={`${ROTULO} sm:col-span-3`}>Próximo paso <span className="font-normal text-muted">(sin esto no se guarda)</span></legend>
        <div className="sm:col-span-2">
          <label htmlFor="n-paso" className={ROTULO}>Qué hay que hacer</label>
          <Input id="n-paso" value={f.proximoPaso} onChange={set("proximoPaso")} required maxLength={500} />
        </div>
        <div>
          <label htmlFor="n-pasoel" className={ROTULO}>Para cuándo</label>
          <Input id="n-pasoel" type="date" value={f.proximoPasoEl} onChange={set("proximoPasoEl")} required />
        </div>
        <div>
          <label htmlFor="n-limite" className={ROTULO}>Entrega de licitación (si hay)</label>
          <Input id="n-limite" type="date" value={f.fechaLimite} onChange={set("fechaLimite")} />
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : consulta ? "Cargar la consulta" : "Proponer el prospecto"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/crm")}>Cancelar</Button>
      </div>
      <Resultado motivo={motivo} />
    </form>
  );
}

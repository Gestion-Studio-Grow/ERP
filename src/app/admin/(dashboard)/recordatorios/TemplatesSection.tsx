"use client";

import { useState } from "react";
import { upsertMessageTemplate } from "@/lib/reminders-actions";
import SubmitButton from "@/components/SubmitButton";

// Plantillas de mensaje, una tarjeta colapsada por (tipo, canal). El listado
// anterior mostraba los 3 formularios abiertos y un párrafo críptico de
// "variables disponibles" con {{clientName}} crudo que parecía un error de
// render. Acá cada plantilla se abre bajo demanda y las variables se explican
// en humano y se insertan tocándolas.

type Template = {
  type: string;
  channel: string;
  subject: string | null;
  body: string;
  active: boolean;
};

type Slot = {
  type: "APPOINTMENT_REMINDER" | "PROFESSIONAL_NEWS_BROADCAST";
  channel: "EMAIL" | "WHATSAPP";
};

const SLOTS: Slot[] = [
  { type: "APPOINTMENT_REMINDER", channel: "EMAIL" },
  { type: "APPOINTMENT_REMINDER", channel: "WHATSAPP" },
  { type: "PROFESSIONAL_NEWS_BROADCAST", channel: "WHATSAPP" },
];

const TYPE_LABELS: Record<Slot["type"], string> = {
  APPOINTMENT_REMINDER: "Recordatorio de turno",
  PROFESSIONAL_NEWS_BROADCAST: "Difusión de novedad",
};

const TYPE_HELP: Record<Slot["type"], string> = {
  APPOINTMENT_REMINDER:
    "Se envía automáticamente antes de cada turno confirmado, con la anticipación configurada en el servicio.",
  PROFESSIONAL_NEWS_BROADCAST:
    "Se envía a la base de clientes cuando tocás «Difundir» en una novedad.",
};

// Variables que aplican a cada tipo de plantilla, con su explicación en humano.
const TYPE_VARS: Record<Slot["type"], { token: string; label: string }[]> = {
  APPOINTMENT_REMINDER: [
    { token: "{{clientName}}", label: "nombre del cliente" },
    { token: "{{serviceName}}", label: "servicio" },
    { token: "{{professionalName}}", label: "profesional" },
    { token: "{{startsAt}}", label: "fecha y hora del turno" },
  ],
  PROFESSIONAL_NEWS_BROADCAST: [
    { token: "{{professionalName}}", label: "profesional" },
    { token: "{{message}}", label: "texto de la novedad" },
  ],
};

function TemplateCard({ slot, template }: { slot: Slot; template: Template | undefined }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(template?.body ?? "");

  const title = `${TYPE_LABELS[slot.type]} · ${slot.channel === "EMAIL" ? "Email" : "WhatsApp"}`;
  const isActive = template?.active ?? true;

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-neutral-50"
      >
        <span className="text-sm font-medium truncate">{title}</span>
        <span className="flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
              isActive ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {isActive ? "Activa" : "Inactiva"}
          </span>
          <span aria-hidden className={`text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}>
            ›
          </span>
        </span>
      </button>

      {open && (
        <form action={upsertMessageTemplate} className="border-t bg-neutral-50 p-3 space-y-3">
          <input type="hidden" name="type" value={slot.type} />
          <input type="hidden" name="channel" value={slot.channel} />

          <p className="text-xs text-neutral-500">{TYPE_HELP[slot.type]}</p>

          {slot.channel === "EMAIL" && (
            <input
              type="text"
              name="subject"
              defaultValue={template?.subject ?? ""}
              placeholder="Asunto del email"
              className="w-full rounded border px-2 py-1.5 text-sm bg-white"
            />
          )}

          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Texto del mensaje…"
            className="w-full rounded border px-2 py-1.5 text-sm bg-white"
          />

          <div>
            <p className="text-xs text-neutral-500 mb-1.5">
              Tocá para insertar — al enviar se reemplaza por el dato real:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_VARS[slot.type].map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => setBody((b) => (b ? `${b.replace(/\s+$/, "")} ${v.token}` : v.token))}
                  className="rounded-full border bg-white px-2.5 py-1 text-xs text-neutral-700 hover:border-neutral-400"
                >
                  <code className="font-mono">{v.token}</code>
                  <span className="text-neutral-400"> → {v.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              <input type="checkbox" name="active" defaultChecked={isActive} />
              Plantilla activa
            </label>
            <SubmitButton
              pendingText="Guardando…"
              className="text-sm rounded-md bg-black text-white px-3 py-1.5"
            >
              Guardar plantilla
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

export default function TemplatesSection({ templates }: { templates: Template[] }) {
  return (
    <div className="space-y-2">
      {SLOTS.map((slot) => (
        <TemplateCard
          key={`${slot.type}-${slot.channel}`}
          slot={slot}
          template={templates.find((t) => t.type === slot.type && t.channel === slot.channel)}
        />
      ))}
    </div>
  );
}

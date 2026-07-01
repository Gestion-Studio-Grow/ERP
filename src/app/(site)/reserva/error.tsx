"use client";

export default function ReservaError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-xl font-semibold mb-2">No pudimos reservar ese turno</h1>
      <p className="text-neutral-500 mb-8">
        {error.message || "Ese horario se acaba de ocupar. Elegí otro horario disponible."}
      </p>
      <button
        onClick={() => reset()}
        className="rounded-md bg-black text-white px-5 py-2.5 font-medium"
      >
        Elegir otro horario
      </button>
    </div>
  );
}

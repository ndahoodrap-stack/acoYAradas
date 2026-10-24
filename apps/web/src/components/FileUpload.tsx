import { useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * Subida de imágenes con arrastrar y soltar, vista previa y opción de pegar
 * una URL. La imagen se sube a `POST /api/uploads` y se guarda la URL devuelta.
 */
export function FileUpload({
  value,
  onChange,
  label = 'Imagen',
  hint,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('El archivo tiene que ser una imagen (JPG, PNG, WEBP…).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('La imagen supera los 8 MB. Probá con una más liviana.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ url: string }>('/uploads', form);
      onChange(res.url);
    } catch (err) {
      setError((err as Error).message || 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="label mb-0">{label}</label>
        <button
          type="button"
          className="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => setShowUrl((v) => !v)}
        >
          {showUrl ? 'Subir archivo' : 'Usar una URL'}
        </button>
      </div>

      {showUrl ? (
        <input
          className="input"
          placeholder="https://…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
            dragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-ink-300 bg-ink-50/60 hover:border-brand-300 hover:bg-brand-50/40'
          }`}
        >
          {value ? (
            <img
              src={value}
              alt="Vista previa"
              className="h-24 w-24 rounded-xl border border-ink-200 object-cover"
            />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-2xl shadow-sm" aria-hidden>
              🖼️
            </span>
          )}
          <span className="text-sm font-semibold text-ink-800">
            {uploading ? 'Subiendo…' : value ? 'Cambiar imagen' : 'Subir imagen'}
          </span>
          <span className="text-xs text-ink-500">
            Arrastrá una foto acá o hacé clic para elegirla (máx. 8 MB)
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <>
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Ver imagen completa
            </a>
            <button
              type="button"
              className="text-xs font-medium text-red-600 hover:underline"
              onClick={() => onChange('')}
            >
              Quitar
            </button>
          </>
        ) : null}
        {hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

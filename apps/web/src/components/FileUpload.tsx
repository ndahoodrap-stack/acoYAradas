import { useRef, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { ImageCropper } from './ImageCropper';

/**
 * Tipos de relación de aspecto predefinidos para diferentes usos
 */
export type AspectRatioPreset =
  | 'square'      // 1:1 - logos, avatares, productos
  | 'banner'      // 3:1 - portadas, banners (1200x400)
  | 'wide'        // 16:9 - banners anchos, hero images
  | 'portrait'    // 3:4 - fotos verticales
  | 'custom';     // Personalizado via aspectRatio prop

interface FileUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  /** Relación de aspecto predefinida */
  aspectRatioPreset?: AspectRatioPreset;
  /** Relación de aspecto personalizada (ancho / alto). Se usa si preset es 'custom' */
  aspectRatio?: number;
  /** Ancho recomendado en píxeles (para mostrar hint) */
  recommendedWidth?: number;
  /** Alto recomendado en píxeles (para mostrar hint) */
  recommendedHeight?: number;
}

const PRESET_RATIOS: Record<Exclude<AspectRatioPreset, 'custom'>, number> = {
  square: 1,
  banner: 3,
  wide: 16 / 9,
  portrait: 3 / 4,
};

const PRESET_LABELS: Record<AspectRatioPreset, string> = {
  square: 'Cuadrado (1:1)',
  banner: 'Banner 3:1 (1200×400)',
  wide: 'Panorámico 16:9',
  portrait: 'Vertical 3:4',
  custom: 'Personalizado',
};

export function FileUpload({
  value,
  onChange,
  label = 'Imagen',
  hint,
  aspectRatioPreset = 'square',
  aspectRatio: customAspectRatio = 1,
  recommendedWidth,
  recommendedHeight,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);

  const effectiveAspectRatio = aspectRatioPreset === 'custom' ? customAspectRatio : PRESET_RATIOS[aspectRatioPreset];
  const effectivePresetLabel = aspectRatioPreset === 'custom'
    ? `${customAspectRatio.toFixed(2)}:1`
    : PRESET_LABELS[aspectRatioPreset];

  // Generate hint from recommended dimensions if not provided
  const effectiveHint = hint || (recommendedWidth && recommendedHeight
    ? `Recomendado: ${recommendedWidth}×${recommendedHeight} px (${effectivePresetLabel})`
    : recommendedWidth
    ? `Ancho recomendado: ${recommendedWidth} px (${effectivePresetLabel})`
    : recommendedHeight
    ? `Alto recomendado: ${recommendedHeight} px (${effectivePresetLabel})`
    : `Proporción: ${effectivePresetLabel}`);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('El archivo tiene que ser una imagen (JPG, PNG, WEBP…).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('La imagen supera los 8 MB. Probá con una más liviana.');
      return;
    }

    // Create object URL for preview in cropper
    const objectUrl = URL.createObjectURL(file);
    setCropperSrc(objectUrl);
    // Store the file to upload after cropping
    (window as any).__pendingUploadFile = file;
  }, []);

  const handleCropComplete = useCallback(async (blob: Blob) => {
    setCropperSrc(null);
    // Upload the cropped image
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', blob, 'cropped-image.jpg');
      const res = await api.post<{ url: string }>('/uploads', form);
      onChange(res.url);
    } catch (err) {
      setError((err as Error).message || 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
      // Clean up object URL
      if (cropperSrc) URL.revokeObjectURL(cropperSrc);
    }
  }, [onChange, cropperSrc]);

  const handleCropCancel = useCallback(() => {
    setCropperSrc(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleRemove = useCallback(() => {
    onChange('');
  }, [onChange]);

  const handleUrlChange = useCallback((url: string) => {
    // For URL input, we don't crop - just use as-is
    onChange(url);
  }, [onChange]);

  // Show cropper modal when cropperSrc is set
  const showCropper = cropperSrc !== null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="label mb-0">{label}</label>
        <button
          type="button"
          className="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => setShowUrl((v) => !v)}
          disabled={uploading || showCropper}
        >
          {showUrl ? 'Subir archivo' : 'Usar una URL'}
        </button>
      </div>

      {showUrl ? (
        <input
          className="input"
          placeholder="https://…"
          value={value}
          onChange={(e) => handleUrlChange(e.target.value)}
          disabled={uploading || showCropper}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && !showCropper && inputRef.current?.click()}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && !uploading && !showCropper) {
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
            if (file && !uploading && !showCropper) void handleFile(file);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
            uploading || showCropper
              ? 'border-ink-200 bg-ink-50/60 cursor-not-allowed opacity-60'
              : dragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-ink-300 bg-ink-50/60 hover:border-brand-300 hover:bg-brand-50/40'
          }`}
        >
          {value ? (
            <div className="relative">
              <img
                src={value}
                alt="Vista previa"
                className="h-24 w-24 rounded-xl border border-ink-200 object-cover"
              />
              {/* Aspect ratio badge on preview */}
              {aspectRatioPreset !== 'square' && (
                <span className="absolute -bottom-2 -right-2 bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {effectivePresetLabel}
                </span>
              )}
            </div>
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-2xl shadow-sm" aria-hidden>
              🖼️
            </span>
          )}
          <span className="text-sm font-semibold text-ink-800">
            {uploading ? 'Subiendo…' : showCropper ? 'Recortando…' : value ? 'Cambiar imagen' : 'Subir imagen'}
          </span>
          <span className="text-xs text-ink-500">
            Arrastrá una foto acá o hacé clic para elegirla (máx. 8 MB)
          </span>
          {effectiveHint && (
            <span className="text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
              {effectiveHint}
            </span>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && !uploading && !showCropper) void handleFile(file);
        }}
        disabled={uploading || showCropper}
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
              onClick={handleRemove}
              disabled={uploading || showCropper}
            >
              Quitar
            </button>
          </>
        ) : null}
        {effectiveHint && !value ? <p className="text-xs text-ink-500">{effectiveHint}</p> : null}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {/* Cropper Modal */}
      {showCropper && cropperSrc && (
        <ImageCropper
          src={cropperSrc}
          aspectRatio={effectiveAspectRatio}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
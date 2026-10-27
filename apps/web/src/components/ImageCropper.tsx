import { useEffect, useRef, useState, useCallback } from 'react';
import Cropper from 'cropperjs';
import './ImageCropper.css';

// Type augmentation for cropperjs
interface CropperInstance {
  zoomTo: (ratio: number) => void;
  zoom: (delta: number) => void;
  reset: () => void;
  getCroppedCanvas: (options?: {
    fillColor?: string;
    imageSmoothingEnabled?: boolean;
    imageSmoothingQuality?: 'low' | 'medium' | 'high';
    maxWidth?: number;
    maxHeight?: number;
    minWidth?: number;
    minHeight?: number;
  }) => HTMLCanvasElement;
  destroy: () => void;
}

interface ImageCropperProps {
  src: string;
  aspectRatio: number;
  onCropComplete: (blob: Blob) => void;
  onCancel: () => void;
  /** Whether to use circular crop mask (for square/1:1 aspect ratio) */
  circular?: boolean;
  /** Recommended dimensions for display hint */
  recommendedWidth?: number;
  recommendedHeight?: number;
}

export function ImageCropper({
  src,
  aspectRatio,
  onCropComplete,
  onCancel,
  circular = false,
  recommendedWidth,
  recommendedHeight,
}: ImageCropperProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<CropperInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cropperReady, setCropperReady] = useState(false);
  const [isCircular, setIsCircular] = useState(false);

  // Determine if circular mask should be used
  useEffect(() => {
    const circularMode = circular && Math.abs(aspectRatio - 1) < 0.01;
    setIsCircular(circularMode);
  }, [circular, aspectRatio]);

  // Initialize cropper when image loads
  useEffect(() => {
    if (!imageRef.current || cropperRef.current) return;

    const image = imageRef.current;

    const initCropper = () => {
      if (!imageRef.current) return;

      // Use type assertion to bypass TypeScript issues with cropperjs types
      const cropper = new Cropper(imageRef.current, {
        aspectRatio: aspectRatio,
        viewMode: 2,
        dragMode: 'move',
        autoCropArea: 0.9,
        restore: false,
        guides: false,
        center: false,
        highlight: false,
        background: false,
        modal: true,
        movable: true,
        rotatable: false,
        scalable: false,
        zoomable: true,
        zoomOnTouch: true,
        zoomOnWheel: true,
        wheelZoomRatio: 0.1,
        minContainerWidth: 320,
        minContainerHeight: 200,
        ready() {
          setCropperReady(true);
          // Apply circular/rectangular class to cropper elements
          applyCropperStyles();
          // Set initial zoom to fit nicely
          setTimeout(() => {
            if (cropperRef.current) {
              cropperRef.current.zoomTo(1);
            }
          }, 50);
        },
        cropmove() {
          // Reapply styles on move in case elements are recreated
          applyCropperStyles();
        },
        zoom() {
          applyCropperStyles();
        },
      } as any) as unknown as CropperInstance;

      cropperRef.current = cropper;
    };

    if (image.complete) {
      initCropper();
    } else {
      image.onload = initCropper;
    }

    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy();
        cropperRef.current = null;
      }
      setCropperReady(false);
    };
  }, [src, aspectRatio]);

  // Apply custom styles to cropper elements
  const applyCropperStyles = useCallback(() => {
    if (!cropperRef.current) return;

    const cropBox = document.querySelector('.cropper-crop-box');
    if (cropBox) {
      // Remove existing classes
      cropBox.classList.remove('cropper-circular', 'cropper-rectangular');
      // Add appropriate class
      cropBox.classList.add(isCircular ? 'cropper-circular' : 'cropper-rectangular');
    }

    // Also style the view box
    const viewBox = document.querySelector('.cropper-view-box');
    if (viewBox) {
      viewBox.classList.toggle('cropper-circular-view', isCircular);
    }
  }, [isCircular]);

  // Handle zoom controls
  const handleZoomIn = useCallback(() => {
    if (cropperRef.current) {
      cropperRef.current.zoom(0.1);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (cropperRef.current) {
      cropperRef.current.zoom(-0.1);
    }
  }, []);

  // Generate cropped image
  const handleApply = useCallback(async () => {
    if (!cropperRef.current || !imageRef.current) return;

    try {
      const canvas = cropperRef.current.getCroppedCanvas({
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        maxWidth: recommendedWidth || 2048,
        maxHeight: recommendedHeight || 2048,
      });

      canvas.toBlob(
        (blob: Blob | null) => {
          if (blob) {
            onCropComplete(blob);
          }
        },
        'image/jpeg',
        0.92
      );
    } catch (error) {
      console.error('Crop error:', error);
    }
  }, [onCropComplete, recommendedWidth, recommendedHeight]);

  // Clean up object URL on unmount/cancel
  useEffect(() => {
    return () => {
      if (src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    };
  }, [src]);

  if (!cropperReady) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="text-white text-lg">Cargando imagen...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
      <div
        ref={containerRef}
        className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={isCircular ? "Recortar foto de perfil" : "Recortar imagen"}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ink-200 bg-white">
          <h2 className="text-lg font-semibold text-ink-900">
            {isCircular ? 'Recortar foto de perfil' : 'Recortar imagen'}
          </h2>
          <div className="flex items-center gap-2">
            {/* Zoom controls */}
            <div className="flex items-center gap-1 bg-ink-100 rounded-lg p-1">
              <button
                type="button"
                className="p-2 rounded hover:bg-ink-200 transition-colors"
                onClick={handleZoomOut}
                aria-label="Alejar"
                disabled={!cropperRef.current}
              >
                <svg className="w-5 h-5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                type="button"
                className="p-2 rounded hover:bg-ink-200 transition-colors"
                onClick={handleZoomIn}
                aria-label="Acercar"
                disabled={!cropperRef.current}
              >
                <svg className="w-5 h-5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m0-6H6" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-ink-100 text-ink-500 transition-colors"
              onClick={onCancel}
              aria-label="Cancelar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Cropper container */}
        <div className="relative bg-ink-100">
          <div className="image-cropper-container">
            <img
              ref={imageRef}
              src={src}
              alt="Imagen a recortar"
              crossOrigin="anonymous"
            />
            {/* Custom mask overlay */}
            {isCircular ? (
              <div className="cropper-custom-circular-mask" aria-hidden="true" />
            ) : (
              <div className="cropper-custom-rectangular-mask" aria-hidden="true" />
            )}
          </div>

          {/* Aspect ratio indicator */}
          <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {isCircular
              ? 'Círculo (1:1)'
              : aspectRatio === 3
              ? 'Banner 3:1'
              : aspectRatio === 16 / 9
              ? '16:9'
              : aspectRatio === 3 / 4
              ? '3:4'
              : `${aspectRatio.toFixed(2)}:1`}
          </div>
        </div>

        {/* Footer with actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-ink-200 bg-ink-50">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleApply}
            disabled={!cropperReady}
          >
            Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  );
}
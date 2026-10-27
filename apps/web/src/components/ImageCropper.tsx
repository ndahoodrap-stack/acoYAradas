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
  getData: () => { x: number; y: number; width: number; height: number; rotate: number; scaleX: number; scaleY: number };
  setData: (data: { x?: number; y?: number; width?: number; height?: number }) => void;
}

interface ImageCropperProps {
  src: string;
  aspectRatio: number;
  onCropComplete: (blob: Blob) => void;
  onCancel: () => void;
  circular?: boolean;
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
  const [imageError, setImageError] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('Iniciando...');

  useEffect(() => {
    const circularMode = circular && Math.abs(aspectRatio - 1) < 0.01;
    setIsCircular(circularMode);
  }, [circular, aspectRatio]);

  useEffect(() => {
    if (!imageRef.current || cropperRef.current) return;
    setImageError(false);
    setCropperReady(false);
    setDebugInfo('Montando imagen...');

    const image = imageRef.current;

    // Forzar dimensiones en el contenedor
    const container = image.parentElement;
    if (container) {
      container.style.width = '100%';
      container.style.height = '50vh';
      container.style.minHeight = '300px';
    }

    const initCropper = () => {
      if (!imageRef.current) return;
      setDebugInfo('Creando cropper...');

      try {
        if (image.naturalWidth === 0 || image.naturalHeight === 0) {
          throw new Error('Imagen sin dimensiones');
        }

        // Opciones mínimas y seguras
        const cropper = new Cropper(image, {
          aspectRatio,
          viewMode: 1,
          dragMode: 'move',
          modal: true,
          background: false,
          autoCrop: true,
          movable: true,
          zoomable: true,
          rotatable: false,
          scalable: false,
        } as any) as unknown as CropperInstance;

        cropperRef.current = cropper;

        // Forzar ready inmediatamente
        setTimeout(() => {
          if (cropperRef.current) {
            applyCropperStyles();
            // Centrar y ajustar crop box
            const cropBoxData = cropper.getData();
            const containerWidth = container?.clientWidth || 800;
            const containerHeight = container?.clientHeight || 400;
            cropper.setData({
              x: (containerWidth - cropBoxData.width) / 2,
              y: (containerHeight - cropBoxData.height) / 2,
            });
            setCropperReady(true);
            setDebugInfo('¡Listo!');
          }
        }, 100);

      } catch (e) {
        console.error('Cropper error:', e);
        setImageError(true);
        setDebugInfo(`Error: ${e instanceof Error ? e.message : 'Error'}`);
      }
    };

    const handleLoad = () => {
      setDebugInfo('Imagen OK, iniciando cropper...');
      requestAnimationFrame(initCropper);
    };

    const handleError = () => {
      setImageError(true);
      setDebugInfo('Error cargando imagen');
    };

    image.addEventListener('load', handleLoad);
    image.addEventListener('error', handleError);

    // Si ya está cargada
    if (image.complete && image.naturalWidth > 0) {
      handleLoad();
    }

    return () => {
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
      if (cropperRef.current) {
        cropperRef.current.destroy();
        cropperRef.current = null;
      }
      setCropperReady(false);
    };
  }, [src, aspectRatio]);

  const applyCropperStyles = useCallback(() => {
    const cropBox = document.querySelector('.cropper-crop-box');
    if (cropBox) {
      cropBox.classList.remove('cropper-circular', 'cropper-rectangular');
      cropBox.classList.add(isCircular ? 'cropper-circular' : 'cropper-rectangular');
    }
  }, [isCircular]);

  const handleZoomIn = useCallback(() => cropperRef.current?.zoom(0.1), []);
  const handleZoomOut = useCallback(() => cropperRef.current?.zoom(-0.1), []);

  const handleApply = useCallback(async () => {
    if (!cropperRef.current) return;
    try {
      const canvas = cropperRef.current.getCroppedCanvas({
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        maxWidth: recommendedWidth || 2048,
        maxHeight: recommendedHeight || 2048,
      });
      canvas.toBlob((blob) => blob && onCropComplete(blob), 'image/jpeg', 0.92);
    } catch (e) { console.error('Crop error:', e); }
  }, [onCropComplete, recommendedWidth, recommendedHeight]);

  if (imageError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-white rounded-2xl p-6 max-w-md mx-4 text-center">
          <div className="text-red-600 text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-semibold text-ink-900 mb-2">Error</h3>
          <p className="text-ink-600 mb-4">No se pudo cargar la imagen. Intenta con otra.</p>
          <button className="btn-secondary" onClick={onCancel}>Cerrar</button>
        </div>
      </div>
    );
  }

  if (!cropperReady) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-white rounded-2xl p-6 max-w-md mx-4 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-3 border-brand-600 border-t-transparent mx-auto mb-3"/>
          <div className="text-lg font-medium text-ink-900">Cargando...</div>
          <div className="text-xs text-ink-400 mt-2 font-mono">{debugInfo}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
      <div ref={containerRef} className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-ink-200 bg-white">
          <h2 className="text-lg font-semibold text-ink-900">{isCircular ? 'Recortar foto de perfil' : 'Recortar imagen'}</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-ink-100 rounded-lg p-1">
              <button onClick={handleZoomOut} className="p-2 rounded hover:bg-ink-200" aria-label="Alejar"><svg className="w-5 h-5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>
              <button onClick={handleZoomIn} className="p-2 rounded hover:bg-ink-200" aria-label="Acercar"><svg className="w-5 h-5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m0-6H6"/></svg></button>
            </div>
            <button onClick={onCancel} className="p-2 rounded-lg hover:bg-ink-100 text-ink-500" aria-label="Cancelar"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
        </div>

        <div className="relative bg-ink-100" style={{minHeight: '300px', maxHeight: '50vh'}}>
          <div className="image-cropper-container" style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <img ref={imageRef} src={src} alt="Recortar" style={{maxWidth: '100%', maxHeight: '50vh'}}/>
            {isCircular ? <div className="cropper-custom-circular-mask"/> : <div className="cropper-custom-rectangular-mask"/>}
          </div>
          <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {isCircular ? 'Círculo (1:1)' : aspectRatio === 3 ? 'Banner 3:1' : aspectRatio === 16/9 ? '16:9' : '3:4'}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-ink-200 bg-ink-50">
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" onClick={handleApply}>Aplicar recorte</button>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useRef, useState, useCallback } from 'react';

interface ImageCropperProps {
  /** The image URL or data URL to crop */
  src: string;
  /** Aspect ratio for cropping (width / height). e.g., 1 for square, 3 for 1200x400 */
  aspectRatio: number;
  /** Callback when cropping is complete with the cropped image as blob */
  onCropComplete: (blob: Blob) => void;
  /** Callback when user cancels cropping */
  onCancel: () => void;
  /** Optional: minimum width of the crop area in CSS pixels */
  minCropWidth?: number;
  /** Optional: minimum height of the crop area in CSS pixels */
  minCropHeight?: number;
}

export function ImageCropper({
  src,
  aspectRatio,
  onCropComplete,
  onCancel,
  minCropWidth = 200,
  minCropHeight = 200,
}: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cropAreaRef = useRef<HTMLDivElement>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [cropArea, setCropArea] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [imageDisplaySize, setImageDisplaySize] = useState({ width: 0, height: 0 });
  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w' | 'resize-ne' | 'resize-nw' | 'resize-se' | 'resize-sw' | null;
    startX: number;
    startY: number;
    startCrop: typeof cropArea;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });

  // Initialize crop area when image loads
  useEffect(() => {
    if (!imageRef.current || !containerRef.current) return;

    const img = imageRef.current;
    const container = containerRef.current;

    // Calculate display size to fit in container while maintaining aspect ratio
    const containerRect = container.getBoundingClientRect();
    const maxWidth = containerRect.width - 32; // padding
    const maxHeight = Math.min(containerRect.height - 32, 500); // max height limit

    let displayWidth = img.naturalWidth;
    let displayHeight = img.naturalHeight;

    if (displayWidth > maxWidth) {
      displayHeight = (displayHeight * maxWidth) / displayWidth;
      displayWidth = maxWidth;
    }
    if (displayHeight > maxHeight) {
      displayWidth = (displayWidth * maxHeight) / displayHeight;
      displayHeight = maxHeight;
    }

    setImageDisplaySize({ width: displayWidth, height: displayHeight });

    // Initialize crop area to fill as much as possible within aspect ratio
    let cropWidth, cropHeight;
    if (displayWidth / displayHeight > aspectRatio) {
      // Image is wider than target aspect ratio - fit height
      cropHeight = Math.min(displayHeight * 0.9, maxHeight * 0.9);
      cropWidth = cropHeight * aspectRatio;
    } else {
      // Image is taller than target aspect ratio - fit width
      cropWidth = Math.min(displayWidth * 0.9, maxWidth * 0.9);
      cropHeight = cropWidth / aspectRatio;
    }

    // Center the crop area
    const x = (displayWidth - cropWidth) / 2;
    const y = (displayHeight - cropHeight) / 2;

    setCropArea({ x, y, width: cropWidth, height: cropHeight });
    setImagePosition({ x: 0, y: 0 });
    setZoom(1);
  }, [imageLoaded, aspectRatio]);

  // Handle image load
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  // Handle mouse/touch down on crop area or handles
  const handleMouseDown = useCallback((
    e: React.MouseEvent | React.TouchEvent,
    type: 'move' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w' | 'resize-ne' | 'resize-nw' | 'resize-se' | 'resize-sw'
  ) => {
    if (!cropAreaRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setDragState({
      type,
      startX: clientX,
      startY: clientY,
      startCrop: { ...cropArea },
    });

    e.preventDefault();
    e.stopPropagation();
  }, [cropArea]);

  // Handle mouse/touch move
  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragState || !containerRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = (clientX - dragState.startX) / zoom;
    const deltaY = (clientY - dragState.startY) / zoom;

    const containerRect = containerRef.current.getBoundingClientRect();
    const maxX = containerRect.width - 32 - cropArea.width;
    const maxY = containerRect.height - 32 - cropArea.height;

    let newCrop = { ...dragState.startCrop };

    switch (dragState.type) {
      case 'move':
        newCrop.x = Math.max(0, Math.min(maxX, dragState.startCrop.x + deltaX));
        newCrop.y = Math.max(0, Math.min(maxY, dragState.startCrop.y + deltaY));
        break;
      case 'resize-e':
        newCrop.width = Math.max(minCropWidth, Math.min(imageDisplaySize.width - newCrop.x, dragState.startCrop.width + deltaX));
        break;
      case 'resize-w':
        newCrop.x = Math.max(0, Math.min(dragState.startCrop.x + dragState.startCrop.width - minCropWidth, dragState.startCrop.x + deltaX));
        newCrop.width = dragState.startCrop.x + dragState.startCrop.width - newCrop.x;
        break;
      case 'resize-s':
        newCrop.height = Math.max(minCropHeight, Math.min(imageDisplaySize.height - newCrop.y, dragState.startCrop.height + deltaY));
        break;
      case 'resize-n':
        newCrop.y = Math.max(0, Math.min(dragState.startCrop.y + dragState.startCrop.height - minCropHeight, dragState.startCrop.y + deltaY));
        newCrop.height = dragState.startCrop.y + dragState.startCrop.height - newCrop.y;
        break;
      case 'resize-se':
        newCrop.width = Math.max(minCropWidth, Math.min(imageDisplaySize.width - newCrop.x, dragState.startCrop.width + deltaX));
        newCrop.height = Math.max(minCropHeight, Math.min(imageDisplaySize.height - newCrop.y, dragState.startCrop.height + deltaY));
        // Maintain aspect ratio
        if (newCrop.width / newCrop.height > aspectRatio) {
          newCrop.height = newCrop.width / aspectRatio;
        } else {
          newCrop.width = newCrop.height * aspectRatio;
        }
        break;
      case 'resize-nw':
        newCrop.x = Math.max(0, Math.min(dragState.startCrop.x + dragState.startCrop.width - minCropWidth, dragState.startCrop.x + deltaX));
        newCrop.width = dragState.startCrop.x + dragState.startCrop.width - newCrop.x;
        newCrop.y = Math.max(0, Math.min(dragState.startCrop.y + dragState.startCrop.height - minCropHeight, dragState.startCrop.y + deltaY));
        newCrop.height = dragState.startCrop.y + dragState.startCrop.height - newCrop.y;
        if (newCrop.width / newCrop.height > aspectRatio) {
          newCrop.height = newCrop.width / aspectRatio;
          newCrop.y = dragState.startCrop.y + dragState.startCrop.height - newCrop.height;
        } else {
          newCrop.width = newCrop.height * aspectRatio;
          newCrop.x = dragState.startCrop.x + dragState.startCrop.width - newCrop.width;
        }
        break;
      case 'resize-ne':
        newCrop.width = Math.max(minCropWidth, Math.min(imageDisplaySize.width - newCrop.x, dragState.startCrop.width + deltaX));
        newCrop.y = Math.max(0, Math.min(dragState.startCrop.y + dragState.startCrop.height - minCropHeight, dragState.startCrop.y + deltaY));
        newCrop.height = dragState.startCrop.y + dragState.startCrop.height - newCrop.y;
        if (newCrop.width / newCrop.height > aspectRatio) {
          newCrop.height = newCrop.width / aspectRatio;
          newCrop.y = dragState.startCrop.y + dragState.startCrop.height - newCrop.height;
        } else {
          newCrop.width = newCrop.height * aspectRatio;
        }
        break;
      case 'resize-sw':
        newCrop.x = Math.max(0, Math.min(dragState.startCrop.x + dragState.startCrop.width - minCropWidth, dragState.startCrop.x + deltaX));
        newCrop.width = dragState.startCrop.x + dragState.startCrop.width - newCrop.x;
        newCrop.height = Math.max(minCropHeight, Math.min(imageDisplaySize.height - newCrop.y, dragState.startCrop.height + deltaY));
        if (newCrop.width / newCrop.height > aspectRatio) {
          newCrop.height = newCrop.width / aspectRatio;
        } else {
          newCrop.width = newCrop.height * aspectRatio;
          newCrop.x = dragState.startCrop.x + dragState.startCrop.width - newCrop.width;
        }
        break;
    }

    // Enforce aspect ratio for non-corner resizes
    if (dragState.type && !['resize-se', 'resize-nw', 'resize-ne', 'resize-sw'].includes(dragState.type)) {
      if (newCrop.width / newCrop.height > aspectRatio) {
        newCrop.height = newCrop.width / aspectRatio;
      } else {
        newCrop.width = newCrop.height * aspectRatio;
      }
    }

    setCropArea(newCrop);
  }, [dragState, zoom, imageDisplaySize, aspectRatio, minCropWidth, minCropHeight]);

  // Handle mouse/touch up
  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // Attach global listeners
  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove as any);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove as any, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove as any);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleMouseMove as any);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  // Handle zoom
  const handleZoom = useCallback((delta: number) => {
    setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
  }, []);

  // Handle image pan (when zoomed)
  const handleImagePan = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (zoom <= 1) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;
    const startPos = { ...imagePosition };

    const moveHandler = (moveEvent: MouseEvent | TouchEvent) => {
      const moveX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      setImagePosition({
        x: startPos.x + (moveX - startX) / zoom,
        y: startPos.y + (moveY - startY) / zoom,
      });
    };

    const upHandler = () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
      window.removeEventListener('touchmove', moveHandler);
      window.removeEventListener('touchend', upHandler);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
    window.addEventListener('touchmove', moveHandler, { passive: true });
    window.addEventListener('touchend', upHandler);
  }, [zoom, imagePosition]);

  // Generate cropped image
  const handleApply = useCallback(async () => {
    if (!imageRef.current) return;

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate the scale between displayed image and natural image
    const scaleX = img.naturalWidth / imageDisplaySize.width;
    const scaleY = img.naturalHeight / imageDisplaySize.height;

    // Set canvas to the crop area size in natural pixels
    canvas.width = cropArea.width * scaleX;
    canvas.height = cropArea.height * scaleY;

    // Draw the cropped portion
    ctx.drawImage(
      img,
      cropArea.x * scaleX,
      cropArea.y * scaleY,
      cropArea.width * scaleX,
      cropArea.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        onCropComplete(blob);
      }
    }, 'image/jpeg', 0.9);
  }, [cropArea, imageDisplaySize, onCropComplete]);

  if (!imageLoaded) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="text-white text-lg">Cargando imagen...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div
        ref={containerRef}
        className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Recortar imagen"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ink-200">
          <h2 className="text-lg font-semibold text-ink-900">Recortar imagen</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm text-ink-600">
              <button
                type="button"
                className="p-1 rounded hover:bg-ink-100"
                onClick={() => handleZoom(-0.1)}
                aria-label="Alejar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
              <span className="w-16 text-center">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="p-1 rounded hover:bg-ink-100"
                onClick={() => handleZoom(0.1)}
                aria-label="Acercar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              </button>
            </div>
            <button
              type="button"
              className="p-2 rounded hover:bg-ink-100 text-ink-500"
              onClick={onCancel}
              aria-label="Cancelar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Image preview area */}
        <div
          className="relative overflow-hidden bg-ink-100"
          style={{ width: imageDisplaySize.width, height: imageDisplaySize.height }}
        >
          {/* Dimmed overlay */}
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />

          {/* Image */}
          <img
            ref={imageRef}
            src={src}
            alt=""
            className="absolute transition-transform duration-100"
            style={{
              width: imageDisplaySize.width * zoom,
              height: imageDisplaySize.height * zoom,
              left: imagePosition.x,
              top: imagePosition.y,
              transformOrigin: 'top left',
            }}
            onLoad={handleImageLoad}
            onMouseDown={handleImagePan}
            onTouchStart={handleImagePan}
          />

          {/* Crop area */}
          <div
            ref={cropAreaRef}
            className="absolute border-2 border-white rounded-lg"
            style={{
              left: cropArea.x,
              top: cropArea.y,
              width: cropArea.width,
              height: cropArea.height,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
            }}
          >
            {/* Resize handles */}
            {dragState === null && zoom >= 1 && (
              <>
                <div
                  className="absolute w-4 h-4 bg-white rounded-full -top-2 -left-2 cursor-nwse-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize-nw')}
                  onTouchStart={(e) => handleMouseDown(e, 'resize-nw')}
                  aria-label="Redimensionar esquina superior izquierda"
                />
                <div
                  className="absolute w-4 h-4 bg-white rounded-full -top-2 right-[-2px] cursor-nesw-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize-ne')}
                  onTouchStart={(e) => handleMouseDown(e, 'resize-ne')}
                  aria-label="Redimensionar esquina superior derecha"
                />
                <div
                  className="absolute w-4 h-4 bg-white rounded-full bottom-[-2px] -left-2 cursor-nesw-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize-sw')}
                  onTouchStart={(e) => handleMouseDown(e, 'resize-sw')}
                  aria-label="Redimensionar esquina inferior izquierda"
                />
                <div
                  className="absolute w-4 h-4 bg-white rounded-full bottom-[-2px] right-[-2px] cursor-nwse-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize-se')}
                  onTouchStart={(e) => handleMouseDown(e, 'resize-se')}
                  aria-label="Redimensionar esquina inferior derecha"
                />
                <div
                  className="absolute w-4 h-4 bg-white rounded-full -top-2 left-1/2 -translate-x-1/2 cursor-ns-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize-n')}
                  onTouchStart={(e) => handleMouseDown(e, 'resize-n')}
                  aria-label="Redimensionar borde superior"
                />
                <div
                  className="absolute w-4 h-4 bg-white rounded-full bottom-[-2px] left-1/2 -translate-x-1/2 cursor-ns-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize-s')}
                  onTouchStart={(e) => handleMouseDown(e, 'resize-s')}
                  aria-label="Redimensionar borde inferior"
                />
                <div
                  className="absolute w-4 h-4 bg-white rounded-full top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize-w')}
                  onTouchStart={(e) => handleMouseDown(e, 'resize-w')}
                  aria-label="Redimensionar borde izquierdo"
                />
                <div
                  className="absolute w-4 h-4 bg-white rounded-full top-1/2 -translate-y-1/2 right-[-2px] cursor-ew-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize-e')}
                  onTouchStart={(e) => handleMouseDown(e, 'resize-e')}
                  aria-label="Redimensionar borde derecho"
                />
              </>
            )}

            {/* Move handle */}
            <div
              className="absolute top-2 left-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center cursor-move"
              onMouseDown={(e) => handleMouseDown(e, 'move')}
              onTouchStart={(e) => handleMouseDown(e, 'move')}
              aria-label="Mover área de recorte"
            >
              <svg className="w-4 h-4 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
          </div>

          {/* Aspect ratio indicator */}
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            Proporción: {aspectRatio === 1 ? '1:1 (cuadrado)' : aspectRatio === 3 ? '3:1 (banner)' : aspectRatio === 1.77 ? '16:9' : `${aspectRatio.toFixed(2)}:1`}
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
          >
            Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  );
}
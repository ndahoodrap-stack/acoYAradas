import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';

interface ImageCropperProps {
  src: string;
  aspectRatio: number;
  onCropComplete: (blob: Blob) => void;
  onCancel: () => void;
  circular?: boolean;
  recommendedWidth?: number;
  recommendedHeight?: number;
}

interface CropState {
  x: number;
  y: number;
  scale: number;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, scale: 1 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [cssWidth, setCssWidth] = useState(0);
  const [cssHeight, setCssHeight] = useState(0);
  const [dragState, setDragState] = useState<{
    type: 'move' | null;
    startX: number;
    startY: number;
    startCrop: CropState;
  } | null>(null);

  const isCircle = circular && Math.abs(aspectRatio - 1) < 0.01;
  const animationRef = useRef<number>();

  // Track container CSS size with ResizeObserver
  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCssWidth(width);
          setCssHeight(height);
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          const ctx = canvas.getContext('2d')!;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Load image
  useEffect(() => {
    if (!cssWidth || !cssHeight) return; // wait for container size

    setImgLoaded(false);
    setImgError(false);
    const img = imgRef.current;
    if (!img) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && !img.complete) {
        cancelled = true;
        setImgError(true);
      }
    }, 15000);

    const onLoad = () => {
      if (cancelled) return;
      clearTimeout(timeout);
      setImgLoaded(true);
      // Initialize centered crop
      const imgAR = img.naturalWidth / img.naturalHeight;
      const cropAR = aspectRatio;
      let initScale: number;
      if (imgAR > cropAR) {
        initScale = cssHeight / img.naturalHeight;
      } else {
        initScale = cssWidth / img.naturalWidth;
      }
      setCrop({
        x: (cssWidth - img.naturalWidth * initScale) / 2,
        y: (cssHeight - img.naturalHeight * initScale) / 2,
        scale: initScale,
      });
    };
    const onError = () => {
      if (cancelled) return;
      clearTimeout(timeout);
      setImgError(true);
    };

    img.onload = onLoad;
    img.onerror = onError;
    img.src = src;

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      img.onload = null;
      img.onerror = null;
    };
  }, [src, aspectRatio, cssWidth, cssHeight]);

  // Render loop - draw image + WhatsApp-style mask
  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !imgRef.current || !cssWidth || !cssHeight) return;

    const draw = () => {
      const canvas = canvasRef.current!;
      const img = imgRef.current!;
      const ctx = canvas.getContext('2d')!;

      // Clear (context is already scaled to CSS pixels via setTransform)
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Draw image
      const imgW = img.naturalWidth * crop.scale;
      const imgH = img.naturalHeight * crop.scale;
      ctx.drawImage(img, crop.x, crop.y, imgW, imgH);

      // Draw WhatsApp-style mask overlay
      drawMask(ctx, cssWidth, cssHeight);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current!);
  }, [imgLoaded, crop, aspectRatio, isCircle, cssWidth, cssHeight]);

  const drawMask = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const centerX = w / 2;
    const centerY = h / 2;

    if (isCircle) {
      const radius = Math.min(w, h) / 2 * 0.92;

      // 1. Dark overlay everywhere
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, 0, w, h);

      // 2. Cut out bright center circle (destination-out makes it transparent)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // 3. White border ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 4. Subtle inner highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Rectangular mask with rounded corners
      const cropW = w * 0.88;
      const cropH = cropW / aspectRatio;
      const x = centerX - cropW / 2;
      const y = centerY - cropH / 2;
      const r = 12;

      // Dark overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, w, h);

      // Cut out rectangle
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.roundRect(x, y, cropW, cropH, r);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // White border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, cropW, cropH, r);
      ctx.stroke();
    }
  }, [aspectRatio, isCircle]);

  // Interaction handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!imgLoaded) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    // Ignore clicks on top bar area
    if (e.clientY < rect.top + 60) return;

    setDragState({
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    });
  }, [imgLoaded, crop]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState || dragState.type !== 'move') return;
    e.preventDefault();

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    setCrop({
      ...dragState.startCrop,
      x: dragState.startCrop.x + dx,
      y: dragState.startCrop.y + dy,
    });
  }, [dragState]);

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!imgLoaded) return;
    e.preventDefault();

    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.4, Math.min(6, crop.scale * zoomFactor));

    setCrop({
      x: mouseX - (mouseX - crop.x) * (newScale / crop.scale),
      y: mouseY - (mouseY - crop.y) * (newScale / crop.scale),
      scale: newScale,
    });
  }, [imgLoaded, crop]);

  const handleZoomIn = useCallback(() => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const newScale = Math.min(6, crop.scale * 1.25);
    setCrop({
      x: centerX - (centerX - crop.x) * (newScale / crop.scale),
      y: centerY - (centerY - crop.y) * (newScale / crop.scale),
      scale: newScale,
    });
  }, [crop]);

  const handleZoomOut = useCallback(() => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const newScale = Math.max(0.4, crop.scale / 1.25);
    setCrop({
      x: centerX - (centerX - crop.x) * (newScale / crop.scale),
      y: centerY - (centerY - crop.y) * (newScale / crop.scale),
      scale: newScale,
    });
  }, [crop]);

  // Generate cropped blob
  const handleApply = useCallback(async () => {
    if (!imgRef.current || !canvasRef.current) return;

    const img = imgRef.current;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const { width: bufW, height: bufH } = canvas;
    const w = bufW / dpr;
    const h = bufH / dpr;

    let cropX: number, cropY: number, cropW: number, cropH: number;

    if (isCircle) {
      const radius = Math.min(w, h) / 2 * 0.92;
      const centerX = w / 2;
      const centerY = h / 2;
      cropW = radius * 2;
      cropH = radius * 2;
      cropX = (centerX - crop.x - radius) / crop.scale;
      cropY = (centerY - crop.y - radius) / crop.scale;
    } else {
      const cropW_ = w * 0.88;
      const cropH_ = cropW_ / aspectRatio;
      const centerX = w / 2;
      const centerY = h / 2;
      const x = centerX - cropW_ / 2;
      const y = centerY - cropH_ / 2;
      cropW = cropW_;
      cropH = cropH_;
      cropX = (x - crop.x) / crop.scale;
      cropY = (y - crop.y) / crop.scale;
    }

    // Output canvas
    const outCanvas = document.createElement('canvas');
    const outCtx = outCanvas.getContext('2d')!;
    const maxW = recommendedWidth || 2048;
    const maxH = recommendedHeight || 2048;

    let outW = cropW / crop.scale;
    let outH = cropH / crop.scale;

    if (outW > maxW) { outH = outH * maxW / outW; outW = maxW; }
    if (outH > maxH) { outW = outW * maxH / outH; outH = maxH; }

    outCanvas.width = outW;
    outCanvas.height = outH;

    if (isCircle) {
      outCtx.save();
      outCtx.beginPath();
      outCtx.arc(outW/2, outH/2, Math.min(outW, outH)/2, 0, Math.PI * 2);
      outCtx.clip();
      outCtx.drawImage(img, cropX, cropY, cropW / crop.scale, cropH / crop.scale, 0, 0, outW, outH);
      outCtx.restore();
    } else {
      outCtx.drawImage(img, cropX, cropY, cropW / crop.scale, cropH / crop.scale, 0, 0, outW, outH);
    }

    outCanvas.toBlob(
      (blob) => blob && onCropComplete(blob),
      'image/jpeg',
      0.92
    );
  }, [crop, aspectRatio, isCircle, recommendedWidth, recommendedHeight, onCropComplete]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (src.startsWith('blob:') || src.startsWith('data:')) {
        URL.revokeObjectURL(src);
      }
    };
  }, [src]);

  if (imgError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-white rounded-2xl p-6 max-w-md mx-4 text-center">
          <div className="text-red-600 text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-semibold text-ink-900 mb-2">Error al cargar la imagen</h3>
          <button className="btn-secondary mt-4" onClick={onCancel}>Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
         onPointerDown={handlePointerDown}
         onPointerMove={handlePointerMove}
         onPointerUp={handlePointerUp}
         onPointerLeave={handlePointerUp}
         onWheel={handleWheel}>
      <div ref={containerRef} className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl overflow-hidden flex flex-col">
        {/* Top bar - always on top */}
        <div className="flex items-center justify-between p-4 border-b border-ink-200 bg-white flex-shrink-0 z-10 relative">
          <h2 className="text-lg font-semibold text-ink-900">
            {isCircle ? 'Recortar foto de perfil' : 'Recortar imagen'}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-ink-100 rounded-lg p-1">
              <button onClick={handleZoomOut} className="p-2 rounded hover:bg-ink-200" aria-label="Alejar" disabled={!imgLoaded}>
                <svg className="w-5 h-5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>
              <button onClick={handleZoomIn} className="p-2 rounded hover:bg-ink-200" aria-label="Acercar" disabled={!imgLoaded}>
                <svg className="w-5 h-5 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m0-6H6"/></svg>
              </button>
            </div>
            <button onClick={onCancel} className="p-2 rounded-lg hover:bg-ink-100 text-ink-500" aria-label="Cancelar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Canvas area - fills remaining space */}
        <div className="relative bg-ink-100 flex-1 min-h-[300px] max-h-[60vh] overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
          <img ref={imgRef} style={{ display: 'none' }} aria-hidden="true" />

          {/* Loading overlay */}
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-100 z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-brand-600 border-t-transparent mx-auto mb-3"/>
                <div className="text-lg font-medium text-ink-900">Cargando imagen...</div>
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs px-2 py-1 rounded z-10">
            {isCircle ? 'Círculo (1:1)' : aspectRatio === 3 ? 'Banner 3:1' : aspectRatio === 16/9 ? '16:9' : '3:4'}
          </div>

          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-lg p-1.5 text-xs text-ink-600 z-10">
            Arrastra para mover · Rueda para zoom
          </div>
        </div>

        {/* Bottom bar - always visible, never covered */}
        <div className="flex justify-end gap-3 p-4 border-t border-ink-200 bg-ink-50 flex-shrink-0 z-10 relative">
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" onClick={handleApply} disabled={!imgLoaded}>
            {imgLoaded ? 'Aplicar recorte' : 'Cargando...'}
          </button>
        </div>
      </div>
    </div>
  );
}
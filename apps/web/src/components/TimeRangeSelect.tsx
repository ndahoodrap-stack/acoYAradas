import { useState, useEffect, useRef, useCallback } from 'react';

interface TimeRangeSelectProps {
  value: string;
  onChange: (v: string) => void;
  dayLabel?: string;
}

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? 0 : 30;
  return { hour: h, minute: m, label: `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}` };
});

function parseTimeRange(value: string): { start: number; end: number } | null {
  if (!value || !value.trim()) return null;
  const m = value.match(/(\d{1,2}):?(\d{0,2})\s*[-–]\s*(\d{1,2}):?(\d{0,2})/);
  if (!m) return null;
  const startHour = parseInt(m[1], 10);
  const startMin = parseInt(m[2] || '0', 10);
  const endHour = parseInt(m[3], 10);
  const endMin = parseInt(m[4] || '0', 10);
  if (isNaN(startHour) || isNaN(endHour)) return null;
  return {
    start: startHour * 60 + startMin,
    end: endHour * 60 + endMin,
  };
}

function timeToIndex(hour: number, minute: number): number {
  return hour * 2 + (minute === 30 ? 1 : 0);
}

export function TimeRangeSelect({ value, onChange, dayLabel }: TimeRangeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(18); // 09:00
  const [endIndex, setEndIndex] = useState(42); // 21:00
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Initialize from value prop
  useEffect(() => {
    const parsed = parseTimeRange(value);
    if (parsed) {
      setIsOpen(true);
      setStartIndex(timeToIndex(Math.floor(parsed.start / 60), parsed.start % 60));
      setEndIndex(timeToIndex(Math.floor(parsed.end / 60), parsed.end % 60));
    } else {
      setIsOpen(false);
    }
  }, [value]);

  const startTime = TIME_SLOTS[startIndex];
  const endTime = TIME_SLOTS[endIndex];
  const formattedValue = isOpen ? `${startTime.label} - ${endTime.label}` : '';

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      onChange(formattedValue);
    } else {
      onChange('');
    }
  }, [onChange, formattedValue]);

  const handleStartChange = useCallback((index: number) => {
    if (index >= endIndex) return;
    setStartIndex(index);
    if (isOpen) {
      const newStart = TIME_SLOTS[index];
      onChange(`${newStart.label} - ${endTime.label}`);
    }
  }, [endIndex, endTime, isOpen, onChange]);

  const handleEndChange = useCallback((index: number) => {
    if (index <= startIndex) return;
    setEndIndex(index);
    if (isOpen) {
      const newStart = TIME_SLOTS[startIndex];
      onChange(`${newStart.label} - ${TIME_SLOTS[index].label}`);
    }
  }, [startIndex, startTime, isOpen, onChange]);

  // Drag handlers
  const startDrag = useCallback((type: 'start' | 'end', e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(type);
  }, []);

  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!activeHandle || !trackRef.current) return;
    e.preventDefault();
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const index = Math.round(relativeX * (TIME_SLOTS.length - 1));

    if (activeHandle === 'start') {
      if (index < endIndex) handleStartChange(index);
    } else {
      if (index > startIndex) handleEndChange(index);
    }
  }, [activeHandle, startIndex, endIndex, handleStartChange, handleEndChange]);

  const endDrag = useCallback(() => {
    setActiveHandle(null);
  }, []);

  // Attach global listeners when dragging
  useEffect(() => {
    if (activeHandle) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', endDrag);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', endDrag);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', endDrag);
    };
  }, [activeHandle, handleMove, endDrag]);

  const getTrackPosition = (index: number): number => {
    return (index / (TIME_SLOTS.length - 1)) * 100;
  };

  const startPos = getTrackPosition(startIndex);
  const endPos = getTrackPosition(endIndex);

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 transition-all hover:border-brand-200">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink-900 capitalize">{dayLabel}</span>
        <button
          type="button"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isOpen
              ? 'bg-brand-50 text-brand-700 border border-brand-200'
              : 'bg-ink-50 text-ink-500 border border-ink-200 hover:bg-ink-100'
          }`}
          onClick={() => handleOpenChange(!isOpen)}
          aria-pressed={isOpen}
        >
          <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-brand-500' : 'bg-ink-300'}`} />
          {isOpen ? 'Abierto' : 'Cerrado'}
        </button>
      </div>

      {isOpen && (
        <div className="space-y-3" data-timerange-track>
          {/* Minimalist track */}
          <div className="relative" ref={trackRef} style={{ touchAction: 'none' }}>
            {/* Track background */}
            <div className="h-1.5 rounded-full bg-ink-100" />

            {/* Active range - clean gradient */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-brand-500"
              style={{ left: `${startPos}%`, right: `${100 - endPos}%` }}
            />

            {/* Subtle hour markers */}
            <div className="absolute top-1/2 -translate-y-1/2 flex justify-between px-1 pointer-events-none">
              {TIME_SLOTS.filter((_, i) => i % 8 === 0).map((slot) => (
                <div key={slot.label} className="flex-1">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-ink-300 whitespace-nowrap font-medium">
                    {slot.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Start handle - elegant */}
            <button
              type="button"
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-brand-500 shadow-sm transition-all duration-150 hover:scale-125 hover:shadow-md active:scale-110 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 z-10"
              style={{ left: `${startPos}%` }}
              onMouseDown={(e) => startDrag('start', e)}
              onTouchStart={(e) => startDrag('start', e)}
              aria-label={`Apertura: ${startTime.label}`}
              aria-valuemin={0}
              aria-valuemax={TIME_SLOTS.length - 1}
              aria-valuenow={startIndex}
              role="slider"
              tabIndex={0}
              onKeyDown={(e) => {
                e.preventDefault();
                if (e.key === 'ArrowRight') handleStartChange(Math.min(startIndex + 1, endIndex - 1));
                if (e.key === 'ArrowLeft') handleStartChange(Math.max(startIndex - 1, 0));
                if (e.key === 'Home') handleStartChange(0);
                if (e.key === 'End') handleStartChange(endIndex - 1);
              }}
            >
              <span className="sr-only">Apertura: {startTime.label}</span>
            </button>

            {/* End handle - elegant */}
            <button
              type="button"
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-brand-500 shadow-sm transition-all duration-150 hover:scale-125 hover:shadow-md active:scale-110 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 z-10"
              style={{ left: `${endPos}%` }}
              onMouseDown={(e) => startDrag('end', e)}
              onTouchStart={(e) => startDrag('end', e)}
              aria-label={`Cierre: ${endTime.label}`}
              aria-valuemin={0}
              aria-valuemax={TIME_SLOTS.length - 1}
              aria-valuenow={endIndex}
              role="slider"
              tabIndex={0}
              onKeyDown={(e) => {
                e.preventDefault();
                if (e.key === 'ArrowRight') handleEndChange(Math.min(endIndex + 1, TIME_SLOTS.length - 1));
                if (e.key === 'ArrowLeft') handleEndChange(Math.max(endIndex - 1, startIndex + 1));
                if (e.key === 'Home') handleEndChange(startIndex + 1);
                if (e.key === 'End') handleEndChange(TIME_SLOTS.length - 1);
              }}
            >
              <span className="sr-only">Cierre: {endTime.label}</span>
            </button>
          </div>

          {/* Clean time display */}
          <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-ink-50 border border-ink-100">
            <span className="text-sm font-semibold text-ink-900 tabular-nums">
              {startTime.label}
            </span>
            <span className="text-ink-300 mx-1">–</span>
            <span className="text-sm font-semibold text-ink-900 tabular-nums">
              {endTime.label}
            </span>
            <span className="text-xs text-ink-400 font-medium">
              ({(endTime.hour - startTime.hour + (endTime.minute - startTime.minute) / 60).toFixed(1)}h)
            </span>
          </div>
        </div>
      )}

      {!isOpen && (
        <p className="text-sm text-ink-400 text-center py-3">Cerrado este día</p>
      )}
    </div>
  );
}

export default TimeRangeSelect;
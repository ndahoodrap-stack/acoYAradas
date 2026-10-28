import { useState, useEffect } from 'react';

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

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${minute === 0 ? '00' : '30'}`;
}

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

function indexToTime(index: number): { hour: number; minute: number } {
  return { hour: Math.floor(index / 2), minute: index % 2 === 0 ? 0 : 30 };
}

export function TimeRangeSelect({ value, onChange, dayLabel }: TimeRangeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(18); // 09:00
  const [endIndex, setEndIndex] = useState(42); // 21:00
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

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

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      onChange(formattedValue);
    } else {
      onChange('');
    }
  };

  const handleStartChange = (index: number) => {
    if (index >= endIndex) return; // Start can't be after end
    setStartIndex(index);
    if (isOpen) {
      const newStart = TIME_SLOTS[index];
      const newEnd = TIME_SLOTS[endIndex];
      onChange(`${newStart.label} - ${newEnd.label}`);
    }
  };

  const handleEndChange = (index: number) => {
    if (index <= startIndex) return; // End can't be before start
    setEndIndex(index);
    if (isOpen) {
      const newStart = TIME_SLOTS[startIndex];
      const newEnd = TIME_SLOTS[index];
      onChange(`${newStart.label} - ${newEnd.label}`);
    }
  };

  const handleDragStart = (type: 'start' | 'end') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(type);
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const container = document.querySelector('[data-timerange-track]');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const index = Math.round(relativeX * (TIME_SLOTS.length - 1));

    if (isDragging === 'start') {
      if (index < endIndex) handleStartChange(index);
    } else {
      if (index > startIndex) handleEndChange(index);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(null);
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', handleDragEnd);
  };

  const getTrackPosition = (index: number): number => {
    return (index / (TIME_SLOTS.length - 1)) * 100;
  };

  const startPos = getTrackPosition(startIndex);
  const endPos = getTrackPosition(endIndex);

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3 transition-all hover:border-brand-300">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium capitalize text-ink-700">{dayLabel}</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isOpen}
            onChange={(e) => handleOpenChange(e.target.checked)}
            className="w-4 h-4 rounded border-ink-300 text-brand-600 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            aria-label={`${dayLabel} abierto`}
          />
          <span className="text-xs font-medium text-ink-600">Abierto</span>
        </label>
      </div>

      {isOpen && (
        <div className="space-y-3">
          {/* Visual time range slider */}
          <div className="relative" data-timerange-track>
            <div className="h-6 relative">
              {/* Track background */}
              <div className="absolute inset-0 h-2 rounded-full bg-ink-100" />

              {/* Open range highlight */}
              <div
                className="absolute h-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 shadow-sm"
                style={{ left: `${startPos}%`, right: `${100 - endPos}%` }}
              />

              {/* Time markers */}
              <div className="absolute inset-0 flex justify-between px-1">
                {TIME_SLOTS.filter((_, i) => i % 6 === 0).map((slot) => (
                  <div key={slot.label} className="flex-1 text-center">
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-[10px] text-ink-400 whitespace-nowrap">
                      {slot.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Start handle */}
              <button
                type="button"
                className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-brand-500 shadow-lg transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                style={{ left: `calc(${startPos}% - 10px)` }}
                onMouseDown={handleDragStart('start')}
                onTouchStart={handleDragStart('start')}
                aria-label={`Hora de apertura: ${startTime.label}`}
                aria-valuemin={0}
                aria-valuemax={TIME_SLOTS.length - 1}
                aria-valuenow={startIndex}
                role="slider"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') handleStartChange(Math.min(startIndex + 1, endIndex - 1));
                  if (e.key === 'ArrowLeft') handleStartChange(Math.max(startIndex - 1, 0));
                }}
              >
                <span className="sr-only">Apertura: {startTime.label}</span>
              </button>

              {/* End handle */}
              <button
                type="button"
                className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-brand-500 shadow-lg transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                style={{ left: `calc(${endPos}% - 10px)` }}
                onMouseDown={handleDragStart('end')}
                onTouchStart={handleDragStart('end')}
                aria-label={`Hora de cierre: ${endTime.label}`}
                aria-valuemin={0}
                aria-valuemax={TIME_SLOTS.length - 1}
                aria-valuenow={endIndex}
                role="slider"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') handleEndChange(Math.min(endIndex + 1, TIME_SLOTS.length - 1));
                  if (e.key === 'ArrowLeft') handleEndChange(Math.max(endIndex - 1, startIndex + 1));
                }}
              >
                <span className="sr-only">Cierre: {endTime.label}</span>
              </button>
            </div>
          </div>

          {/* Time inputs for precise control */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">Apertura</label>
              <select
                className="input w-full"
                value={startIndex}
                onChange={(e) => handleStartChange(parseInt(e.target.value, 10))}
                aria-label="Hora de apertura"
              >
                {TIME_SLOTS.slice(0, -1).map((slot, i) => (
                  <option key={i} value={i}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">Cierre</label>
              <select
                className="input w-full"
                value={endIndex}
                onChange={(e) => handleEndChange(parseInt(e.target.value, 10))}
                aria-label="Hora de cierre"
              >
                {TIME_SLOTS.slice(1).map((slot, i) => (
                  <option key={i + 1} value={i + 1}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div className="flex flex-wrap gap-1">
            {[
              { label: '9-14h', start: 18, end: 28 },
              { label: '9-18h', start: 18, end: 36 },
              { label: '9-21h', start: 18, end: 42 },
              { label: '12-23h', start: 24, end: 46 },
              { label: '24h', start: 0, end: 47 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  startIndex === preset.start && endIndex === preset.end
                    ? 'bg-brand-100 text-brand-700 border border-brand-300'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                }`}
                onClick={() => {
                  setStartIndex(preset.start);
                  setEndIndex(preset.end);
                  handleStartChange(preset.start);
                  handleEndChange(preset.end);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isOpen && (
        <p className="text-xs text-ink-400 text-center py-2">Cerrado este día</p>
      )}
    </div>
  );
}

export default TimeRangeSelect;
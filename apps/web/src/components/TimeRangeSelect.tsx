const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

export function TimeRangeSelect({
  value,
  onChange,
  dayLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  dayLabel?: string;
}) {
  let start = '09:00';
  let end = '21:00';
  let closed = true;
  if (value && value.trim()) {
    closed = false;
    const m = value.match(/(\d{1,2}:?\d{0,2})\s*[-–]\s*(\d{1,2}:?\d{0,2})/);
    if (m) {
      start = m[1].length === 2 ? `${m[1]}:00` : m[1].padStart(5, '0');
      end = m[2].length === 2 ? `${m[2]}:00` : m[2].padStart(5, '0');
    }
  }
  return (
    <div className="rounded-xl border border-ink-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium capitalize text-ink-700">{dayLabel}</span>
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={!closed}
            onChange={(e) => {
              if (e.target.checked) onChange(`${start} - ${end}`);
              else onChange('');
            }}
          />
          Abierto
        </label>
      </div>
      {!closed ? (
        <div className="flex items-center gap-2">
          <select
            className="input flex-1"
            value={start}
            onChange={(e) => {
              start = e.target.value;
              onChange(`${start} - ${end}`);
            }}
          >
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="text-ink-500">a</span>
          <select
            className="input flex-1"
            value={end}
            onChange={(e) => {
              end = e.target.value;
              onChange(`${start} - ${end}`);
            }}
          >
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-ink-400">Cerrado</p>
      )}
    </div>
  );
}

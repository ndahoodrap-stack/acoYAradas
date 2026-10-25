const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function parseRange(s: string): { start: number; end: number } | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  let sh = parseInt(m[1], 10);
  let sm = parseInt(m[2] || '0', 10);
  let eh = parseInt(m[3], 10);
  let em = parseInt(m[4] || '0', 10);
  if (isNaN(sh) || isNaN(eh)) return null;
  if (sh === 12 && /12.*[-–]/.test(s) && /a\s*m/i.test(s)) {
    // keep
  }
  if (/p\.?m\.?/i.test(s) && eh < 12) eh += 12;
  if (/a\.?m\.?/i.test(s) && sh === 12) sh = 0;
  if (/p\.?m\.?/i.test(s) && sh < 12 && /[-–].*p/i.test(s)) sh += 12;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return { start, end };
}

export function isStoreOpenNow(openHours: any, now = new Date()): boolean {
  if (!openHours || typeof openHours !== 'object') return true;
  const day = DAYS[now.getDay()];
  const range = openHours[day];
  if (!range || typeof range !== 'string' || !range.trim()) return false;
  const p = parseRange(range);
  if (!p) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (p.end <= p.start) {
    return minutes >= p.start || minutes <= p.end;
  }
  return minutes >= p.start && minutes <= p.end;
}

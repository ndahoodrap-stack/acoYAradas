/** Helpers de importes: todos los cálculos de dinero pasan por acá. */
export const round2 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const money = (value: number): number => round2(value);

/** Formato es-AR sin símbolo (la web agrega el prefijo). */
export const formatMoney = (value: number): string =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    round2(value),
  );

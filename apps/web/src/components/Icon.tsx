import type { SVGProps } from 'react';

type IconName =
  | 'search'
  | 'cart'
  | 'menu'
  | 'close'
  | 'warning'
  | 'info'
  | 'success'
  | 'location'
  | 'store'
  | 'product'
  | 'arrow-right'
  | 'chevron-down'
  | 'plus'
  | 'minus';

const PATHS: Record<IconName, string> = {
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  cart: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.5 6h13M10 21a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6l-12 12',
  warning: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  info: 'M12 16v-4m0-4h.01M12 22a10 10 0 100-20 10 10 0 000 20z',
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  location: 'M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11zM12 10a2 2 0 110-4 2 2 0 010 4z',
  store: 'M3 9l1-6h16l1 6M5 9v11h14V9M9 20v-6h6v6',
  product: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m-8-10l8 4m-8-4v10l8 4',
  'arrow-right': 'M5 12h14m-6-6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
};

export function Icon({
  name,
  className = 'h-5 w-5',
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type { IconName };
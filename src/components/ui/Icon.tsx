/**
 * Icon — petites icônes SVG inline (style lucide), zéro dépendance externe.
 * Tracé fin (stroke=1.75), tailles via la prop `size` (px) ou className size-*.
 */

import type { SVGProps } from 'react'

const baseProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function svg(children: React.ReactNode) {
  // composant utilitaire : applique baseProps + props
  return function Component({ size, ...rest }: IconProps) {
    return (
      <svg {...baseProps} width={size ?? rest.width ?? 16} height={size ?? rest.height ?? 16} {...rest}>
        {children}
      </svg>
    )
  }
}

export const Plus = svg(<><path d="M5 12h14" /><path d="M12 5v14" /></>)
export const Minus = svg(<path d="M5 12h14" />)
export const Trash2 = svg(<>
  <path d="M3 6h18" />
  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  <line x1="10" x2="10" y1="11" y2="17" />
  <line x1="14" x2="14" y1="11" y2="17" />
</>)
export const Move = svg(<>
  <path d="M12 2v20" />
  <path d="m15 19-3 3-3-3" />
  <path d="m19 9 3 3-3 3" />
  <path d="M2 12h20" />
  <path d="m5 9-3 3 3 3" />
  <path d="m9 5 3-3 3 3" />
</>)
export const MoveRight = svg(<><path d="M18 8L22 12L18 16" /><path d="M2 12H22" /></>)
export const MoveDown = svg(<><path d="M8 18L12 22L16 18" /><path d="M12 2V22" /></>)
export const SquarePen = svg(<>
  <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
  <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
</>)
export const ClipboardList = svg(<>
  <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  <path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
</>)
export const Info = svg(<>
  <circle cx="12" cy="12" r="10" />
  <path d="M12 16v-4" /><path d="M12 8h.01" />
</>)
export const ChevronLeft = svg(<path d="m15 18-6-6 6-6" />)
export const ChevronRight = svg(<path d="m9 18 6-6-6-6" />)
export const ChevronDown = svg(<path d="m6 9 6 6 6-6" />)
export const X = svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>)
export const Check = svg(<path d="M20 6 9 17l-5-5" />)
export const Dumbbell = svg(<>
  <path d="M14.4 14.4 9.6 9.6" />
  <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
  <path d="m21.5 21.5-1.4-1.4" />
  <path d="M3.9 3.9 2.5 2.5" />
  <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
</>)
export const Activity = svg(<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.5.5 0 0 1-.96 0L9.68 3.18a.5.5 0 0 0-.96 0l-2.35 8.36A2 2 0 0 1 4.45 13H2" />)
export const Scale = svg(<>
  <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
  <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
  <path d="M7 21h10" /><path d="M12 3v18" />
  <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
</>)
export const NotebookPen = svg(<>
  <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
  <path d="M2 6h4" /><path d="M2 10h4" /><path d="M2 14h4" /><path d="M2 18h4" />
  <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
</>)
export const Trophy = svg(<>
  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
  <path d="M4 22h16" />
  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
</>)
export const Heart = svg(<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />)
export const Gauge = svg(<><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></>)
export const Ellipsis = svg(<><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>)
export const CalendarDays = svg(<>
  <path d="M8 2v4" /><path d="M16 2v4" />
  <rect width="18" height="18" x="3" y="4" rx="2" />
  <path d="M3 10h18" />
  <path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" />
  <path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" />
</>)

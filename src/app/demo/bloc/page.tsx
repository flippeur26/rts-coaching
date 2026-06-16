'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────

type TracerKey = 'prescrit' | 'reel' | 'genou' | 'hanche' | 'push-h' | 'push-v' | 'pull-h' | 'pull-v'

const TRACERS: Record<TracerKey, { color: string; label: string }> = {
  prescrit: { color: '#3b82f6', label: 'Prescrit' },
  reel:     { color: '#f59e0b', label: 'Réel' },
  genou:    { color: '#10b981', label: 'Genou' },
  hanche:   { color: '#8b5cf6', label: 'Hanche' },
  'push-h': { color: '#ef4444', label: 'Push H.' },
  'push-v': { color: '#f97316', label: 'Push V.' },
  'pull-h': { color: '#06b6d4', label: 'Pull H.' },
  'pull-v': { color: '#ec4899', label: 'Pull V.' },
}

type SerieRow = {
  id: number
  p: [string, string, string]
  r: [string, string, string]
}

type ExoData = {
  id: string
  name: string
  tag: string
  tagStyle: React.CSSProperties
  showColHeads?: boolean
}

type DayData = {
  id: string
  label: string
  date: string
  isToday?: boolean
  isRest?: boolean
  exos?: ExoData[]
  dots?: Array<{ t: TracerKey; y: string }>
}

type DeltaType = 'up' | 'down' | 'same'
type WeekCellData = {
  prescrit: string
  reel?: string
  delta?: { type: DeltaType; text: string }
  planned?: string
  isCurrent?: boolean
  isFuture?: boolean
}

type ProgRow = {
  id: string
  name: string
  tag: string
  tagStyle: React.CSSProperties
  weeks: [WeekCellData, WeekCellData, WeekCellData, WeekCellData]
  arrows: ('up' | 'none' | 'down')[]
}

// ── Static data ──────────────────────────────────────────────────────────

const INITIAL_SERIES: Record<string, SerieRow[]> = {
  squat:      [
    { id: 1, p: ['100', '5', '7'],   r: ['102', '5', '7.5'] },
    { id: 2, p: ['100', '5', '7'],   r: ['100', '5', '8']   },
    { id: 3, p: ['100', '5', '8'],   r: ['98',  '4', '9']   },
  ],
  'leg-press': [
    { id: 1, p: ['200', '10', '7'],  r: ['200', '10', '7']  },
    { id: 2, p: ['200', '10', '7'],  r: ['195', '10', '8']  },
  ],
  'pull-up':  [
    { id: 1, p: ['BW', '8', '7'],    r: ['BW', '9', '6']    },
    { id: 2, p: ['BW', '8', '8'],    r: ['BW', '7', '8']    },
  ],
  'row-barre':[
    { id: 1, p: ['70', '8', '7'],    r: ['72', '8', '7']    },
    { id: 2, p: ['70', '8', '8'],    r: ['70', '8', '8']    },
  ],
  deadlift:   [
    { id: 1, p: ['150', '4', '8'],   r: ['152', '4', '8']   },
    { id: 2, p: ['150', '4', '8'],   r: ['150', '5', '7.5'] },
  ],
  bench:      [
    { id: 1, p: ['90', '5', '7'],    r: ['90', '5', '7']    },
    { id: 2, p: ['90', '5', '7.5'],  r: ['90', '5', '7.5']  },
  ],
  ohp:        [
    { id: 1, p: ['60', '6', '7'],    r: ['60', '6', '7']    },
    { id: 2, p: ['60', '6', '7.5'],  r: ['62.5', '6', '7']  },
  ],
}

const DAYS: DayData[] = [
  {
    id: 'lun', label: 'Lun', date: '10', isToday: true,
    dots: [
      { t: 'prescrit', y: '30%' }, { t: 'reel', y: '34%' }, { t: 'genou', y: '20%' },
    ],
    exos: [
      { id: 'squat',     name: 'Squat',    tag: 'Genou',  tagStyle: { borderColor: '#10b98144', color: '#10b981', background: '#10b98112' }, showColHeads: true },
      { id: 'leg-press', name: 'Leg Press',tag: 'Genou',  tagStyle: { borderColor: '#10b98144', color: '#10b981', background: '#10b98112' } },
    ],
  },
  {
    id: 'mar', label: 'Mar', date: '11',
    dots: [
      { t: 'prescrit', y: '58%' }, { t: 'reel', y: '54%' }, { t: 'hanche', y: '36%' }, { t: 'pull-h', y: '44%' },
    ],
    exos: [
      { id: 'pull-up',   name: 'Pull-up',  tag: 'Pull V.',tagStyle: { borderColor: '#ec489944', color: '#ec4899', background: '#ec489912' } },
      { id: 'row-barre', name: 'Row Barre',tag: 'Pull H.',tagStyle: { borderColor: '#06b6d444', color: '#06b6d4', background: '#06b6d412' } },
    ],
  },
  { id: 'mer', label: 'Mer', date: '12', isRest: true },
  {
    id: 'jeu', label: 'Jeu', date: '13',
    dots: [
      { t: 'prescrit', y: '12%' }, { t: 'reel', y: '16%' }, { t: 'genou', y: '56%' }, { t: 'hanche', y: '12%' },
    ],
    exos: [
      { id: 'deadlift', name: 'Deadlift',   tag: 'Hanche', tagStyle: { borderColor: '#8b5cf644', color: '#8b5cf6', background: '#8b5cf612' } },
      { id: 'bench',    name: 'Bench Press',tag: 'Push H.',tagStyle: { borderColor: '#ef444444', color: '#ef4444', background: '#ef444412' } },
    ],
  },
  {
    id: 'ven', label: 'Ven', date: '14',
    dots: [
      { t: 'prescrit', y: '46%' }, { t: 'reel', y: '46%' }, { t: 'pull-h', y: '70%' },
    ],
    exos: [
      { id: 'ohp', name: 'OHP', tag: 'Push V.', tagStyle: { borderColor: '#f9731644', color: '#f97316', background: '#f9731612' } },
    ],
  },
  { id: 'sam', label: 'Sam', date: '15', isRest: true },
  { id: 'dim', label: 'Dim', date: '16', isRest: true },
]

const PROG_ROWS: ProgRow[] = [
  {
    id: 'squat', name: 'Squat', tag: 'Genou',
    tagStyle: { borderColor: '#10b98144', color: '#10b981', background: '#10b98110' },
    weeks: [
      { prescrit: '90×5 @7',     reel: '90×5 @7',      delta: { type: 'same', text: '=' } },
      { prescrit: '95×5 @7',     reel: '95×5 @7.5',    delta: { type: 'up',   text: '↑ +5kg' } },
      { prescrit: '100×5 @7',    reel: '102×5 @7.5',   delta: { type: 'up',   text: '↑ +7kg' }, isCurrent: true },
      { prescrit: '102.5×5 @7',  planned: '+2.5kg si critères atteints', isFuture: true },
    ],
    arrows: ['up', 'up', 'up'],
  },
  {
    id: 'leg-press', name: 'Leg Press', tag: 'Genou',
    tagStyle: { borderColor: '#10b98144', color: '#10b981', background: '#10b98110' },
    weeks: [
      { prescrit: '180×10 @7',   reel: '180×10 @7',    delta: { type: 'same', text: '=' } },
      { prescrit: '190×10 @7',   reel: '185×10 @8',    delta: { type: 'down', text: '↓ −5kg' } },
      { prescrit: '200×10 @7',   reel: '200×10 @7',    delta: { type: 'up',   text: '↑ +15kg' }, isCurrent: true },
      { prescrit: '205×10 @7',   planned: '+5kg si critères atteints', isFuture: true },
    ],
    arrows: ['up', 'none', 'up'],
  },
  {
    id: 'pull-up', name: 'Pull-up', tag: 'Pull V.',
    tagStyle: { borderColor: '#ec489944', color: '#ec4899', background: '#ec489910' },
    weeks: [
      { prescrit: 'BW×6 @7',     reel: 'BW×7 @6.5',   delta: { type: 'up',   text: '↑ +1 rep' } },
      { prescrit: 'BW×7 @7',     reel: 'BW×7 @7',      delta: { type: 'same', text: '=' } },
      { prescrit: 'BW×8 @7',     reel: 'BW×9 @6',      delta: { type: 'up',   text: '↑ +2 rep' }, isCurrent: true },
      { prescrit: '+2.5kg×8 @7', planned: 'Lestage si RPE < 7.5', isFuture: true },
    ],
    arrows: ['up', 'up', 'up'],
  },
  {
    id: 'row-barre', name: 'Row Barre', tag: 'Pull H.',
    tagStyle: { borderColor: '#06b6d444', color: '#06b6d4', background: '#06b6d410' },
    weeks: [
      { prescrit: '60×8 @7',     reel: '62.5×8 @7',   delta: { type: 'up',   text: '↑ +2.5kg' } },
      { prescrit: '65×8 @7',     reel: '65×8 @7.5',   delta: { type: 'up',   text: '↑ +2.5kg' } },
      { prescrit: '70×8 @7',     reel: '72×8 @7',      delta: { type: 'up',   text: '↑ +7kg' }, isCurrent: true },
      { prescrit: '72.5×8 @7',   planned: '+2.5kg si critères atteints', isFuture: true },
    ],
    arrows: ['up', 'up', 'up'],
  },
  {
    id: 'deadlift', name: 'Deadlift', tag: 'Hanche',
    tagStyle: { borderColor: '#8b5cf644', color: '#8b5cf6', background: '#8b5cf610' },
    weeks: [
      { prescrit: '130×4 @8',    reel: '130×4 @8',     delta: { type: 'same', text: '=' } },
      { prescrit: '140×4 @8',    reel: '142.5×4 @8',   delta: { type: 'up',   text: '↑ +12.5kg' } },
      { prescrit: '150×4 @8',    reel: '152×4 @8',      delta: { type: 'up',   text: '↑ +9.5kg' }, isCurrent: true },
      { prescrit: '155×4 @8.5',  planned: 'Deload si RPE > 8.5', isFuture: true },
    ],
    arrows: ['up', 'up', 'up'],
  },
  {
    id: 'bench', name: 'Bench Press', tag: 'Push H.',
    tagStyle: { borderColor: '#ef444444', color: '#ef4444', background: '#ef444410' },
    weeks: [
      { prescrit: '80×5 @7',     reel: '80×5 @7.5',   delta: { type: 'same', text: '=' } },
      { prescrit: '85×5 @7',     reel: '85×5 @7',      delta: { type: 'up',   text: '↑ +5kg' } },
      { prescrit: '90×5 @7',     reel: '90×5 @7',      delta: { type: 'up',   text: '↑ +5kg' }, isCurrent: true },
      { prescrit: '92.5×5 @7',   planned: '+2.5kg si critères atteints', isFuture: true },
    ],
    arrows: ['up', 'up', 'up'],
  },
  {
    id: 'ohp', name: 'OHP', tag: 'Push V.',
    tagStyle: { borderColor: '#f9731644', color: '#f97316', background: '#f9731610' },
    weeks: [
      { prescrit: '50×6 @7',     reel: '50×6 @7',      delta: { type: 'same', text: '=' } },
      { prescrit: '55×6 @7',     reel: '55×6 @7.5',   delta: { type: 'up',   text: '↑ +5kg' } },
      { prescrit: '60×6 @7',     reel: '62.5×6 @7',   delta: { type: 'up',   text: '↑ +7.5kg' }, isCurrent: true },
      { prescrit: '62.5×6 @7',   planned: '+2.5kg si critères atteints', isFuture: true },
    ],
    arrows: ['up', 'up', 'up'],
  },
]

// ── Utility ───────────────────────────────────────────────────────────────

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const mx = (p0.x + p1.x) / 2
    d += ` C${mx},${p0.y} ${mx},${p1.y} ${p1.x},${p1.y}`
  }
  return d
}

// ── CSS ────────────────────────────────────────────────────────────────────

const DEMO_CSS = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
.bd-root {
  --bg:       #080b12;
  --bg1:      #0e1320;
  --bg2:      #141c2e;
  --bg3:      #1c2540;
  --border:   #1f2b42;
  --border2:  #263249;
  --text:     #e8edf5;
  --text2:    #8898b0;
  --text3:    #445568;
  --blue:     #3b82f6;
  --yellow:   #f59e0b;
  --green:    #10b981;
  --purple:   #8b5cf6;
  --cyan:     #06b6d4;
  --pink:     #ec4899;
  --red:      #ef4444;
  --orange:   #f97316;
  --radius:   8px;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 11px;
  min-height: 100vh;
}
.bd-root .week-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg1);
  border-bottom: 1px solid var(--border);
}
.bd-root .week-nav-btn {
  width: 28px; height: 28px; border-radius: 6px;
  border: 1px solid var(--border2); background: var(--bg2);
  color: var(--text2); font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.bd-root .week-nav-btn:hover { background: var(--bg3); color: var(--text); border-color: var(--blue); }
.bd-root .week-title { text-align: center; }
.bd-root .week-title strong { font-size: 13px; color: var(--text); letter-spacing: .3px; }
.bd-root .week-title span   { font-size: 10px; color: var(--text2); display: block; margin-top: 1px; }
.bd-root .week-actions { display: flex; gap: 6px; }
.bd-root .btn-sm {
  padding: 5px 10px; border-radius: 6px; font-size: 10px; font-weight: 600;
  cursor: pointer; border: 1px solid; transition: all .15s; letter-spacing: .3px;
}
.bd-root .btn-ghost { border-color: var(--border2); background: var(--bg2); color: var(--text2); }
.bd-root .btn-ghost:hover { color: var(--text); border-color: var(--blue); }
.bd-root .btn-primary { border-color: var(--blue); background: #1d3a6e; color: var(--blue); }
.bd-root .btn-primary:hover { background: var(--blue); color: white; }

.bd-root .filters-bar {
  background: var(--bg1); border-bottom: 1px solid var(--border);
  padding: 8px 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
}
.bd-root .filter-group { display: flex; align-items: center; gap: 5px; }
.bd-root .filter-label {
  font-size: 9px; text-transform: uppercase; letter-spacing: .8px;
  color: var(--text3); margin-right: 2px; font-weight: 600;
}
.bd-root .chip {
  padding: 3px 10px; border-radius: 20px; font-size: 9px; font-weight: 600;
  cursor: pointer; border: 1px solid; display: flex; align-items: center; gap: 5px;
  transition: all .2s; letter-spacing: .3px; user-select: none;
}
.bd-root .chip-dot { width: 7px; height: 7px; border-radius: 50%; }
.bd-root .chip.on  { opacity: 1; }
.bd-root .chip.off { opacity: 0.28; filter: grayscale(40%); }
.bd-root .chip:hover { opacity: .85; }
.bd-root .c-p   { border-color:#3b82f666; color:#93c5fd; background:#1d3a6e33; }
.bd-root .c-r   { border-color:#f59e0b66; color:#fcd34d; background:#78350f33; }
.bd-root .c-gn  { border-color:#10b98166; color:#6ee7b7; background:#064e3b33; }
.bd-root .c-ha  { border-color:#8b5cf666; color:#c4b5fd; background:#2e106533; }
.bd-root .c-phh { border-color:#ef444466; color:#fca5a5; background:#7f1d1d33; }
.bd-root .c-phv { border-color:#f9731666; color:#fdba74; background:#7c2d1233; }
.bd-root .c-plh { border-color:#06b6d466; color:#67e8f9; background:#164e6333; }
.bd-root .c-plv { border-color:#ec489966; color:#f9a8d4; background:#50072433; }
.bd-root .sep { width: 1px; height: 18px; background: var(--border); }

.bd-root .main-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0;
  position: relative;
}
.bd-root .graph-legend {
  grid-column: 1 / -1;
  display: flex; gap: 14px; padding: 7px 14px;
  font-size: 9px; color: var(--text3); flex-wrap: wrap;
  background: var(--bg1); border-bottom: 1px solid var(--border);
  align-items: center;
}
.bd-root .graph-legend span { display: flex; align-items: center; gap: 5px; cursor: pointer; transition: color .15s; }
.bd-root .graph-legend span:hover { color: var(--text2); }
.bd-root .leg-line { width: 16px; height: 2px; border-radius: 1px; display: inline-block; }
.bd-root .leg-dot  { width: 6px;  height: 6px; border-radius: 50%; display: inline-block; }

.bd-root .gcell {
  height: 150px;
  background: var(--bg1);
  position: relative;
  border-right: 1px solid var(--border);
  overflow: hidden;
}
.bd-root .gcell:last-child { border-right: none; }
.bd-root .gcell.rest { background: var(--bg); }
.bd-root .gcell::after {
  content: '';
  position: absolute; inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent 36px,
    var(--bg2) 36px, var(--bg2) 37px
  );
  pointer-events: none;
}
.bd-root .gdot {
  position: absolute;
  left: 50%;
  top: var(--y);
  transform: translate(-50%, -50%);
  width: 2px; height: 2px;
  opacity: 0;
  pointer-events: none;
}
.bd-root #graph-svg {
  position: absolute;
  pointer-events: none;
  z-index: 3;
}
.bd-root .day-header {
  font-size: 10px; font-weight: 700; text-align: center;
  padding: 6px 4px; color: var(--text3); text-transform: uppercase;
  background: var(--bg2); letter-spacing: .5px;
  border-right: 1px solid var(--border);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  position: relative;
}
.bd-root .day-header:last-child { border-right: none; }
.bd-root .day-header.today { color: var(--blue); }
.bd-root .day-header.today::after {
  content: '';
  position: absolute; bottom: 0; left: 20%; right: 20%; height: 2px;
  background: var(--blue); border-radius: 2px 2px 0 0;
}
.bd-root .day-header.rest-h { color: var(--text3); opacity: .5; }

.bd-root .day-col {
  background: var(--bg1);
  padding: 10px 6px 8px;
  border-right: 1px solid var(--border);
  vertical-align: top;
  min-height: 220px;
}
.bd-root .day-col:last-child { border-right: none; }
.bd-root .day-col.rest {
  display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 5px;
  color: var(--text3); font-size: 10px; text-align: center;
  background: var(--bg);
}
.bd-root .day-col.rest .rest-icon { font-size: 22px; opacity: .4; }

.bd-root .exo-block {
  margin-bottom: 12px;
  border-radius: var(--radius);
  background: var(--bg2);
  border: 1px solid var(--border);
  overflow: hidden;
}
.bd-root .exo-head {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 7px 5px;
  border-bottom: 1px solid var(--border);
  background: var(--bg3);
}
.bd-root .exo-name {
  font-size: 10px; font-weight: 700; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.bd-root .exo-tag {
  font-size: 8px; padding: 2px 6px; border-radius: 10px;
  font-weight: 600; flex-shrink: 0; border: 1px solid;
}
.bd-root .series-zone { padding: 4px 5px 5px; }
.bd-root .col-heads {
  display: flex; gap: 2px; padding: 0 2px 2px; align-items: center;
}
.bd-root .col-heads .ch { flex:1; font-size:7px; text-align:center; font-weight:600; letter-spacing:.3px; }
.bd-root .col-heads .vs-ph { width:14px; }
.bd-root .col-heads .opt-ph { width:18px; }

.bd-root .serie-row {
  display: flex; align-items: center; gap: 2px;
  padding: 3px 2px; border-radius: 5px; margin-bottom: 2px;
  background: var(--bg1);
  border: 1px solid transparent;
  transition: border-color .15s;
}
.bd-root .serie-row:hover { border-color: var(--border2); }
.bd-root .snum {
  font-size: 8px; color: var(--text3); width: 14px;
  flex-shrink:0; text-align:center; font-weight:600;
}
.bd-root .bloc { display: flex; gap: 2px; align-items: center; flex: 1; min-width: 0; }
.bd-root .bloc.pre { border-right: 1px solid var(--border); padding-right: 2px; }
.bd-root .fld {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px; padding: 2px 1px;
  font-size: 9px; text-align: center; width: 100%; min-width: 0;
  color: var(--text); font-family: inherit;
  transition: all .15s; cursor: text;
}
.bd-root .fld:focus { outline: none; border-color: var(--border2); background: var(--bg); }
.bd-root .fld.p { color: #93c5fd; }
.bd-root .fld.r { color: #fcd34d; }
.bd-root .vs {
  font-size: 7px; color: var(--text3); flex-shrink:0;
  width:14px; text-align:center; font-weight:700;
}
.bd-root .btn-opt {
  width: 18px; height: 18px; border-radius: 4px; background: transparent;
  border: 1px solid transparent; cursor: pointer; display: flex;
  align-items: center; justify-content: center; flex-shrink: 0;
  color: var(--text3); font-size: 12px; transition: all .15s;
}
.bd-root .btn-opt:hover { background: var(--bg3); color: var(--text2); border-color: var(--border2); }
.bd-root .btn-add-serie {
  width: 100%; padding: 3px; border-radius: 4px;
  border: 1px dashed var(--border2); background: transparent;
  color: var(--text3); font-size: 9px; cursor: pointer;
  margin-top: 2px; transition: all .15s;
}
.bd-root .btn-add-serie:hover { background: var(--bg3); color: var(--text2); border-color: var(--blue); border-style: solid; }

.bd-root .section-label {
  font-size: 9px; text-transform: uppercase; letter-spacing: 1px;
  color: var(--text3); padding: 5px 14px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-weight: 700;
  display: flex; align-items: center; gap: 10px;
}
.bd-root .section-label .sl-badge {
  padding: 1px 7px; border-radius: 10px; font-size: 8px; font-weight:700;
  background: #1d3a6e; color: var(--blue); border: 1px solid #2a4a8a;
  letter-spacing: .2px;
}

.bd-root .bloc-prog { background: var(--bg); padding: 10px 10px 16px; overflow-x: auto; }
.bd-root .bloc-table {
  width: 100%; border-collapse: collapse; min-width: 560px;
}
.bd-root .bloc-table thead tr th { padding: 0; background: transparent; }
.bd-root .week-th {
  padding: 6px 6px 4px; text-align: center; position: relative;
}
.bd-root .week-th .wk-label {
  font-size: 9px; font-weight: 700; letter-spacing: .5px;
  text-transform: uppercase; color: var(--text3);
}
.bd-root .week-th .wk-dates {
  font-size: 8px; color: var(--text3); opacity: .6; margin-top: 1px; font-weight: 400;
}
.bd-root .week-th.current .wk-label { color: var(--blue); }
.bd-root .week-th.current .wk-dates { color: var(--blue); opacity: .7; }
.bd-root .week-th.current::after {
  content: '';
  position: absolute; bottom: 0; left: 15%; right: 15%; height: 2px;
  background: var(--blue); border-radius: 2px 2px 0 0;
}
.bd-root .week-th.past .wk-label { color: var(--text3); }
.bd-root .week-th.future .wk-label { color: var(--text3); }
.bd-root .week-th.future .wk-dates { opacity: .35; }
.bd-root .th-exo {
  text-align: left; padding: 6px 10px 4px; font-size: 9px;
  font-weight: 700; color: var(--text3); text-transform: uppercase;
  letter-spacing: .5px; white-space: nowrap; min-width: 110px;
}
.bd-root .exo-row { border-top: 1px solid var(--border); }
.bd-root .exo-row:first-child { border-top: none; }
.bd-root .exo-row td { padding: 8px 6px; vertical-align: top; }
.bd-root .exo-row td.td-name { padding: 8px 10px; white-space: nowrap; }
.bd-root .td-exo-name { font-size: 10px; font-weight: 700; color: var(--text); margin-bottom: 3px; }
.bd-root .td-exo-tag {
  display: inline-block; font-size: 7px; padding: 1px 5px;
  border-radius: 8px; font-weight: 600; border: 1px solid;
}
.bd-root .week-cell {
  border-left: 1px solid var(--border);
  padding: 7px 8px !important;
  position: relative;
}
.bd-root .week-cell.current-week { background: #1d3a6e18; }
.bd-root .week-cell.future-week  { opacity: .55; }
.bd-root .wc-prescrit {
  font-size: 9px; color: #93c5fd; font-weight: 600; white-space: nowrap;
  display: flex; align-items: center; gap: 4px;
}
.bd-root .wc-reel {
  font-size: 9px; color: #fcd34d; font-weight: 500; white-space: nowrap;
  margin-top: 2px; display: flex; align-items: center; gap: 4px;
}
.bd-root .wc-planned { font-size: 8px; color: var(--text3); font-style: italic; margin-top: 2px; }
.bd-root .delta {
  font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 4px;
  display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0;
}
.bd-root .delta.up   { color: #10b981; background: #10b98118; }
.bd-root .delta.down { color: #ef4444; background: #ef444418; }
.bd-root .delta.same { color: var(--text3); background: var(--bg3); }
.bd-root .arrow-col {
  width: 18px; text-align: center; padding: 0 !important;
  vertical-align: middle; color: var(--border2); font-size: 11px;
}
.bd-root .arrow-col.up-arr   { color: #10b981; }
.bd-root .arrow-col.down-arr { color: #ef4444; }
.bd-root .current-badge {
  position: absolute; top: 4px; right: 4px;
  font-size: 7px; padding: 1px 5px; border-radius: 8px;
  background: #1d3a6e; color: var(--blue); font-weight: 700;
  border: 1px solid #2a4a8a;
}
.bd-root .planned-badge {
  position: absolute; top: 4px; right: 4px;
  font-size: 7px; padding: 1px 5px; border-radius: 8px;
  background: var(--bg3); color: var(--text3); font-weight: 700;
  border: 1px solid var(--border);
}
.bd-root .exo-row:hover td { background: #ffffff04; }

.bd-root .popup-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.6);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
  opacity: 0; pointer-events: none;
  transition: opacity .2s;
}
.bd-root .popup-overlay.open { opacity: 1; pointer-events: all; }
.bd-root .popup-box {
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: 12px; padding: 18px; width: 270px;
  box-shadow: 0 24px 60px rgba(0,0,0,.6);
  transform: translateY(8px) scale(.98);
  transition: transform .2s;
}
.bd-root .popup-overlay.open .popup-box { transform: none; }
.bd-root .pop-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.bd-root .pop-title  { font-size: 12px; font-weight: 700; color: var(--text); line-height: 1.3; }
.bd-root .pop-sub    { font-size: 9px; color: var(--text2); margin-top: 2px; }
.bd-root .pop-close  {
  width: 22px; height: 22px; border-radius: 5px; border: 1px solid var(--border2);
  background: var(--bg3); color: var(--text2); font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink:0;
  transition: all .15s;
}
.bd-root .pop-close:hover { color: var(--text); background: var(--bg1); }
.bd-root .pop-sec { margin-bottom: 14px; }
.bd-root .pop-sec-lbl {
  font-size: 9px; text-transform: uppercase; letter-spacing: .8px;
  color: var(--text3); margin-bottom: 8px; font-weight: 700;
  display: flex; align-items: center; gap: 6px;
}
.bd-root .pop-sec-lbl::after { content:''; flex:1; height:1px; background:var(--border); }
.bd-root .pop-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.bd-root .pop-row label { font-size: 10px; color: var(--text2); flex: 1; }
.bd-root .pop-input {
  width: 52px; background: var(--bg1); border: 1px solid var(--border2);
  border-radius: 5px; padding: 4px 6px; color: var(--text); font-size: 10px;
  text-align: center; font-family: inherit; transition: border-color .15s;
}
.bd-root .pop-input:focus { outline: none; border-color: var(--blue); }
.bd-root .pop-select {
  background: var(--bg1); border: 1px solid var(--border2); border-radius: 5px;
  padding: 3px 5px; color: var(--text2); font-size: 9px; font-family: inherit;
}
.bd-root .pop-copy-btn {
  width: 100%; padding: 7px 10px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg1);
  color: var(--text2); font-size: 10px; cursor: pointer; margin-top: 5px;
  text-align: left; transition: all .15s; font-family: inherit;
  display: flex; align-items: center; gap: 7px;
}
.bd-root .pop-copy-btn:hover { background: var(--bg3); color: var(--text); border-color: var(--blue); }
.bd-root .pop-copy-btn .copy-icon { font-size: 12px; }
.bd-root .pop-footer { display: flex; gap: 6px; margin-top: 14px; }
.bd-root .btn-cancel {
  flex:1; padding: 7px; border-radius: 6px; border: 1px solid var(--border);
  background: transparent; color: var(--text3); font-size: 10px;
  cursor: pointer; font-family: inherit; transition: all .15s;
}
.bd-root .btn-cancel:hover { color: var(--text); border-color: var(--border2); }
.bd-root .btn-save {
  flex:1; padding: 7px; border-radius: 6px; border: none;
  background: var(--blue); color: white; font-size: 10px;
  cursor: pointer; font-weight: 700; font-family: inherit; transition: all .15s;
}
.bd-root .btn-save:hover { background: #2563eb; }
`

// ── Sub-components ────────────────────────────────────────────────────────

function SeriesZone({
  exoId,
  exoName,
  series,
  showColHeads,
  onOpenPopup,
  onAdd,
  onUpdate,
}: {
  exoId: string
  exoName: string
  series: SerieRow[]
  showColHeads?: boolean
  onOpenPopup: (exo: string, serie: number) => void
  onAdd: (exoId: string) => void
  onUpdate: (exoId: string, id: number, side: 'p' | 'r', idx: 0 | 1 | 2, val: string) => void
}) {
  return (
    <div className="series-zone">
      {showColHeads && (
        <div className="col-heads">
          <div className="ch" style={{ color: '#3b82f6aa' }}>ch</div>
          <div className="ch" style={{ color: '#3b82f6aa' }}>rep</div>
          <div className="ch" style={{ color: '#3b82f6aa' }}>RPE</div>
          <div className="vs-ph" />
          <div className="ch" style={{ color: '#f59e0baa' }}>ch</div>
          <div className="ch" style={{ color: '#f59e0baa' }}>rep</div>
          <div className="ch" style={{ color: '#f59e0baa' }}>RPE</div>
          <div className="opt-ph" />
        </div>
      )}
      {series.map((row) => (
        <div className="serie-row" key={row.id}>
          <div className="snum">S{row.id}</div>
          <div className="bloc pre">
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                className="fld p"
                value={row.p[i]}
                onChange={(e) => onUpdate(exoId, row.id, 'p', i, e.target.value)}
              />
            ))}
          </div>
          <div className="vs">vs</div>
          <div className="bloc">
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                className="fld r"
                value={row.r[i]}
                onChange={(e) => onUpdate(exoId, row.id, 'r', i, e.target.value)}
              />
            ))}
          </div>
          <button
            className="btn-opt"
            onClick={() => onOpenPopup(exoName, row.id)}
          >
            ⋯
          </button>
        </div>
      ))}
      <button className="btn-add-serie" onClick={() => onAdd(exoId)}>
        + Série
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function BlocToolDemo() {
  const [activeTracers, setActiveTracers] = useState<Set<TracerKey>>(
    new Set(['prescrit', 'reel', 'genou', 'hanche', 'pull-h'])
  )
  const [popupOpen, setPopupOpen]   = useState(false)
  const [popupTitle, setPopupTitle] = useState('Options — Squat · Série 1')
  const [allSeries, setAllSeries]   = useState<Record<string, SerieRow[]>>(INITIAL_SERIES)

  const gridRef = useRef<HTMLDivElement>(null)
  const svgRef  = useRef<SVGSVGElement | null>(null)

  const buildGraph = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return

    if (svgRef.current) { svgRef.current.remove(); svgRef.current = null }

    const gcells = grid.querySelectorAll('.gcell')
    if (!gcells.length) return

    const first = gcells[0].getBoundingClientRect()
    const last  = gcells[gcells.length - 1].getBoundingClientRect()
    const gridR = grid.getBoundingClientRect()

    const L = first.left - gridR.left
    const T = first.top  - gridR.top
    const W = last.right - first.left
    const H = first.height

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.id = 'graph-svg'
    svg.style.cssText = `position:absolute;left:${L}px;top:${T}px;width:${W}px;height:${H}px;pointer-events:none;z-index:3`
    svgRef.current = svg

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    Object.entries(TRACERS).forEach(([key, { color }]) => {
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
      grad.setAttribute('id', `grad-${key}`)
      grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0')
      grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1')
      const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
      s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', color); s1.setAttribute('stop-opacity', '0.18')
      const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
      s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', color); s2.setAttribute('stop-opacity', '0')
      grad.appendChild(s1); grad.appendChild(s2)
      defs.appendChild(grad)
    })
    svg.appendChild(defs)
    grid.appendChild(svg)

    Object.entries(TRACERS).forEach(([key, { color }]) => {
      if (!activeTracers.has(key as TracerKey)) return

      const dots = [...grid.querySelectorAll(`.gdot[data-t="${key}"]`)]
      if (!dots.length) return

      const pts = dots
        .map((d) => {
          const r = d.getBoundingClientRect()
          return { x: r.left + r.width / 2 - first.left, y: r.top + r.height / 2 - first.top }
        })
        .filter((p) => p.x >= 0 && p.x <= W)

      if (!pts.length) return

      const pathD = smoothPath(pts)

      if (pts.length >= 2) {
        const areaD = `${pathD} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`
        const area = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        area.setAttribute('d', areaD)
        area.setAttribute('fill', `url(#grad-${key})`)
        svg.appendChild(area)
      }

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      line.setAttribute('d', pathD); line.setAttribute('fill', 'none')
      line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2')
      line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round')
      svg.appendChild(line)

      pts.forEach(({ x, y }) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); c.setAttribute('r', '4')
        c.setAttribute('fill', color); c.setAttribute('stroke', '#0e1320'); c.setAttribute('stroke-width', '2')
        svg.appendChild(c)
      })
    })
  }, [activeTracers])

  useEffect(() => { buildGraph() }, [buildGraph])
  useEffect(() => {
    window.addEventListener('resize', buildGraph)
    return () => window.removeEventListener('resize', buildGraph)
  }, [buildGraph])

  const toggleTracer = (key: TracerKey) => {
    setActiveTracers((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openPopup = (exo: string, serie: number) => {
    setPopupTitle(`Options — ${exo} · Série ${serie}`)
    setPopupOpen(true)
  }

  const addSerie = (exoId: string) => {
    setAllSeries((prev) => {
      const rows = prev[exoId] ?? []
      return { ...prev, [exoId]: [...rows, { id: rows.length + 1, p: ['', '', ''], r: ['', '', ''] }] }
    })
  }

  const updateSerie = (exoId: string, id: number, side: 'p' | 'r', idx: 0 | 1 | 2, val: string) => {
    setAllSeries((prev) => ({
      ...prev,
      [exoId]: (prev[exoId] ?? []).map((row) => {
        if (row.id !== id) return row
        const arr = [...row[side]] as [string, string, string]
        arr[idx] = val
        return { ...row, [side]: arr }
      }),
    }))
  }

  // Chip filter definitions
  const CHIPS: Array<{ key: TracerKey; cls: string; dotColor: string; label: string; group: 'traceurs' | 'patterns' }> = [
    { key: 'prescrit', cls: 'c-p',   dotColor: '#3b82f6', label: 'Prescrit', group: 'traceurs' },
    { key: 'reel',     cls: 'c-r',   dotColor: '#f59e0b', label: 'Réel',     group: 'traceurs' },
    { key: 'genou',    cls: 'c-gn',  dotColor: '#10b981', label: 'Genou',    group: 'patterns' },
    { key: 'hanche',   cls: 'c-ha',  dotColor: '#8b5cf6', label: 'Hanche',   group: 'patterns' },
    { key: 'push-h',   cls: 'c-phh', dotColor: '#ef4444', label: 'Push H.',  group: 'patterns' },
    { key: 'push-v',   cls: 'c-phv', dotColor: '#f97316', label: 'Push V.',  group: 'patterns' },
    { key: 'pull-h',   cls: 'c-plh', dotColor: '#06b6d4', label: 'Pull H.',  group: 'patterns' },
    { key: 'pull-v',   cls: 'c-plv', dotColor: '#ec4899', label: 'Pull V.',  group: 'patterns' },
  ]

  const legendTracers: TracerKey[] = ['prescrit', 'reel', 'genou', 'hanche', 'pull-h']

  return (
    <div className="bd-root">
      <style dangerouslySetInnerHTML={{ __html: DEMO_CSS }} />

      {/* ── HEADER ── */}
      <div className="week-header">
        <button className="week-nav-btn">&#8592;</button>
        <div className="week-title">
          <strong>Semaine 3 — Bloc Hypertrophie</strong>
          <span>10 – 16 Juin 2026 &nbsp;·&nbsp; Mésocycle 2 / 4</span>
        </div>
        <div className="week-actions">
          <button className="btn-sm btn-ghost">Exporter</button>
          <button className="btn-sm btn-primary">+ Exercice</button>
        </div>
      </div>

      {/* ── FILTRES ── */}
      <div className="filters-bar">
        <div className="filter-group">
          <span className="filter-label">Traceurs</span>
          {CHIPS.filter((c) => c.group === 'traceurs').map((chip) => (
            <div
              key={chip.key}
              className={`chip ${chip.cls} ${activeTracers.has(chip.key) ? 'on' : 'off'}`}
              onClick={() => toggleTracer(chip.key)}
            >
              <span className="chip-dot" style={{ background: chip.dotColor }} />
              {chip.label}
            </div>
          ))}
        </div>
        <div className="sep" />
        <div className="filter-group">
          <span className="filter-label">Patterns</span>
          {CHIPS.filter((c) => c.group === 'patterns').map((chip) => (
            <div
              key={chip.key}
              className={`chip ${chip.cls} ${activeTracers.has(chip.key) ? 'on' : 'off'}`}
              onClick={() => toggleTracer(chip.key)}
            >
              <span className="chip-dot" style={{ background: chip.dotColor }} />
              {chip.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN GRID ── */}
      <div className="main-grid" ref={gridRef}>

        {/* Légende */}
        <div className="graph-legend">
          {legendTracers.map((key) => (
            <span
              key={key}
              data-tracer={key}
              style={{ opacity: activeTracers.has(key) ? 1 : 0.25 }}
            >
              <div className="leg-line" style={{ background: TRACERS[key].color }} />
              <div className="leg-dot"  style={{ background: TRACERS[key].color }} />
              {TRACERS[key].label}
            </span>
          ))}
        </div>

        {/* Graph cells */}
        {DAYS.map((day) => (
          <div
            key={`gc-${day.id}`}
            className={`gcell${day.isRest ? ' rest' : ''}`}
          >
            {(day.dots ?? []).map((dot, i) => (
              <div
                key={i}
                className="gdot"
                data-t={dot.t}
                style={{ '--y': dot.y } as React.CSSProperties}
              />
            ))}
          </div>
        ))}

        {/* Day headers */}
        {DAYS.map((day) => (
          <div
            key={`dh-${day.id}`}
            className={`day-header${day.isToday ? ' today' : ''}${day.isRest ? ' rest-h' : ''}`}
          >
            {day.label}
            <br />
            <span style={{ fontSize: '9px', fontWeight: 400, color: day.isToday ? 'inherit' : 'var(--text3)', opacity: .7 }}>
              {day.date}
            </span>
          </div>
        ))}

        {/* Day columns */}
        {DAYS.map((day) => {
          if (day.isRest) {
            return (
              <div key={`dc-${day.id}`} className="day-col rest">
                <div className="rest-icon">🌙</div>
                <span>Repos</span>
              </div>
            )
          }
          return (
            <div key={`dc-${day.id}`} className="day-col">
              {(day.exos ?? []).map((exo) => (
                <div className="exo-block" key={exo.id}>
                  <div className="exo-head">
                    <div className="exo-name">{exo.name}</div>
                    <span className="exo-tag" style={exo.tagStyle}>{exo.tag}</span>
                  </div>
                  <SeriesZone
                    exoId={exo.id}
                    exoName={exo.name}
                    series={allSeries[exo.id] ?? []}
                    showColHeads={exo.showColHeads}
                    onOpenPopup={openPopup}
                    onAdd={addSerie}
                    onUpdate={updateSerie}
                  />
                </div>
              ))}
            </div>
          )
        })}

      </div>

      {/* ── PROGRESSION BLOC ── */}
      <div className="section-label">
        Progression du bloc — tous exercices
        <span className="sl-badge">Bloc Hypertrophie · 4 semaines</span>
      </div>
      <div className="bloc-prog">
        <table className="bloc-table">
          <thead>
            <tr>
              <th className="th-exo">Exercice</th>
              <th className="week-th past">
                <div className="wk-label">Semaine 1</div>
                <div className="wk-dates">20 – 26 Mai</div>
              </th>
              <th className="arrow-col" />
              <th className="week-th past">
                <div className="wk-label">Semaine 2</div>
                <div className="wk-dates">27 Mai – 2 Jun</div>
              </th>
              <th className="arrow-col" />
              <th className="week-th current">
                <div className="wk-label">Semaine 3</div>
                <div className="wk-dates">10 – 16 Jun</div>
              </th>
              <th className="arrow-col" />
              <th className="week-th future">
                <div className="wk-label">Semaine 4</div>
                <div className="wk-dates">17 – 23 Jun</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {PROG_ROWS.map((row) => (
              <tr className="exo-row" key={row.id}>
                <td className="td-name">
                  <div className="td-exo-name">{row.name}</div>
                  <span className="td-exo-tag" style={row.tagStyle}>{row.tag}</span>
                </td>

                {row.weeks.map((wk, wi) => {
                  const arrowDir = wi < 3 ? row.arrows[wi] : null
                  return (
                    <React.Fragment key={wi}>
                      <td
                        className={`week-cell${wk.isCurrent ? ' current-week' : ''}${wk.isFuture ? ' future-week' : ''}`}
                      >
                        {wk.isCurrent && <div className="current-badge">En cours</div>}
                        {wk.isFuture  && <div className="planned-badge">Planifié</div>}
                        <div className="wc-prescrit">{wk.prescrit}</div>
                        {wk.reel && (
                          <div className="wc-reel">
                            {wk.reel}
                            {wk.delta && (
                              <span className={`delta ${wk.delta.type}`}>{wk.delta.text}</span>
                            )}
                          </div>
                        )}
                        {wk.planned && <div className="wc-planned">{wk.planned}</div>}
                      </td>
                      {arrowDir !== null && (
                        <td
                          className={`arrow-col${arrowDir === 'up' ? ' up-arr' : arrowDir === 'down' ? ' down-arr' : ''}`}
                        >
                          →
                        </td>
                      )}
                    </React.Fragment>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── POPUP ── */}
      <div
        className={`popup-overlay${popupOpen ? ' open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setPopupOpen(false) }}
      >
        <div className="popup-box">
          <div className="pop-header">
            <div>
              <div className="pop-title">{popupTitle}</div>
              <div className="pop-sub">Critères appliqués à la semaine suivante</div>
            </div>
            <button className="pop-close" onClick={() => setPopupOpen(false)}>✕</button>
          </div>

          <div className="pop-sec">
            <div className="pop-sec-lbl">Progression N+1</div>
            <div className="pop-row">
              <label>Charge</label>
              <input className="pop-input" defaultValue="+2.5" />
              <select className="pop-select"><option>kg</option><option>%</option></select>
            </div>
            <div className="pop-row">
              <label>Répétitions</label>
              <input className="pop-input" defaultValue="+0" />
              <select className="pop-select"><option>reps</option></select>
            </div>
            <div className="pop-row">
              <label>Séries</label>
              <input className="pop-input" defaultValue="+0" />
              <select className="pop-select"><option>séries</option></select>
            </div>
            <div className="pop-row">
              <label>ROM</label>
              <input className="pop-input" defaultValue="=" />
              <select className="pop-select"><option>maintenu</option><option>+</option><option>−</option></select>
            </div>
            <div className="pop-row">
              <label>RPE cible</label>
              <input className="pop-input" defaultValue="7" />
              <select className="pop-select"><option>fixe</option><option>range</option></select>
            </div>
          </div>

          <div className="pop-sec">
            <div className="pop-sec-lbl">Copier vers les séries suivantes</div>
            <button className="pop-copy-btn"><span className="copy-icon">📋</span> Avec écrasement (remplace les valeurs)</button>
            <button className="pop-copy-btn"><span className="copy-icon">📄</span> Sans écrasement (complète les vides)</button>
          </div>

          <div className="pop-footer">
            <button className="btn-cancel" onClick={() => setPopupOpen(false)}>Annuler</button>
            <button className="btn-save" onClick={() => setPopupOpen(false)}>Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  )
}

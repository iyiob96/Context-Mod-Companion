// Variant A "chibi": full-body Yemeni man, 24x40, transparent background.
// Pure data module, no imports.

export type Mood = 'happy' | 'normal' | 'worried' | 'devastated'
export type Pose = 'rest' | 'wave'

export const WIDTH = 24
export const HEIGHT = 40

// one char per key -> '#rrggbb'. '.' = transparent (not in PALETTE).
export const PALETTE: Record<string, string> = {
  K: '#1a1210', // outline / pupils
  R: '#9a1f2a', // turban red
  r: '#651219', // turban shade
  G: '#f0b03a', // embroidery gold
  g: '#c46d1c', // embroidery orange
  H: '#231814', // hair / beard / brows
  S: '#d29467', // skin
  s: '#ad6f45', // skin shade
  n: '#e8786a', // blush
  W: '#f7f5ef', // white cloth / eye white / teeth
  w: '#c4c7cf', // white shade
  L: '#7a3f1f', // leather
  l: '#4c2412', // dark leather
  Y: '#f2c94c', // gold studs / brass
  J: '#3a2418', // jambiya handle
  A: '#ecd2a8', // jambiya sheath
  a: '#c09a68', // sheath shade
  M: '#7c2620', // lips / mouth line
  m: '#3d0d0d', // mouth interior
  t: '#e0707a', // tongue
  D: '#4aa8ee', // tears / sweat
  d: '#b6e4ff', // tear highlight
  k: '#34343c', // socks / shoes
  v: '#6a6a78', // shoe highlight
}

export const SKIN = PALETTE.S

// Eye rects for the blink overlay (normal head position; devastated head is 1 row lower).
export const EYES: { x: number; y: number; w: number; h: number }[] = [
  { x: 7, y: 11, w: 3, h: 2 },
  { x: 14, y: 11, w: 3, h: 2 },
]

type Grid = string[][]

function blank(): Grid {
  const g: Grid = []
  for (let y = 0; y < HEIGHT; y++) {
    const row: string[] = []
    for (let x = 0; x < WIDTH; x++) row.push('.')
    g.push(row)
  }
  return g
}
// Drawing coordinates are shifted down 1 row so the outline fits above the turban.
function px(g: Grid, x: number, y0: number, c: string): void {
  const y = y0 + 1
  if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) g[y]![x] = c
}
function rect(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(g, x, y, c)
}
function span(g: Grid, y: number, x0: number, x1: number, c: string): void {
  rect(g, x0, y, x1, y, c)
}
function mspan(g: Grid, y: number, x0: number, x1: number, c: string): void {
  span(g, y, x0, x1, c)
  span(g, y, WIDTH - 1 - x1, WIDTH - 1 - x0, c)
}
function stamp(g: Grid, x0: number, y0: number, rows: string[]): void {
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y]!.length; x++) {
      const c = rows[y]![x]
      if (c !== '.') px(g, x0 + x, y0 + y, c!)
    }
}

function drawLegs(g: Grid): void {
  // wizar (long white skirt) down to the shins
  rect(g, 3, 26, 20, 31, 'W')
  rect(g, 4, 32, 19, 33, 'W')
  span(g, 33, 4, 19, 'w')
  for (let y = 27; y <= 32; y++) px(g, 8, y, 'w')
  for (let y = 29; y <= 32; y++) px(g, 16, y, 'w')
  // black socks + loafers
  rect(g, 6, 34, 8, 35, 'k')
  rect(g, 15, 34, 17, 35, 'k')
  stamp(g, 4, 36, ['.kkkk', 'kkkkk'])
  stamp(g, 15, 36, ['kkkk.', 'kkkkk'])
  px(g, 5, 36, 'v')
  px(g, 18, 36, 'v')
}

function drawTorso(g: Grid, slump: boolean, wave: boolean): void {
  const o = slump ? 1 : 0
  // puffy raised shoulders (flattened when slumped)
  if (!slump) {
    mspan(g, 15, 2, 5, 'W')
    mspan(g, 16, 1, 6, 'W')
    mspan(g, 15, 5, 5, 'w')
  } else {
    mspan(g, 16, 2, 5, 'W')
  }
  mspan(g, 17, 1, 8, 'W')
  rect(g, 1, 18, 22, 25, 'W')
  mspan(g, 18 + o, 1, 2, 'w')
  // arm seams
  for (let y = 19; y <= 25; y++) {
    px(g, 3, y, 'w')
    px(g, 20, y, 'w')
  }
  // neck + collar
  rect(g, 9, 16, 14, 18, 'S')
  span(g, 17, 9, 14, 's')
  mspan(g, 18, 8, 9, 'W')
  span(g, 19, 10, 13, 'w')

  // crossed bandoliers
  for (let y = 17; y <= 23; y++) {
    const x0 = 3 + 2 * (y - 17)
    span(g, y, x0 - 1, x0 + 3, 'l')
    span(g, y, x0, x0 + 2, 'L')
    px(g, x0 + 1, y, 'Y')
  }
  for (let y = 17; y <= 23; y++) {
    const x0 = WIDTH - 1 - (3 + 2 * (y - 17)) - 2
    span(g, y, x0 - 1, x0 + 3, 'l')
    span(g, y, x0, x0 + 2, 'L')
    if (y % 2 === 0) px(g, x0 + 1, y, 'Y')
  }

  // belt with brass cartridges
  span(g, 23, 1, 22, 'l')
  span(g, 24, 1, 22, 'L')
  span(g, 25, 1, 22, 'l')
  for (let x = 2; x < WIDTH; x += 2) px(g, x, 24, 'Y')
  for (const x of [2, 4, 6, 17, 19, 21]) {
    px(g, x, 21, 'g')
    px(g, x, 22, 'Y')
  }

  // jambiya
  stamp(g, 9, 19, [
    'KKKKKK..',
    'KYYYYK..',
    '.KJJK...',
    '.KJJK...',
    'KYJJYK..',
    'KAAAAK..',
    'KAAAAaK.',
    '.KAAAAaK',
    '..KKAAaK',
    '....KKK.',
  ])

  if (!slump) {
    // his right hand gripping the jambiya handle (viewer left)
    stamp(g, 4, 20, ['.wwwKSSSK', 'wwwwKSSsK', '.KKKKKKK.'])
    // other arm hanging, hand at the side (raised instead when waving)
    if (!wave) {
      rect(g, 21, 26, 22, 27, 'S')
      px(g, 21, 27, 's')
    }
  } else {
    // both arms hanging limp
    rect(g, 1, 26, 2, 27, 'S')
    px(g, 2, 27, 's')
    if (!wave) {
      rect(g, 21, 26, 22, 27, 'S')
      px(g, 21, 27, 's')
    }
  }
}

function drawHead(g: Grid, dy: number): void {
  const y = (v: number) => v + dy
  // face
  rect(g, 5, y(8), 18, y(15), 'S')
  span(g, y(16), 6, 17, 'S')
  span(g, y(17), 8, 15, 'S')
  px(g, 5, y(15), 's')
  px(g, 18, y(15), 's')
  px(g, 6, y(16), 's')
  px(g, 17, y(16), 's')
  // ears
  px(g, 4, y(10), 'S')
  px(g, 4, y(11), 's')
  px(g, 19, y(10), 'S')
  px(g, 19, y(11), 's')
  // nose
  px(g, 12, y(11), 's')
  span(g, y(12), 11, 12, 's')
  // curly hair at the sides
  stamp(g, 3, y(8), ['HH', 'H.', '..', '..', 'HH', '.H'])
  stamp(g, 19, y(8), ['H', 'H'])
  // mustache + beard line + goatee
  span(g, y(13), 9, 14, 'H')
  px(g, 9, y(14), 'H')
  px(g, 14, y(14), 'H')
  px(g, 9, y(15), 'H')
  px(g, 14, y(15), 'H')
  span(g, y(16), 10, 13, 'H')
  span(g, y(17), 10, 13, 'H')
  span(g, y(18), 11, 12, 'H')

  // turban
  span(g, y(0), 8, 15, 'R')
  span(g, y(1), 6, 17, 'R')
  rect(g, 4, y(2), 19, y(6), 'R')
  span(g, y(7), 5, 18, 'r')
  stamp(g, 7, y(1), [
    '.gGGggGGg.',
    'gGgGGGGgGg',
    'GgGgGGgGgG',
    '.gGgggGgg.',
  ])
  span(g, y(5), 4, 19, 'r')
  rect(g, 18, y(2), 19, y(4), 'r')
  for (let x = 5; x <= 18; x += 2) px(g, x, y(6), 'G')
  // wrap tail draping beside the neck (viewer right)
  rect(g, 19, y(6), 21, y(15), 'R')
  rect(g, 18, y(13), 22, y(17), 'R')
  for (let v = 7; v <= 17; v++) px(g, 21, y(v), 'r')
  px(g, 20, y(10), 'g')
  px(g, 19, y(14), 'g')
  px(g, 21, y(16), 'G')
}

// His left arm (viewer right) raised with an open palm beside the turban: "salam".
function drawWave(g: Grid, dy: number): void {
  stamp(g, 16, 1 + dy, [
    '..K.K.K.',
    '.KSKSKSK',
    '.KSKSKSK',
    'KKSSSSSK',
    'KSSSSSsK',
    '.KKSSSsK',
    '..KsSSsK',
    '..KKWWWK',
    '...KWWWK',
    '...KWWWK',
    '...KWWWK',
    '...KWWWK',
    '...KwWWK',
    '...KwWWK',
    '...KwWWK',
    '...KwWWK',
  ])
}

function drawFace(g: Grid, mood: Mood, dy: number): void {
  const y = (v: number) => v + dy
  if (mood === 'happy') {
    span(g, y(8), 7, 9, 'H')
    span(g, y(8), 14, 16, 'H')
    stamp(g, 7, y(10), ['.K.', 'K.K'])
    stamp(g, 14, y(10), ['.K.', 'K.K'])
    span(g, y(12), 5, 7, 'n')
    span(g, y(12), 16, 18, 'n')
    px(g, 8, y(13), 'H')
    px(g, 15, y(13), 'H')
    stamp(g, 9, y(14), ['MWWWWM', '.MmmM.'])
  } else if (mood === 'normal') {
    span(g, y(9), 7, 9, 'H')
    span(g, y(9), 14, 16, 'H')
    stamp(g, 7, y(10), ['WKK', 'WKK'])
    stamp(g, 14, y(10), ['KKW', 'KKW'])
    stamp(g, 10, y(14), ['M..M', '.MM.'])
  } else if (mood === 'worried') {
    stamp(g, 7, y(8), ['..H', 'HH.'])
    stamp(g, 14, y(8), ['H..', '.HH'])
    stamp(g, 7, y(10), ['WKW', 'WKW'])
    stamp(g, 14, y(10), ['WKW', 'WKW'])
    stamp(g, 10, y(14), ['.M.M', 'M.M.'])
    stamp(g, 17, y(8), ['.d', 'dD', 'DD'])
  } else {
    stamp(g, 7, y(8), ['..H', '.H.', 'H..'])
    stamp(g, 14, y(8), ['H..', '.H.', '..H'])
    stamp(g, 7, y(10), ['.KK', 'KDD'])
    stamp(g, 14, y(10), ['KK.', 'DDK'])
    for (let v = 12; v <= 16; v++) {
      px(g, 7, y(v), v % 2 ? 'd' : 'D')
      px(g, 16, y(v), v % 2 ? 'd' : 'D')
    }
    stamp(g, 10, y(14), ['MmmM', 'mttm', 'MMMM'])
  }
}

// Transparent pixels touching the figure (8-neighbourhood) become outline.
function outline(g: Grid): void {
  const out: [number, number][] = []
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      if (g[y]![x] !== '.') continue
      let hit = false
      for (let dy = -1; dy <= 1 && !hit; dy++)
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          if (!dx && !dy) continue
          if (dx && dy) continue // 4-neighbourhood keeps corners crisp
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue
          const c = g[ny]![nx]
          if (c !== '.' && c !== 'K') hit = true
        }
      if (hit) out.push([x, y])
    }
  for (const [x, y] of out) g[y]![x] = 'K'
}

export function characterGrid(mood: Mood, pose: Pose = 'rest'): string[] {
  const g = blank()
  const slump = mood === 'devastated'
  const wave = pose === 'wave'
  const dy = slump ? 1 : 0
  drawLegs(g)
  drawTorso(g, slump, wave)
  drawHead(g, dy)
  if (wave) drawWave(g, dy)
  drawFace(g, mood, dy)
  outline(g)
  return g.map((row) => row.join(''))
}

function selfCheck(): void {
  for (const m of ['happy', 'normal', 'worried', 'devastated'] as Mood[]) {
    for (const pose of ['rest', 'wave'] as Pose[]) {
      const rows = characterGrid(m, pose)
      const id = `${m}/${pose}`
      if (rows.length !== HEIGHT) throw new Error(`character: ${id} has ${rows.length} rows`)
      rows.forEach((r, y) => {
        if (r.length !== WIDTH) throw new Error(`character: ${id} row ${y} has ${r.length} chars`)
        for (const ch of r) if (ch !== '.' && !(ch in PALETTE)) throw new Error(`character: ${id} row ${y} bad key '${ch}'`)
      })
    }
  }
}
selfCheck()

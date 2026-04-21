import { layoutNextLine, prepareWithSegments } from '@chenglou/pretext'

const ROOT_ID = 'cat-demo-v2'
const FONT = "16px Georgia, 'Times New Roman', serif"
const LINE_HEIGHT = 28
const COLUMN_WIDTH = 660
const MIN_WRAP_GAP = 6

const CAT_FRAME_COUNT = 12
const CAT_DISPLAY_HEIGHT = 140
const CAT_DISPLAY_WIDTH = Math.round(CAT_DISPLAY_HEIGHT * 340.2 / 226.8)
const BASE_CAT_SPEED = 150
const BASE_CAT_FRAME_MS = 80
const CAT_Y_LINE = 5 // cat top aligns with this line index

function getCatFramePath(i) {
  return `${import.meta.env.BASE_URL}cat/cat_1-${String(i + 1).padStart(2, '0')}.svg`
}

const LOREM_BLOCK = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer ut felis at nunc luctus tempus. Suspendisse hendrerit, nisl vitae dictum vulputate, massa elit commodo nisi, ac volutpat nibh velit sed erat. Nunc viverra bibendum luctus. Fusce a nisl in nisi gravida convallis. Cras condimentum, ante vitae porttitor faucibus, nibh mauris faucibus urna, at placerat dui magna a sem. Curabitur eget magna vitae neque sollicitudin varius.

Sed egestas bibendum ipsum, id laoreet ligula pharetra in. Integer rutrum, risus non accumsan cursus, ipsum mauris facilisis sem, quis posuere justo odio et justo. Etiam laoreet sem ut purus posuere tristique. Vivamus et sem ut ante vulputate viverra. Pellentesque pulvinar ullamcorper orci, ac ultricies purus eleifend sed. Mauris mattis ipsum nec erat efficitur tristique.

Praesent in aliquet purus. Vestibulum viverra lectus nec lacus volutpat, id aliquet arcu ultricies. Donec et sem ac neque varius suscipit. Aliquam fermentum eu ipsum et ultrices. In fermentum feugiat lectus, vel volutpat mi efficitur in. Proin ac lectus commodo, faucibus erat id, sagittis dolor. Pellentesque sed dui neque.

Mauris pellentesque sapien vitae neque laoreet, nec vehicula purus viverra. Quisque vel sapien sit amet nibh tincidunt tristique. Etiam tincidunt, nisi at efficitur tempor, justo nibh feugiat lorem, ac feugiat risus magna at eros. Integer vel eros in magna ultricies suscipit. Sed ac ipsum massa. Morbi at aliquam risus. Donec lobortis suscipit velit, at feugiat dui consectetur sit amet. In ac dui dapibus, fringilla nibh at, porta ex.

Fusce aliquam pulvinar turpis vel varius. Aliquam malesuada feugiat lacus at pretium. Morbi tincidunt, risus ut varius vulputate, neque neque faucibus eros, non luctus justo turpis id magna. Vestibulum interdum justo in sem laoreet tristique. Maecenas vulputate elementum lacus, sed porttitor justo commodo in. Aenean luctus vulputate molestie. Nam suscipit nisi in lectus convallis tristique. Sed vel cursus leo.

Nulla varius suscipit dui non aliquet. Pellentesque accumsan est vel dolor aliquam, vel congue nisl ultrices. Etiam efficitur, libero non feugiat cursus, lacus tortor volutpat velit, sed luctus enim augue ac lorem. Phasellus rhoncus augue in nibh malesuada, sit amet varius leo volutpat. Cras eget urna malesuada, vestibulum purus id, luctus augue. Nunc at nibh non sem luctus faucibus. Donec placerat ligula nec tortor cursus, a tempus magna feugiat.

Cras id diam venenatis, aliquam lorem sed, tristique est. In hac habitasse platea dictumst. Donec at leo feugiat, vulputate libero et, tincidunt tellus. Pellentesque iaculis risus ut ipsum feugiat auctor. Vivamus volutpat libero non lacinia auctor. Curabitur facilisis tristique dui, vel sagittis justo scelerisque a. Donec facilisis justo non justo faucibus suscipit.

Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Donec velit neque, auctor sit amet aliquam vel, ullamcorper sit amet ligula. Nulla quis lorem ut libero malesuada feugiat. Proin eget tortor risus. Curabitur aliquet quam id dui posuere blandit. Nulla porttitor accumsan tincidunt. Vivamus magna justo, lacinia eget consectetur sed, convallis at tellus.

Pellentesque in ipsum id orci porta dapibus. Curabitur non nulla sit amet nisl tempus convallis quis ac lectus. Sed porttitor lectus nibh. Donec sollicitudin molestie malesuada. Quisque velit nisi, pretium ut lacinia in, elementum id enim. Mauris blandit aliquet elit, eget tincidunt nibh pulvinar a. Vestibulum ac diam sit amet quam vehicula elementum sed sit amet dui.

Cras ultricies ligula sed magna dictum porta. Proin eget tortor risus. Curabitur arcu erat, accumsan id imperdiet et, porttitor at sem. Nulla porttitor accumsan tincidunt. Mauris blandit aliquet elit, eget tincidunt nibh pulvinar a. Vivamus suscipit tortor eget felis porttitor volutpat. Quisque velit nisi, pretium ut lacinia in, elementum id enim.
`.replace(/\s+/g, ' ').trim()

const LOREM_IPSUM = Array(3).fill(LOREM_BLOCK).join(' ')

const prepared = prepareWithSegments(LOREM_IPSUM, FONT)
const measureCtx = document.createElement('canvas').getContext('2d')
if (!measureCtx) throw new Error('Canvas 2D not available')
measureCtx.font = FONT

// --- DOM setup ---

const root = document.getElementById(ROOT_ID)
if (!root) throw new Error(`#${ROOT_ID} not found`)

const paragraph = document.createElement('div')
paragraph.className = 'cv2-paragraph'
root.appendChild(paragraph)

const catEl = document.createElement('img')
catEl.className = 'cv2-sprite'
catEl.alt = 'Walking cat'
catEl.width = CAT_DISPLAY_WIDTH
catEl.height = CAT_DISPLAY_HEIGHT
catEl.draggable = false
root.appendChild(catEl)

// --- Speed slider ---

const slider = document.getElementById('cat-speed-slider')
const speedLabel = document.getElementById('cat-speed-label')
let catSpeed = Number(slider.value)

slider.addEventListener('input', () => {
  catSpeed = Number(slider.value)
  speedLabel.textContent = `${catSpeed} px/s`
})

// --- State ---

let catX = -CAT_DISPLAY_WIDTH // viewport-relative X of cat's left edge
let catFrame = 0
let displayedFrame = -1
let silhouettes = []
let linePool = []

// --- Image loading & silhouette computation ---

function loadImages() {
  return Promise.all(
    Array.from({ length: CAT_FRAME_COUNT }, (_, i) =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = getCatFramePath(i)
      })
    )
  )
}

function computeSilhouettes(images) {
  const canvas = document.createElement('canvas')
  canvas.width = CAT_DISPLAY_WIDTH
  canvas.height = CAT_DISPLAY_HEIGHT
  const ctx = canvas.getContext('2d')

  return images.map(img => {
    ctx.clearRect(0, 0, CAT_DISPLAY_WIDTH, CAT_DISPLAY_HEIGHT)
    ctx.save()
    ctx.translate(CAT_DISPLAY_WIDTH, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(img, 0, 0, CAT_DISPLAY_WIDTH, CAT_DISPLAY_HEIGHT)
    ctx.restore()

    const { data } = ctx.getImageData(0, 0, CAT_DISPLAY_WIDTH, CAT_DISPLAY_HEIGHT)
    const rows = []
    for (let y = 0; y < CAT_DISPLAY_HEIGHT; y++) {
      let left = -1, right = -1
      for (let x = 0; x < CAT_DISPLAY_WIDTH; x++) {
        if (data[(y * CAT_DISPLAY_WIDTH + x) * 4 + 3] > 20) {
          if (left === -1) left = x
          right = x
        }
      }
      rows.push(left === -1 ? null : { left, right: right + 1 })
    }
    return rows
  })
}

// --- Layout ---

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi)
}

function getFrameDurationMs() {
  const speedRatio = BASE_CAT_SPEED / Math.max(1, catSpeed)
  return clamp(BASE_CAT_FRAME_MS * speedRatio, 24, 240)
}

function getColumnLeft() {
  return Math.max(0, Math.floor((window.innerWidth - COLUMN_WIDTH) / 2))
}

function getExclusion(lineTop, columnLeft) {
  const catTop = CAT_Y_LINE * LINE_HEIGHT
  const lineBottom = lineTop + LINE_HEIGHT
  if (lineBottom <= catTop || lineTop >= catTop + CAT_DISPLAY_HEIGHT) return null

  const sil = silhouettes[catFrame]
  if (!sil) return null

  const r0 = Math.max(0, Math.floor(lineTop - catTop))
  const r1 = Math.min(CAT_DISPLAY_HEIGHT, Math.ceil(lineBottom - catTop))
  let minL = CAT_DISPLAY_WIDTH, maxR = 0, found = false

  for (let r = r0; r < r1; r++) {
    if (sil[r]) {
      minL = Math.min(minL, sil[r].left)
      maxR = Math.max(maxR, sil[r].right)
      found = true
    }
  }
  if (!found) return null

  // catX is viewport-relative, convert to column-relative
  const exLeft = catX + minL - columnLeft
  const exRight = catX + maxR - columnLeft
  return { left: exLeft, right: exRight }
}

function splitLineByWidth(text, targetWidth) {
  if (!text || targetWidth <= 0) return ['', text]

  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measureCtx.measureText(text.slice(0, mid)).width <= targetWidth) lo = mid
    else hi = mid - 1
  }

  let at = lo
  const sp = text.lastIndexOf(' ', at)
  if (sp > 0) at = sp
  return [text.slice(0, at).trimEnd(), text.slice(at).trimStart()]
}

function buildLines() {
  const columnLeft = getColumnLeft()
  const lines = []
  let cursor = { segmentIndex: 0, graphemeIndex: 0 }

  while (lines.length < 5000) {
    const lineTop = lines.length * LINE_HEIGHT

    const ex = getExclusion(lineTop, columnLeft)
    let leftWidth, rightWidth, rightStartCol

    if (ex) {
      const exL = clamp(ex.left - MIN_WRAP_GAP, 0, COLUMN_WIDTH)
      const exR = clamp(ex.right + MIN_WRAP_GAP, 0, COLUMN_WIDTH)
      leftWidth = Math.max(0, exL)
      rightWidth = Math.max(0, COLUMN_WIDTH - exR)
      rightStartCol = exR
    } else {
      leftWidth = COLUMN_WIDTH
      rightWidth = 0
      rightStartCol = COLUMN_WIDTH
    }

    const total = leftWidth + rightWidth
    if (total <= 0) {
      lines.push({ leftText: '', rightText: '', leftX: columnLeft, rightX: columnLeft + rightStartCol, y: lineTop })
      continue
    }

    const line = layoutNextLine(prepared, cursor, total)
    if (!line) break

    const [leftText, rightText] = (ex && rightWidth > 0)
      ? splitLineByWidth(line.text, leftWidth)
      : [line.text, '']

    lines.push({
      leftText,
      rightText,
      leftX: columnLeft,
      rightX: columnLeft + rightStartCol,
      y: lineTop,
    })
    cursor = line.end
  }

  return lines
}

// --- Rendering ---

function getPooledLine(index) {
  if (index < linePool.length) return linePool[index]
  const el = document.createElement('div')
  el.className = 'cv2-line'
  paragraph.appendChild(el)
  linePool.push(el)
  return el
}

function render() {
  const lines = buildLines()
  let poolIdx = 0

  for (const l of lines) {
    if (l.leftText) {
      const el = getPooledLine(poolIdx++)
      if (el.textContent !== l.leftText) el.textContent = l.leftText
      el.style.transform = `translate(${l.leftX}px, ${l.y}px)`
      el.style.display = ''
    }
    if (l.rightText) {
      const el = getPooledLine(poolIdx++)
      if (el.textContent !== l.rightText) el.textContent = l.rightText
      el.style.transform = `translate(${l.rightX}px, ${l.y}px)`
      el.style.display = ''
    }
  }

  for (let i = poolIdx; i < linePool.length; i++) {
    linePool[i].style.display = 'none'
  }

  const contentHeight = lines.length > 0
    ? lines[lines.length - 1].y + LINE_HEIGHT
    : 0
  root.style.height = `${contentHeight}px`

  const catTop = CAT_Y_LINE * LINE_HEIGHT
  catEl.style.transform = `translate(${catX}px, ${catTop}px) scaleX(-1)`
  if (catFrame !== displayedFrame) {
    catEl.src = getCatFramePath(catFrame)
    displayedFrame = catFrame
  }
}

// --- Animation loop ---

let lastTime = null
let frameAccum = 0

function tick(ts) {
  if (!lastTime) lastTime = ts
  const dt = ts - lastTime
  lastTime = ts

  catX += catSpeed * dt / 1000
  if (catX > window.innerWidth) {
    catX = -CAT_DISPLAY_WIDTH
  }

  frameAccum += dt
  const frameDuration = getFrameDurationMs()
  while (frameAccum >= frameDuration) {
    catFrame = (catFrame + 1) % CAT_FRAME_COUNT
    frameAccum -= frameDuration
  }

  render()
  requestAnimationFrame(tick)
}

window.addEventListener('resize', () => render())

// --- Init ---

loadImages().then(images => {
  silhouettes = computeSilhouettes(images)
  requestAnimationFrame(tick)
})

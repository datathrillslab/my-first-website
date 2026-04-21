import { layoutNextLineRange, materializeLineRange, prepareWithSegments } from '@chenglou/pretext'

const ROOT_ID = 'pretext-demo'
const FONT = "16px Georgia, 'Times New Roman', serif"
const LINE_HEIGHT = 28
const BALL_RADIUS = 58
const PADDING = 20
const MIN_WRAP_GAP = 20

const LOREM_IPSUM = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer ut felis at nunc luctus tempus. Suspendisse hendrerit, nisl vitae dictum vulputate, massa elit commodo nisi, ac volutpat nibh velit sed erat. Nunc viverra bibendum luctus. Fusce a nisl in nisi gravida convallis. Cras condimentum, ante vitae porttitor faucibus, nibh mauris faucibus urna, at placerat dui magna a sem. Curabitur eget magna vitae neque sollicitudin varius.

Sed egestas bibendum ipsum, id laoreet ligula pharetra in. Integer rutrum, risus non accumsan cursus, ipsum mauris facilisis sem, quis posuere justo odio et justo. Etiam laoreet sem ut purus posuere tristique. Vivamus et sem ut ante vulputate viverra. Pellentesque pulvinar ullamcorper orci, ac ultricies purus eleifend sed. Mauris mattis ipsum nec erat efficitur tristique.

Praesent in aliquet purus. Vestibulum viverra lectus nec lacus volutpat, id aliquet arcu ultricies. Donec et sem ac neque varius suscipit. Aliquam fermentum eu ipsum et ultrices. In fermentum feugiat lectus, vel volutpat mi efficitur in. Proin ac lectus commodo, faucibus erat id, sagittis dolor. Pellentesque sed dui neque.

Mauris pellentesque sapien vitae neque laoreet, nec vehicula purus viverra. Quisque vel sapien sit amet nibh tincidunt tristique. Etiam tincidunt, nisi at efficitur tempor, justo nibh feugiat lorem, ac feugiat risus magna at eros. Integer vel eros in magna ultricies suscipit. Sed ac ipsum massa. Morbi at aliquam risus. Donec lobortis suscipit velit, at feugiat dui consectetur sit amet. In ac dui dapibus, fringilla nibh at, porta ex.

Fusce aliquam pulvinar turpis vel varius. Aliquam malesuada feugiat lacus at pretium. Morbi tincidunt, risus ut varius vulputate, neque neque faucibus eros, non luctus justo turpis id magna. Vestibulum interdum justo in sem laoreet tristique. Maecenas vulputate elementum lacus, sed porttitor justo commodo in. Aenean luctus vulputate molestie. Nam suscipit nisi in lectus convallis tristique. Sed vel cursus leo.

Nulla varius suscipit dui non aliquet. Pellentesque accumsan est vel dolor aliquam, vel congue nisl ultrices. Etiam efficitur, libero non feugiat cursus, lacus tortor volutpat velit, sed luctus enim augue ac lorem. Phasellus rhoncus augue in nibh malesuada, sit amet varius leo volutpat. Cras eget urna malesuada, vestibulum purus id, luctus augue. Nunc at nibh non sem luctus faucibus. Donec placerat ligula nec tortor cursus, a tempus magna feugiat.

Cras id diam venenatis, aliquam lorem sed, tristique est. In hac habitasse platea dictumst. Donec at leo feugiat, vulputate libero et, tincidunt tellus. Pellentesque iaculis risus ut ipsum feugiat auctor. Vivamus volutpat libero non lacinia auctor. Curabitur facilisis tristique dui, vel sagittis justo scelerisque a. Donec facilisis justo non justo faucibus suscipit.
`.replace(/\s+/g, ' ').trim()

const prepared = prepareWithSegments(LOREM_IPSUM, FONT)
const measureContext = document.createElement('canvas').getContext('2d')
if (!measureContext) {
  throw new Error('Could not create canvas context for text measurement.')
}
measureContext.font = FONT

const root = document.getElementById(ROOT_ID)

if (!root) {
  throw new Error(`#${ROOT_ID} was not found.`)
}

const paragraph = document.createElement('div')
paragraph.className = 'pretext-paragraph'
root.appendChild(paragraph)

const ball = document.createElement('div')
ball.className = 'pretext-ball'
root.appendChild(ball)

let ballX = 0
let ballY = 0
let dragging = false
let dragOffsetX = 0
let dragOffsetY = 0

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function splitLineByWidth(text, targetWidth) {
  if (!text || targetWidth <= 0) return ['', text]

  let low = 0
  let high = text.length

  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const width = measureContext.measureText(text.slice(0, mid)).width
    if (width <= targetWidth) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  let splitAt = low
  const spaceBefore = text.lastIndexOf(' ', splitAt)
  if (spaceBefore > 0) {
    splitAt = spaceBefore
  }

  return [text.slice(0, splitAt).trimEnd(), text.slice(splitAt).trimStart()]
}

function buildLines() {
  const width = root.clientWidth
  const cursor = { segmentIndex: 0, graphemeIndex: 0 }
  const lines = []

  while (true) {
    const lineTop = PADDING + lines.length * LINE_HEIGHT
    const lineCenter = lineTop + LINE_HEIGHT / 2
    const dy = Math.abs(lineCenter - ballY)
    let leftBlock = 0
    let rightBlock = 0

    if (dy < BALL_RADIUS) {
      const halfChord = Math.sqrt(BALL_RADIUS * BALL_RADIUS - dy * dy)
      leftBlock = ballX - halfChord
      rightBlock = ballX + halfChord
    }

    const safeStart = PADDING
    const safeEnd = width - PADDING
    const leftGapStart = safeStart
    const leftGapEnd = clamp(leftBlock - MIN_WRAP_GAP, safeStart, safeEnd)
    const rightGapStart = clamp(rightBlock + MIN_WRAP_GAP, safeStart, safeEnd)
    const rightGapEnd = safeEnd

    const leftWidth = Math.max(0, leftGapEnd - leftGapStart)
    const rightWidth = Math.max(0, rightGapEnd - rightGapStart)
    const totalAvailable = leftWidth + rightWidth

    if (totalAvailable <= 0) {
      lines.push({ text: '', leftStart: safeStart, rightStart: safeStart, lineTop })
      continue
    }

    const range = layoutNextLineRange(prepared, cursor, totalAvailable)

    if (range === null) {
      break
    }

    const line = materializeLineRange(prepared, range)
    const [leftText, rightText] = splitLineByWidth(line.text, leftWidth)

    lines.push({
      leftText,
      rightText,
      leftStart: leftGapStart,
      rightStart: rightGapStart,
      lineTop
    })

    cursor.segmentIndex = range.end.segmentIndex
    cursor.graphemeIndex = range.end.graphemeIndex
  }

  return lines
}

function render() {
  const lines = buildLines()
  const html = lines
    .map((line) => {
      return `
        <div class="pretext-line" style="top:${line.lineTop}px;">
          <span class="pretext-chunk" style="left:${line.leftStart}px;">${escapeHtml(line.leftText || '')}</span>
          <span class="pretext-chunk" style="left:${line.rightStart}px;">${escapeHtml(line.rightText || '')}</span>
        </div>
      `
    })
    .join('')

  paragraph.innerHTML = html
  paragraph.style.height = `${Math.max(600, PADDING * 2 + lines.length * LINE_HEIGHT)}px`
  ball.style.left = `${ballX}px`
  ball.style.top = `${ballY}px`
}

function setBallPosition(clientX, clientY) {
  const rect = root.getBoundingClientRect()
  ballX = clamp(clientX - rect.left - dragOffsetX, PADDING + BALL_RADIUS, rect.width - PADDING - BALL_RADIUS)
  ballY = clamp(clientY - rect.top - dragOffsetY, PADDING + BALL_RADIUS, rect.height - PADDING - BALL_RADIUS)
  render()
}

function centerBall() {
  const rect = root.getBoundingClientRect()
  ballX = rect.width / 2
  ballY = Math.min(rect.height / 2, PADDING + 7 * LINE_HEIGHT)
}

ball.addEventListener('mousedown', (event) => {
  dragging = true
  const rect = ball.getBoundingClientRect()
  dragOffsetX = event.clientX - rect.left - BALL_RADIUS
  dragOffsetY = event.clientY - rect.top - BALL_RADIUS
  ball.classList.add('dragging')
})

window.addEventListener('mousemove', (event) => {
  if (!dragging) return
  setBallPosition(event.clientX, event.clientY)
})

window.addEventListener('mouseup', () => {
  dragging = false
  ball.classList.remove('dragging')
})

window.addEventListener('resize', () => {
  ballX = 0
  ballY = 0
  centerBall()
  render()
})

centerBall()
render()

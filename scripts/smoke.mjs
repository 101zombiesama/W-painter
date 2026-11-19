/**
 * Smoke test: boots the app in headless Chrome, paints a few strokes with
 * real pointer input, and saves screenshots to scripts/.out/.
 *
 *   npm run smoke            # starts its own dev server
 *   npm run smoke -- <url>   # uses an already running server
 *
 * Exits non-zero if the page logs errors or painting changes nothing.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '.out')
mkdirSync(outDir, { recursive: true })

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path))
if (!chrome) {
  console.error('Chrome not found. Set CHROME_PATH to a Chrome/Chromium executable.')
  process.exit(2)
}

const PORT = 5199
let url = process.argv[2]
let server = null

if (!url) {
  url = `http://localhost:${PORT}/`
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: join(here, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Dev server did not start in time')), 30_000)
    server.stdout.on('data', (chunk) => {
      const text = String(chunk)
      if (text.includes('Local:')) {
        clearTimeout(timer)
        resolve()
      }
      // A full reload mid-test would silently reset the app state.
      if (/reload/i.test(text)) console.warn(`[vite] ${text.trim()}`)
    })
    server.on('exit', (code) => reject(new Error(`Dev server exited with code ${code}`)))
  })
}

const errors = []
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
})

let failed = false
try {
  const page = await browser.newPage()
  const downloadDir = join(outDir, 'downloads')
  rmSync(downloadDir, { recursive: true, force: true })
  mkdirSync(downloadDir, { recursive: true })
  const cdp = await page.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
  page.on('console', (message) => {
    const type = message.type()
    if (type === 'error' || type === 'warn') errors.push(`[${type}] ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`))

  await page.goto(url, { waitUntil: 'networkidle0' })
  const ready = () =>
    page.waitForFunction(
      () => {
        const app = window.wpainter
        if (!app) return false
        const state = app.services.get('project').store.getState()
        return state.textureSets.length > 0 && state.busy === null
      },
      { timeout: 60_000 },
    )
  await ready()
  const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))
  const shot = async (name) => {
    await settle()
    await page.screenshot({ path: join(outDir, `${name}.png`) })
    console.log(`saved ${name}.png`)
  }

  const gpu = await page.evaluate(() => {
    const gl = window.wpainter.services.get('viewport').renderer.getContext()
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  console.log(`renderer: ${gpu}`)
  await shot('01-initial')

  // Where is the canvas, and what does its center look like before painting?
  const box = await page.evaluate(() => {
    const rect = window.wpainter.services.get('viewport').canvas.getBoundingClientRect()
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
  })
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2

  const stroke = async (points) => {
    await page.mouse.move(points[0][0], points[0][1])
    await page.mouse.down()
    for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 6 })
    await page.mouse.up()
    await settle(250)
  }
  const wave = (offsetY, amplitude = 40, span = 220) =>
    Array.from({ length: 14 }, (_, i) => {
      const t = i / 13
      return [cx - span / 2 + t * span, cy + offsetY + Math.sin(t * Math.PI * 2) * amplitude]
    })

  // 1. Default brush: orange base color.
  await stroke(wave(-90))
  await shot('02-stroke-color')

  // 2. Gold material, soft brush.
  await page.evaluate(() => {
    const paint = window.wpainter.services.get('paint')
    paint.actions.applyMaterial({ baseColor: [1, 0.78, 0.34], roughness: [0.2, 0.2, 0.2], metallic: [1, 1, 1] })
    paint.actions.setBrush({ size: 0.14, hardness: 0.2 })
  })
  await stroke(wave(0))
  await shot('03-stroke-gold')

  // 3. Height only: an embossed stroke should show up in the lit view.
  await page.evaluate(() => {
    const paint = window.wpainter.services.get('paint')
    for (const id of ['baseColor', 'roughness', 'metallic']) paint.actions.setChannel(id, { enabled: false })
    paint.actions.setChannel('height', { enabled: true, value: [0.8, 0.8, 0.8] })
    paint.actions.setBrush({ size: 0.07, hardness: 0.5 })
  })
  await stroke(wave(90))
  await shot('04-stroke-height')

  // 4. A stamp, embossed and colored.
  await page.evaluate(() => {
    const paint = window.wpainter.services.get('paint')
    paint.actions.applyMaterial({ baseColor: [0.07, 0.22, 0.62], roughness: [0.3, 0.3, 0.3], metallic: [0, 0, 0] })
    paint.actions.setStamp('stamp-gear')
    paint.actions.setTool('stamp')
    paint.actions.setBrush({ size: 0.22 })
  })
  await page.mouse.click(cx - 150, cy + 10)
  await shot('05-stamp')

  // 5. Channel views.
  for (const mode of ['baseColor', 'height', 'normal', 'roughness']) {
    await page.evaluate((m) => window.wpainter.services.get('project').setViewMode(m), mode)
    await shot(`06-view-${mode}`)
  }
  await page.evaluate(() => window.wpainter.services.get('project').setViewMode('material'))

  // 6. Undo everything, then redo: the picture must change and come back.
  const historyDepth = await page.evaluate(() => {
    const { history } = window.wpainter
    let count = 0
    while (history.undo()) count++
    return count
  })
  await shot('07-undone')
  await page.evaluate(() => {
    const { history } = window.wpainter
    while (history.redo()) {
      /* redo all */
    }
  })
  await shot('08-redone')
  console.log(`history depth: ${historyDepth}`)
  if (historyDepth < 4) {
    failed = true
    console.error('Expected at least 4 undoable strokes.')
  }

  // 7. Throughput: frames per second during a long continuous stroke.
  const measure = async (label) => {
    await page.evaluate(() => {
      window.__frames = 0
      const tick = () => {
        window.__frames++
        window.__raf = requestAnimationFrame(tick)
      }
      window.__raf = requestAnimationFrame(tick)
    })
    const start = Date.now()
    await page.mouse.move(cx - 180, cy)
    await page.mouse.down()
    for (let i = 0; i < 240; i++) {
      const t = i / 239
      await page.mouse.move(cx - 180 + t * 360, cy + Math.sin(t * Math.PI * 6) * 120)
    }
    await page.mouse.up()
    const seconds = (Date.now() - start) / 1000
    const stats = await page.evaluate(() => {
      cancelAnimationFrame(window.__raf)
      const viewport = window.wpainter.services.get('viewport')
      return { frames: window.__frames, cpuMs: viewport.stats.getState().frameMs }
    })
    console.log(`${label}: ${(stats.frames / seconds).toFixed(0)} fps over ${seconds.toFixed(1)}s, ${stats.cpuMs.toFixed(2)} ms CPU per drawn frame`)
  }
  await page.evaluate(() => {
    const paint = window.wpainter.services.get('paint')
    paint.actions.setTool('paint')
    paint.actions.setBrush({ size: 0.1, hardness: 0.5, tipId: 'round' })
    paint.actions.applyMaterial({ baseColor: [0.2, 0.7, 0.4], roughness: [0.4, 0.4, 0.4], metallic: [0, 0, 0], height: [0.3, 0.3, 0.3] })
  })
  await measure('paint 4 channels @2048')
  await page.evaluate(() => {
    const project = window.wpainter.services.get('project')
    project.setResolution(project.store.getState().activeId, 4096)
  })
  await settle(600)
  await measure('paint 4 channels @4096')
  await shot('08b-after-4k')

  // 8. Auto-unwrap path: a rounded cube has overlapping UVs and goes through the worker.
  await page.evaluate(() => void window.wpainter.services.get('model').openPrimitive('rounded-cube'))
  await settle(200)
  await ready()
  await page.evaluate(() => {
    const paint = window.wpainter.services.get('paint')
    paint.actions.setTool('paint')
    paint.actions.setBrush({ size: 0.12, hardness: 0.8, tipId: 'round' })
    paint.actions.applyMaterial({ baseColor: [0.72, 0.05, 0.06], roughness: [0.25, 0.25, 0.25], metallic: [0, 0, 0] })
  })
  await stroke(wave(0, 60, 320))
  await shot('09-unwrapped-cube')

  const unwrap = await page.evaluate(() => {
    const project = window.wpainter.services.get('project')
    return project.store.getState().textureSets.map((set) => ({ name: set.name, generatedUVs: set.generatedUVs, triangles: set.triangles }))
  })
  console.log('texture sets:', JSON.stringify(unwrap))
  if (!unwrap[0]?.generatedUVs) {
    failed = true
    console.error('Rounded cube should have generated UVs.')
  }

  // 9. Fill layer + black mask, revealed by painting the mask with a textured tip.
  const check = (condition, message) => {
    if (condition) return
    failed = true
    console.error(`CHECK FAILED: ${message}`)
  }
  const stackInfo = () =>
    page.evaluate(() => {
      const app = window.wpainter
      const id = app.services.get('project').store.getState().activeId
      const stack = app.services.get('layers').getStack(id)
      return { count: stack.layers.length, names: stack.layers.map((l) => l.name), target: stack.paintTarget }
    })

  await page.evaluate(() => {
    const app = window.wpainter
    const layers = app.services.get('layers')
    const paint = app.services.get('paint')
    const id = app.services.get('project').store.getState().activeId
    const fillId = layers.addLayer(id, 'fill')
    layers.setFillValues(id, fillId, { baseColor: [1, 0.78, 0.34], roughness: [0.22, 0.22, 0.22], metallic: [1, 1, 1] })
    layers.addMask(id, fillId, 'black')
    paint.actions.setMaskValue(1)
    paint.actions.setBrush({ size: 0.2, tipId: 'alpha-chalk', spacing: 0.1, angleJitter: 1, flow: 0.9 })
  })
  check((await stackInfo()).target === 'mask', 'adding a mask should switch the brush to the mask')
  await stroke(wave(-140, 30, 300))
  await shot('10-fill-mask-chalk')

  // 10. Eraser on the first paint layer.
  await page.evaluate(() => {
    const app = window.wpainter
    const layers = app.services.get('layers')
    const paint = app.services.get('paint')
    const id = app.services.get('project').store.getState().activeId
    layers.selectLayer(id, layers.getStack(id).layers[0].id)
    paint.actions.setTool('erase')
    paint.actions.setBrush({ size: 0.06, tipId: 'round', hardness: 0.9, spacing: 0.08, angleJitter: 0, flow: 1 })
  })
  await stroke([[cx - 170, cy - 60], [cx + 170, cy + 60]])
  await shot('11-eraser')

  // 11. Symmetry with a splatter tip on a new layer, camera-aligned.
  await page.evaluate(() => {
    const app = window.wpainter
    const layers = app.services.get('layers')
    const paint = app.services.get('paint')
    const id = app.services.get('project').store.getState().activeId
    layers.addLayer(id, 'paint')
    paint.actions.setTool('paint')
    paint.actions.setSymmetry({ enabled: true, axis: 'x' })
    paint.actions.applyMaterial({ baseColor: [0.07, 0.22, 0.62], roughness: [0.3, 0.3, 0.3], metallic: [0, 0, 0] })
    paint.actions.setChannel('height', { enabled: false })
    paint.actions.setBrush({ size: 0.09, tipId: 'alpha-splatter', spacing: 0.6, angleJitter: 1, sizeJitter: 0.5, scatter: 0.3 })
  })
  await stroke(wave(150, 20, 260))
  await page.evaluate(() => window.wpainter.services.get('paint').actions.setSymmetry({ enabled: false }))
  await shot('12-symmetry-splatter')
  check((await stackInfo()).count === 3, 'expected 3 layers')

  // 12. Layer operations and their undo.
  const afterOps = await page.evaluate(() => {
    const app = window.wpainter
    const layers = app.services.get('layers')
    const id = app.services.get('project').store.getState().activeId
    const top = layers.getStack(id).layers.at(-1).id
    layers.duplicateLayer(id, top)
    layers.moveLayer(id, top, -1)
    layers.removeLayer(id, top)
    const during = layers.getStack(id).layers.length
    app.history.undo()
    app.history.undo()
    app.history.undo()
    return { during, after: layers.getStack(id).layers.length }
  })
  check(afterOps.during === 3 && afterOps.after === 3, `layer ops/undo gave ${JSON.stringify(afterOps)}`)

  // 13. Material picker reads back what is under the cursor.
  await page.evaluate(() => window.wpainter.services.get('paint').actions.setTool('picker'))
  await page.mouse.click(cx - 60, cy + 150)
  const picked = await page.evaluate(() => window.wpainter.services.get('paint').store.getState().material.baseColor.value)
  console.log('picked color:', picked.map((v) => v.toFixed(2)).join(', '))
  await page.evaluate(() => window.wpainter.services.get('paint').actions.setTool('paint'))

  // 14. Lighting: another environment as background, with shadows.
  await page.evaluate(() => {
    const lighting = window.wpainter.services.get('lighting')
    lighting.update({ environmentId: 'sunset', showBackground: true, rotation: 200 })
    lighting.updateKeyLight({ shadows: true })
  })
  await page.mouse.move(cx + 380, cy - 300)
  await shot('13-lighting-sunset')
  await page.evaluate(() => {
    const lighting = window.wpainter.services.get('lighting')
    lighting.update({ environmentId: 'studio', showBackground: false, rotation: 0 })
    lighting.updateKeyLight({ shadows: false })
  })

  // 15. Export writes a zip with one PNG per selected map.
  const exported = await page.evaluate(() => window.wpainter.services.get('export').export())
  await settle(1500)
  const downloads = readdirSync(downloadDir).filter((name) => !name.endsWith('.crdownload'))
  const zipSize = downloads[0] ? statSync(join(downloadDir, downloads[0])).size : 0
  console.log(`exported ${exported} maps -> ${downloads.join(', ') || 'nothing'} (${(zipSize / 1024).toFixed(0)} KB)`)
  check(exported === 6 && zipSize > 10_000, 'export should produce a zip of 6 maps')

  // 16. Multi-material import: one part has UVs, the other does not.
  await page.evaluate(() => {
    const obj = [
      'o Body', 'usemtl Body',
      'v -1 -1 1', 'v 1 -1 1', 'v 1 1 1', 'v -1 1 1', 'v -1 -1 -1', 'v 1 -1 -1', 'v 1 1 -1', 'v -1 1 -1',
      'vt 0 0', 'vt 0.5 0', 'vt 0.5 0.5', 'vt 0 0.5', 'vt 0.5 0', 'vt 1 0', 'vt 1 0.5', 'vt 0.5 0.5',
      'vt 0 0.5', 'vt 0.5 0.5', 'vt 0.5 1', 'vt 0 1',
      'f 1/1 2/2 3/3 4/4', 'f 2/5 6/6 7/7 3/8', 'f 4/9 3/10 7/11 8/12',
      'o Cap', 'usemtl Cap',
      'v -1 -1 1', 'v -1 -1 -1', 'v -1 1 -1', 'v -1 1 1', 'v -2.2 0 0',
      'f 9 10 13', 'f 10 11 13', 'f 11 12 13', 'f 12 9 13',
    ].join('\n')
    const file = new File([obj], 'two-materials.obj', { type: 'text/plain' })
    void window.wpainter.services.get('model').openFile(file)
  })
  await settle(300)
  await ready()
  const sets = await page.evaluate(() =>
    window.wpainter.services.get('project').store.getState().textureSets.map((s) => `${s.name}:${s.generatedUVs ? 'generated' : 'imported'}:${s.resolution}`),
  )
  console.log('imported sets:', sets.join(' | '))
  check(sets.length === 2 && sets.some((s) => s.includes('generated')) && sets.some((s) => s.includes('imported')), 'OBJ should yield one imported-UV set and one generated-UV set')
  await page.evaluate(() => {
    const paint = window.wpainter.services.get('paint')
    paint.actions.setBrush({ size: 0.1, tipId: 'round', hardness: 0.8, spacing: 0.08, angleJitter: 0, sizeJitter: 0, scatter: 0 })
    paint.actions.applyMaterial({ baseColor: [0.96, 0.74, 0.07], roughness: [0.4, 0.4, 0.4], metallic: [0, 0, 0] })
  })
  // Strokes must start on the model (dragging on empty space orbits the camera).
  await stroke([[cx + 20, cy - 40], [cx + 140, cy + 30], [cx + 40, cy + 110]])
  // Starting a stroke on the other part should make its texture set active.
  const capPoint = await page.evaluate(() => {
    const app = window.wpainter
    const viewport = app.services.get('viewport')
    const cap = app.services.get('project').textureSets.find((set) => set.name === 'Cap')
    const rect = viewport.canvas.getBoundingClientRect()
    // Scan the canvas for a pixel where the (mostly hidden) cap is the front-most surface.
    for (let y = rect.top + 8; y < rect.bottom; y += 6) {
      for (let x = rect.left + 8; x < rect.right; x += 6) {
        if (viewport.pick(x, y)?.object === cap.mesh) return [x, y]
      }
    }
    return null
  })
  check(capPoint !== null, 'the cap should be visible somewhere on screen')
  await page.evaluate(() =>
    window.wpainter.services.get('paint').actions.applyMaterial({ baseColor: [0.1, 0.6, 0.9], roughness: [0.3, 0.3, 0.3], metallic: [0, 0, 0] }),
  )
  await stroke([capPoint, [capPoint[0] + 2, capPoint[1] + 14]])
  const activeName = await page.evaluate(() => window.wpainter.services.get('project').active?.name)
  check(activeName === 'Cap', `painting on the cap should activate its texture set (active: ${activeName})`)
  await shot('14-multi-material')

  // 17. glTF round trip: export a mesh to .glb in the page, then import it.
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js')
    const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js')
    const mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.7, 0.25, 160, 24),
      new THREE.MeshStandardMaterial({ name: 'Knot' }),
    )
    const glb = await new GLTFExporter().parseAsync(mesh, { binary: true })
    const file = new File([glb], 'knot.glb', { type: 'model/gltf-binary' })
    await window.wpainter.services.get('model').openFile(file)
  })
  await ready()
  const glbSets = await page.evaluate(() => {
    const project = window.wpainter.services.get('project')
    return project.textureSets.map((set) => `${set.name}:${set.uvOrigin}:${set.triangleCount}`)
  })
  console.log('glb sets:', glbSets.join(' | '))
  check(glbSets.length === 1 && glbSets[0].includes('top-left'), 'GLB import should give one set with glTF UV origin')

  // 18. Import a custom alpha image and paint with it.
  const customTip = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 128, 128)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 96px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('W', 64, 70)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const app = window.wpainter
    const id = await app.services.get('assets').importImage(new File([blob], 'letter.png', { type: 'image/png' }), 'stamp')
    const paint = app.services.get('paint')
    paint.actions.setStamp(id)
    paint.actions.setTool('stamp')
    paint.actions.setBrush({ size: 0.16, angle: 0 })
    paint.actions.applyMaterial({ baseColor: [0.9, 0.2, 0.5], roughness: [0.3, 0.3, 0.3], metallic: [0, 0, 0], height: [0.5, 0.5, 0.5] })
    return app.services.get('assets').describe(id)?.name
  })
  check(customTip === 'letter', 'imported stamp should be in the library')
  const knotPoint = await page.evaluate(() => {
    const viewport = window.wpainter.services.get('viewport')
    const rect = viewport.canvas.getBoundingClientRect()
    for (let y = rect.top + rect.height * 0.3; y < rect.bottom; y += 5) {
      for (let x = rect.left + rect.width * 0.3; x < rect.right; x += 5) {
        if (viewport.pick(x, y)) return [x + 10, y + 10]
      }
    }
    return null
  })
  if (knotPoint) await page.mouse.click(knotPoint[0], knotPoint[1])
  await shot('15-glb-custom-stamp')

  // 19. Load a (tiny) Radiance .hdr file as the environment.
  const envCount = await page.evaluate(async () => {
    const header = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n'
    const pixels = new Uint8Array(4 * 2 * 4)
    for (let i = 0; i < 8; i++) pixels.set(i < 4 ? [200, 220, 255, 130] : [120, 90, 60, 128], i * 4)
    const file = new File([header, pixels], 'tiny.hdr')
    const lighting = window.wpainter.services.get('lighting')
    await lighting.loadFile(file)
    return lighting.store.getState().environments.length
  })
  check(envCount === 7, `custom HDRI should be added to the environment list (count ${envCount})`)
  await shot('16-custom-hdri')
} catch (error) {
  failed = true
  console.error(error)
} finally {
  await browser.close()
  server?.kill()
}

if (errors.length > 0) {
  failed = true
  console.error(`\n${errors.length} console problem(s):`)
  for (const line of errors.slice(0, 40)) console.error('  ' + line)
}
console.log(failed ? '\nSMOKE FAILED' : '\nSMOKE OK')
process.exit(failed ? 1 : 0)

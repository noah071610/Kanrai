// 실행: PLAYWRIGHT_MODULE=<playwright 경로> CHROME_PATH=<Chromium 경로> node apps/viewer/test/viewport.mjs [뷰어 URL]
// 실제 Chrome 줌 API를 사용한다. 테스트 프로필과 확장은 임시 폴더에만 생성한다.
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright")
const temporary = await mkdtemp(join(tmpdir(), "kanrai-viewport-"))
const extension = join(temporary, "extension")
await mkdir(extension)
await writeFile(
  join(extension, "manifest.json"),
  JSON.stringify({
    manifest_version: 3,
    name: "Viewer zoom test",
    version: "1.0",
    permissions: ["tabs"],
    background: { service_worker: "background.js" },
  }),
)
await writeFile(join(extension, "background.js"), "chrome.runtime.onInstalled.addListener(() => {});")

let context
try {
  context = await chromium.launchPersistentContext(join(temporary, "profile"), {
    executablePath: process.env.CHROME_PATH,
    channel: process.env.CHROME_PATH ? undefined : "chromium",
    headless: true,
    viewport: { width: 1440, height: 820 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
  const page = context.pages()[0]
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(process.argv[2] || "http://localhost:4477")
  const viewer = page.frameLocator("#viewer-viewport")
  await viewer.locator(".react-flow__node").first().waitFor()
  const setZoom = async (zoom) => {
    await worker.evaluate(async (factor) => {
      const [tab] = await chrome.tabs.query({ active: true })
      await chrome.tabs.setZoom(tab.id, factor)
    }, zoom)
    await page.waitForTimeout(250)
  }
  const near = (actual, expected, label, tolerance = 2) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`)

  for (const size of [
    { width: 1440, height: 820 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
  ]) {
    await setZoom(1)
    await page.setViewportSize(size)
    for (const zoom of [0.25, 0.5, 0.8, 1, 1.25, 2, 3, 5]) {
      await setZoom(zoom)
      const metrics = await page.evaluate(() => {
        const frame = document.querySelector("#viewer-viewport")
        const doc = frame.contentDocument
        return {
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
          frame: frame.getBoundingClientRect().toJSON(),
          shell: doc.querySelector("#root > div").getBoundingClientRect().toJSON(),
          sidebar: doc.querySelector("aside").getBoundingClientRect().toJSON(),
          canvas: doc.querySelector(".react-flow").getBoundingClientRect().toJSON(),
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
        }
      })
      near(metrics.frame.x, 0, "프레임 왼쪽")
      near(metrics.frame.y, 0, "프레임 위쪽")
      near(metrics.frame.width, metrics.width, "전체 화면 폭")
      near(metrics.frame.height, metrics.height, "전체 화면 높이")
      near(metrics.shell.width, 1440, "노트북 기준 폭")
      near((metrics.shell.height * metrics.width) / 1440, metrics.height, "레이아웃 아래 잘림")
      near(metrics.canvas.bottom, metrics.shell.height, "캔버스 아래 잘림")
      near(metrics.scrollWidth, metrics.width, "가로 넘침")
      near(metrics.scrollHeight, metrics.height, "세로 넘침")
      near(
        ((metrics.sidebar.width * metrics.width) / 1440) * metrics.dpr,
        (size.width * 300) / 1440,
        "줌과 무관한 사이드바 크기",
      )

      await viewer.getByRole("button", { name: "Fit", exact: true }).click()
      await page.waitForTimeout(250)
      const node = viewer.locator(".react-flow__node").first()
      const before = await node.boundingBox()
      const x = before.x + before.width / 2
      const y = before.y + before.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      // 드래그 시작 임계값을 지난 뒤의 이동량을 화면 픽셀로 비교한다.
      await page.mouse.move(x + 20 / zoom, y + 12 / zoom, { steps: 8 })
      const dragging = await node.boundingBox()
      await page.mouse.move(x + 60 / zoom, y + 36 / zoom, { steps: 8 })
      await page.mouse.up()
      const after = await node.boundingBox()
      near((after.x - dragging.x) * zoom, 40, "드래그 X")
      near((after.y - dragging.y) * zoom, 24, "드래그 Y")
      console.log(`${size.width}×${size.height} / Chrome ${zoom * 100}%: 화면 채움·크기·드래그 통과`)
    }
  }

  await setZoom(1)
  await page.setViewportSize({ width: 1440, height: 820 })
  const route = viewer.locator("aside").first().locator("li > button").nth(1)
  await route.click()
  const hash = new URL(page.url()).hash
  assert.ok(hash, "선택한 경로가 주소창에 반영되어야 한다")
  await page.reload()
  await viewer.locator(".react-flow__node").first().waitFor()
  assert.ok((await viewer.locator("h1").innerText()).includes(decodeURIComponent(hash.slice(1)).split(" ")[1]))
  assert.deepEqual(errors, [], "브라우저 런타임 오류")
  console.log("경로 공유·새로고침 통과")
} finally {
  await context?.close()
  await rm(temporary, { recursive: true, force: true })
}

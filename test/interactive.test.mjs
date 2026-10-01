/**
 * Real-DOM interaction tests.
 *
 * The contract tests in `client-bundle.test.mjs` run the bundle against a stub
 * React, which proves the registration and the shape of the tree but cannot
 * prove that a click moves state, that a wheel gesture re-zooms, or that a drag
 * persists. This file runs the same bundle against the real thing: real React,
 * real `react-dom`, and a real DOM from jsdom, driven with real events.
 *
 * React, react-dom and jsdom are not dependencies of this package — installing
 * them would mean shipping a second React next to the shell's. They are located
 * in a DSH installation that is already on the machine, so this file runs where
 * a DSH install exists and skips cleanly everywhere else (CI included).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

import { root as repoRoot, createLocale, createChatSnapshot } from "./harness.mjs"

/** Find an app bundle that carries React and jsdom, or undefined. */
function findAppRoot() {
	if (process.env.DSH_CANVAS_SKIP_INTERACTIVE === "1") return undefined
	const candidates = [
		process.env.DSH_APP_ROOT,
		"/Applications/DSH Desktop.app/Contents/Resources/app",
		"/Applications/DeepSeek Harness.app/Contents/Resources/app"
	].filter((candidate) => typeof candidate === "string" && candidate !== "")

	for (const candidate of candidates) {
		const has = (name) => existsSync(join(candidate, "node_modules", name, "package.json"))
		if (has("react") && has("react-dom") && has("jsdom")) return candidate
	}
	return undefined
}

const appRoot = findAppRoot()
const skip =
	appRoot === undefined
		? "no DSH installation with react + react-dom + jsdom was found (set DSH_APP_ROOT to point at one)"
		: false

/**
 * Load the bundle in the host realm.
 *
 * The vm-based harness is right for isolation, but React identity is what
 * matters here: the plugin must receive the exact same React instance that
 * `react-dom` renders with, so the bundle is evaluated in this realm and handed
 * the jsdom window through parameters.
 */
function loadBundle(window) {
	const source = readFileSync(join(repoRoot, "lib", "client.js"), "utf8")
	let registration
	window.__ModuleLoader__ = {
		load(entry) {
			registration = entry
		}
	}

	const evaluate = new Function(
		"window",
		"document",
		"navigator",
		"Blob",
		"URL",
		"console",
		"setTimeout",
		"clearTimeout",
		`${source}\n//# sourceURL=dsh-canvas/lib/client.js`
	)
	evaluate(
		window,
		window.document,
		window.navigator,
		window.Blob,
		window.URL,
		console,
		window.setTimeout.bind(window),
		window.clearTimeout.bind(window)
	)

	if (registration === undefined) throw new Error("the bundle never called window.__ModuleLoader__.load")
	return registration
}

test("the canvas renders and responds to real DOM interaction", { skip }, async (t) => {
	const require = createRequire(join(appRoot, "package.json"))
	const { JSDOM, VirtualConsole } = require("jsdom")

	// jsdom has no layout engine, so the anchor click inside the export path
	// would ask it to navigate to a blob URL it cannot resolve. The download
	// itself is captured instead, which is what the assertion is about.
	const virtualConsole = new VirtualConsole()
	virtualConsole.on("jsdomError", () => {})
	const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
		url: "http://127.0.0.1:4399/",
		pretendToBeVisual: true,
		virtualConsole
	})
	const win = dom.window

	// The globals must be in place *before* react-dom is loaded. It probes for
	// feature support at module scope, and with no `document` yet it concludes
	// that `input` events are unsupported and falls back to the IE-era
	// `propertychange` path — where a controlled text input then silently never
	// reports a change.
	for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle"]) {
		if (name in win) Object.defineProperty(globalThis, name, { value: win[name], configurable: true, writable: true })
	}
	globalThis.IS_REACT_ACT_ENVIRONMENT = true

	const React = require("react")
	const ReactDOMClient = require("react-dom/client")
	const act = React.act ?? require("react-dom/test-utils").act

	win.HTMLAnchorElement.prototype.click = () => {}
	const downloads = []
	win.URL.createObjectURL = (blob) => {
		downloads.push(blob)
		return "blob:captured"
	}
	win.URL.revokeObjectURL = () => {}

	// The toast clears itself through `window.setTimeout`. Left alone it would
	// fire a state update after the last assertion, which React reports as an
	// update outside `act`. The timer is parked instead — nothing asserted here
	// depends on it, but its being scheduled is asserted.
	let timersScheduled = 0
	win.setTimeout = () => {
		timersScheduled += 1
		return timersScheduled
	}
	win.clearTimeout = () => {}

	const registration = loadBundle(win)

	/* ---- mount through a slots service that really renders ---- */

	const exports = registration.factory((specifier) => {
		if (specifier === "react") return React
		throw new Error(`unexpected require(${JSON.stringify(specifier)})`)
	})

	/** Mount one canvas into its own container with its own locale service. */
	let hosts = 0
	const mountInto = (locale) => {
		hosts += 1
		const node = win.document.createElement("div")
		node.id = `host-${hosts}`
		win.document.body.appendChild(node)
		const root = ReactDOMClient.createRoot(node)
		const effects = []
		const ctx = {
			get: (name) => (name === "locale" ? locale : undefined),
			effect(callback) {
				effects.push(callback())
				return () => {}
			},
			slots: {
				inject: (_key, callback) => callback(),
				register(entry, component) {
					const props = Object.assign({}, entry.inject("session-1"), {
						sessionId: "session-1",
						useChat: (selector) => selector(createChatSnapshot()),
						viewRequest: null,
						openView: () => {},
						completeViewRequest: () => {}
					})
					act(() => {
						root.render(React.createElement(component, props))
					})
					return () => {}
				}
			}
		}
		exports.apply(ctx)
		const within = (selector) => Array.from(node.querySelectorAll(selector))
		return { root, effects, node, within }
	}

	const locale = createLocale({ active: "zh" })
	const canvas = mountInto(locale)

	// Scoped to the first canvas: later mounts in the same document must not
	// be able to satisfy an assertion about it.
	const SCOPE = "#host-1"
	const q = (selector) => win.document.querySelector(`${SCOPE} ${selector}`)
	const qa = (selector) => Array.from(win.document.querySelectorAll(`${SCOPE} ${selector}`))
	const qdoc = (selector) => Array.from(win.document.querySelectorAll(selector))
	const cards = () => qa(".dshc-card")
	const layout = () => win.localStorage.getItem("dsh-canvas:layout:session-1")

	/** Dispatch an event and let React flush every state update it causes. */
	const fire = async (target, event) => {
		await act(async () => {
			target.dispatchEvent(event)
		})
	}
	const click = (target) => fire(target, new win.MouseEvent("click", { bubbles: true }))
	const pointer = (type, x, y) => {
		const Ctor = win.PointerEvent ?? win.MouseEvent
		const event = new Ctor(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y })
		if (event.pointerId === undefined) Object.defineProperty(event, "pointerId", { value: 1 })
		return event
	}
	const scaleOf = () => Number(/scale\(([\d.]+)\)/.exec(q(".dshc-world").style.transform)[1])

	await t.test("it mounts into the conversation view and draws one card per record", () => {
		assert.equal(qa(".dshc-root").length, 1, "the canvas root is in the document")
		assert.equal(cards().length, 5, "one card per Chat node")
		assert.equal(qa(".dshc-wire").length, 4, "one wire between each neighbouring pair")
		assert.deepEqual(
			cards().map((card) => card.dataset.role),
			["intent", "ai", "action", "choice", "ai"]
		)
		assert.match(win.document.body.textContent, /思考画布/)

		const style = qdoc("style").find((tag) => tag.dataset.plugin === "dsh-canvas")
		assert.ok(style, "the stylesheet is installed in the document head")
		assert.match(style.textContent, /--dsw-alias-bg-base/, "surfaces come from published theme tokens")
	})

	await t.test("clicking a card opens its source text in the detail panel", async () => {
		assert.match(q(".dshc-panel").textContent, /点一张卡片/)
		await click(cards()[0])
		assert.equal(cards()[0].dataset.active, "true")
		assert.match(q(".dshc-panel").textContent, /核对这份报价单/)
		assert.match(q(".dshc-panel").textContent, /第 1 轮 · 步骤 0 · 序号 1/)
	})

	await t.test("the ＋ control selects a card and the tray offers an export", async () => {
		assert.match(q(".dshc-tray").textContent, /还没选卡片/)
		await click(q(".dshc-pick"))
		assert.match(q(".dshc-tray").textContent, /已选 1 张/)
		assert.equal(cards()[0].dataset.selected, "true")
	})

	await t.test("exporting the selection produces Markdown carrying provenance", async () => {
		const button = qa(".dshc-tray button").find((item) => /Markdown/.test(item.textContent))
		assert.ok(button, "the Markdown export button exists")
		await click(button)
		assert.equal(downloads.length, 1, "one download was produced")
		const text = await downloads[0].text()
		assert.match(text, /^# 思考画布导出/)
		assert.match(text, /来源:第 1 轮 · 步骤 0 · 序号 1/)
		assert.match(text, /核对这份报价单/)
		assert.ok(timersScheduled > 0, "the confirmation toast was scheduled")
	})

	await t.test("dragging a card moves it and writes the layout to storage", async () => {
		assert.equal(layout(), null, "nothing is stored before a drag")
		assert.equal(scaleOf(), 0.85, "the first rollout is at the default zoom")

		const slot = cards()[0].parentElement
		const before = slot.style.left
		await fire(slot, pointer("pointerdown", 100, 100))
		await fire(slot, pointer("pointermove", 180, 140))
		await fire(slot, pointer("pointerup", 180, 140))

		assert.notEqual(cards()[0].parentElement.style.left, before, "the card moved on screen")
		const stored = JSON.parse(layout())
		assert.ok(stored.n1, "the dragged card was persisted")
		assert.equal(stored.n1.y, 40 / 0.85, "the delta is divided by the zoom")
	})

	await t.test("dragging empty space pans without writing a layout", async () => {
		const storedBefore = layout()
		const transformBefore = q(".dshc-world").style.transform
		const stage = q(".dshc-stage")
		await fire(stage, pointer("pointerdown", 10, 10))
		await fire(stage, pointer("pointermove", 70, 50))
		await fire(stage, pointer("pointerup", 70, 50))
		assert.notEqual(q(".dshc-world").style.transform, transformBefore, "the viewport moved")
		assert.equal(layout(), storedBefore, "panning writes no layout")
	})

	await t.test("the wheel re-zooms around the cursor and stays inside the clamp", async () => {
		const before = q(".dshc-world").style.transform
		await fire(q(".dshc-stage"), new win.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120, clientX: 200, clientY: 150 }))
		assert.notEqual(q(".dshc-world").style.transform, before, "the world transform changed")
		assert.ok(scaleOf() > 0.85 && scaleOf() <= 1.8, `zoomed in and clamped: ${scaleOf()}`)

		for (let index = 0; index < 40; index += 1) {
			await fire(q(".dshc-stage"), new win.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120, clientX: 200, clientY: 150 }))
		}
		assert.equal(scaleOf(), 0.3, "zooming all the way out stops at MIN_ZOOM")
	})

	await t.test("searching dims the cards that do not match", async () => {
		const input = q(".dshc-input")
		const setValue = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set
		await act(async () => {
			setValue.call(input, "报价单")
			input.dispatchEvent(new win.Event("input", { bubbles: true }))
		})
		assert.equal(qa('.dshc-card[data-muted="true"]').length, 4, "every non-matching card is dimmed")
		assert.equal(qa('.dshc-card[data-muted="false"]').length, 1)
		// Dimming keeps the card on the map, so "shown" stays at the full count
		// while the hit count reports how many actually matched.
		assert.match(q(".dshc-count").textContent, /5 \/ 5 张 · 1 张命中/)
	})

	await t.test("switching the language re-renders the copy", async () => {
		assert.match(q(".dshc-bar h2").textContent, /思考画布/)
		await act(async () => {
			locale.setActive("en")
		})
		assert.match(q(".dshc-bar h2").textContent, /Thinking Canvas/)
		assert.equal(qa(".dshc-chip").length, 5, "the role chips re-localized with it")
		await act(async () => {
			locale.setActive("zh")
		})
		assert.match(q(".dshc-bar h2").textContent, /思考画布/)
	})

	await t.test("a role chip filters the map and the count follows", async () => {
		const chip = qa(".dshc-chip").find((item) => /AI 的贡献/.test(item.textContent))
		assert.ok(chip, "the AI role chip exists")
		await click(chip)
		assert.equal(cards().length, 3, "the two AI cards are gone from the map")
		assert.match(q(".dshc-count").textContent, /3 \/ 5 张/)
	})

	await t.test("Escape clears the open card", async () => {
		assert.equal(qa('.dshc-card[data-active="true"]').length, 1, "a card is open")
		await fire(win, new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
		assert.equal(qa('.dshc-card[data-active="true"]').length, 0)
	})

	await t.test("unloading removes the stylesheet from the document", () => {
		const owned = () => qdoc("style").filter((tag) => tag.dataset.plugin === "dsh-canvas").length
		assert.equal(owned(), 1)
		for (const dispose of canvas.effects) dispose()
		assert.equal(owned(), 0)
	})

	await t.test("a locale snapshot that is not cached by identity does not loop", () => {
		// React re-renders forever when `useSyncExternalStore` gets a snapshot
		// whose identity changes on every read. The plugin reads the bare
		// revision number for exactly this reason, so a churning locale service
		// must render once and settle.
		const churning = mountInto(createLocale({ active: "zh", churn: true }))
		assert.equal(churning.within(".dshc-card").length, 5)
		assert.match(churning.node.textContent, /思考画布/)
	})
})

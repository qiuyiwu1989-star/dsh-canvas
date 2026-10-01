/**
 * Contract tests for the client bundle: what it registers, what it reads out of
 * a Chat snapshot, and that the view actually renders.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { loadClientBundle, createContext, createLocale, createChatSnapshot, makeTranslate, treeText, treeFind, plain } from "./harness.mjs"

const NS = "dsh-canvas"

test("the bundle registers itself under the package id", async () => {
	const { registration } = await loadClientBundle()
	assert.equal(registration.id, NS)
	assert.equal(typeof registration.factory, "function")
})

test("the bundle requires nothing beyond React", async () => {
	// loadClientBundle throws on any unexpected require(), so reaching the
	// assertions is itself the check that no other module was asked for.
	const { exports } = await loadClientBundle()
	assert.equal(typeof exports.apply, "function")
	assert.deepEqual([...exports.inject], ["slots"])
})

test("apply registers one conversation view and one stylesheet", async () => {
	const { exports, document } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)

	assert.deepEqual(ctx.slotWaits, ["conversation.view"])
	assert.equal(ctx.registrations.length, 1)

	const { registration } = ctx.registrations[0]
	assert.equal(registration.name, "conversation.view")
	assert.equal(registration.id, "canvas")
	assert.equal(registration.order, 30, "the canvas must sit after chat(0), trajectory(10) and graph(20)")
	assert.equal(typeof registration.label, "function")

	const styleTags = document.headTags.filter((tag) => tag.dataset.plugin === NS)
	assert.equal(styleTags.length, 1, "exactly one stylesheet tag is installed")
	assert.match(styleTags[0].textContent, /\.dshc-root/)
})

test("the registered label and injected props follow the active locale", async () => {
	const { exports } = await loadClientBundle()
	const locale = createLocale({ active: "en" })
	const ctx = createContext({ locale })
	exports.apply(ctx)

	const { registration } = ctx.registrations[0]
	assert.equal(registration.label(), "Canvas")

	const injected = registration.inject("session-1")
	assert.equal(typeof injected.canvasT, "function")
	assert.equal(injected.canvasT("role.intent"), "My intent")
	assert.equal(typeof injected.canvasLocale.getSnapshot, "function")
})

test("apply works without a locale service", async () => {
	const { exports } = await loadClientBundle({ language: "en-GB" })
	const ctx = createContext({ locale: null })
	exports.apply(ctx)

	const { registration } = ctx.registrations[0]
	assert.equal(registration.label(), "Canvas", "falls back to navigator.language")
	assert.equal(registration.inject("s").canvasLocale, undefined)
})

test("readCards maps Chat node kinds onto canvas roles in order", async () => {
	const { exports } = await loadClientBundle()
	const { readCards } = exports.__internals
	const t = makeTranslate(exports.__internals.DICTS.zh)

	const read = readCards(createChatSnapshot(), t)
	assert.equal(read.error, undefined)
	assert.equal(read.cards.length, 5)
	assert.deepEqual(
		plain(read.cards.map((card) => card.role)),
		["intent", "ai", "action", "choice", "ai"]
	)
	assert.deepEqual(
		plain(read.cards.map((card) => card.turn)),
		[1, 1, 1, 1, 2]
	)
	assert.deepEqual(
		plain(read.cards.map((card) => card.seq)),
		[1, 2, 3, 4, 5]
	)
})

test("readCards keeps reasoning out of the visible text", async () => {
	const { exports } = await loadClientBundle()
	const t = makeTranslate(exports.__internals.DICTS.zh)
	const { cards } = exports.__internals.readCards(createChatSnapshot(), t)

	const assistant = cards.find((card) => card.seq === 2)
	assert.match(assistant.text, /三处对不上/)
	assert.doesNotMatch(assistant.text, /四舍五入/)
	assert.match(assistant.reasoning, /四舍五入/)
})

test("readCards marks a running assistant step and a running tool call", async () => {
	const { exports } = await loadClientBundle()
	const t = makeTranslate(exports.__internals.DICTS.zh)
	const { cards } = exports.__internals.readCards(createChatSnapshot(), t)

	assert.equal(cards.find((card) => card.seq === 3).running, true, "a tool root without a settled kind is running")
	assert.equal(cards.find((card) => card.seq === 5).running, true, "an assistant step with status running is running")
	assert.equal(cards.find((card) => card.seq === 2).running, false)
})

test("readCards names a tool card after the wire tool name", async () => {
	const { exports } = await loadClientBundle()
	const t = makeTranslate(exports.__internals.DICTS.zh)
	const { cards } = exports.__internals.readCards(createChatSnapshot(), t)
	assert.equal(cards.find((card) => card.role === "action").title, "read")
})

test("readCards tolerates an absent or hostile snapshot", async () => {
	const { exports } = await loadClientBundle()
	const t = makeTranslate(exports.__internals.DICTS.zh)
	const { readCards } = exports.__internals

	assert.deepEqual(plain(readCards(undefined, t)), { cards: [] })
	assert.deepEqual(plain(readCards(null, t)), { cards: [] })
	assert.deepEqual(plain(readCards({}, t)), { cards: [] })

	const hostile = {
		nodes: {
			values() {
				throw new Error("snapshot exploded")
			}
		}
	}
	const read = readCards(hostile, t)
	assert.equal(read.cards.length, 0)
	assert.equal(read.error, "snapshot exploded")
})

test("readCards skips nodes that carry nothing to draw", async () => {
	const { exports } = await loadClientBundle()
	const t = makeTranslate(exports.__internals.DICTS.zh)
	const snapshot = {
		nodes: {
			values: () => [
				{ key: "empty", kind: "user", anchorSeq: 1, location: {}, data: { content: [] } },
				{ key: "kept", kind: "user", anchorSeq: 2, location: { turn: 1 }, data: { content: [{ type: "text", text: "有内容" }] } }
			]
		}
	}
	const { cards } = exports.__internals.readCards(snapshot, t)
	assert.equal(cards.length, 1)
	assert.equal(cards[0].key, "kept")
})

test("layoutCards puts one column per turn", async () => {
	const { exports } = await loadClientBundle()
	const { layoutCards } = exports.__internals
	const placed = plain(
		layoutCards([
			{ key: "a", turn: 1 },
			{ key: "b", turn: 1 },
			{ key: "c", turn: 2 }
		])
	)
	assert.deepEqual(placed.a, { x: 316, y: 0 })
	assert.deepEqual(placed.b, { x: 316, y: 216 })
	assert.deepEqual(placed.c, { x: 632, y: 0 })
})

test("the sample canvas is bilingual, self-consistent and flagged as a sample", async () => {
	const { exports } = await loadClientBundle()
	const { sampleCards, ROLES } = exports.__internals

	for (const lang of ["zh", "en"]) {
		const cards = sampleCards(lang)
		assert.equal(cards.length, 5)
		for (const card of cards) {
			assert.equal(card.sample, true)
			assert.ok(ROLES.includes(card.role), `${card.role} is a declared role`)
			assert.ok(card.title.length > 0)
			assert.ok(card.text.length > 0)
		}
		assert.deepEqual(
			plain(cards.map((card) => card.role)),
			["intent", "ai", "choice", "action", "result"]
		)
	}
	assert.notEqual(sampleCards("zh")[0].text, sampleCards("en")[0].text)
})

test("every role has a label in every dictionary", async () => {
	const { exports } = await loadClientBundle()
	const { DICTS, ROLES } = exports.__internals
	for (const [lang, dict] of Object.entries(DICTS)) {
		for (const role of ROLES) assert.ok(dict[`role.${role}`], `${lang} is missing role.${role}`)
		const missing = Object.keys(DICTS.zh).filter((key) => dict[key] === undefined)
		assert.deepEqual(missing, [], `${lang} is missing keys present in zh`)
	}
})

test("the view renders a live session as cards", async () => {
	const { exports } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)
	const { registration, component } = ctx.registrations[0]

	const snapshot = createChatSnapshot()
	const props = Object.assign({}, registration.inject("session-1"), {
		sessionId: "session-1",
		useChat: (selector) => selector(snapshot)
	})

	const tree = component(props)
	const text = treeText(tree)

	assert.match(text, /思考画布/)
	assert.match(text, /我的意图/)
	assert.match(text, /工具动作/)
	assert.match(text, /read/)

	const cards = treeFind(tree, (element) => element.props?.className === "dshc-card")
	assert.equal(cards.length, 5)
	assert.deepEqual(
		plain(cards.map((card) => card.props["data-role"])),
		["intent", "ai", "action", "choice", "ai"]
	)

	const wires = treeFind(tree, (element) => element.props?.className === "dshc-wire")
	assert.equal(wires.length, 4, "one wire between each neighbouring pair")
	assert.equal(wires[3].props["data-cross"], "turn", "the last wire crosses a turn boundary")
})

test("the view renders an empty state when the session has nothing to draw", async () => {
	const { exports } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)
	const { registration, component } = ctx.registrations[0]

	const props = Object.assign({}, registration.inject("session-1"), {
		sessionId: "session-1",
		useChat: (selector) => selector({ nodes: { values: () => [] } })
	})

	const text = treeText(component(props))
	assert.match(text, /还没有可画的对话/)
	assert.match(text, /打开示例画布/)
})

test("the view still renders when the Chat hook is unavailable", async () => {
	const { exports } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)
	const { registration, component } = ctx.registrations[0]

	const text = treeText(component(Object.assign({}, registration.inject("session-1"), { sessionId: "session-1" })))
	assert.match(text, /还没有可画的对话/)
})

test("the view reports a snapshot it could not read", async () => {
	const { exports } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)
	const { registration, component } = ctx.registrations[0]

	const hostile = {
		nodes: {
			values() {
				throw new Error("boom")
			}
		}
	}
	const text = treeText(
		component(
			Object.assign({}, registration.inject("session-1"), {
				sessionId: "session-1",
				useChat: (selector) => selector(hostile)
			})
		)
	)
	assert.match(text, /boom/)
})

test("the canvas writes its viewport into localStorage under the session id", async () => {
	const { exports, storage } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)
	const { registration, component } = ctx.registrations[0]

	// Reading the tree forces the wrapper and the live half to actually render,
	// which is what installs the viewport-persistence effect.
	const text = treeText(
		component(
			Object.assign({}, registration.inject("session-1"), {
				sessionId: "session-1",
				useChat: (selector) => selector(createChatSnapshot())
			})
		)
	)
	assert.match(text, /三处对不上/)

	const raw = storage.map.get("dsh-canvas:view:session-1")
	assert.ok(raw, "the viewport is persisted")
	const parsed = JSON.parse(raw)
	assert.equal(typeof parsed.zoom, "number")
	assert.equal(typeof parsed.x, "number")
	assert.equal(typeof parsed.y, "number")
})

test("dragging a card persists the layout for that session", async () => {
	const { exports, storage } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)
	const { registration, component } = ctx.registrations[0]

	const props = Object.assign({}, registration.inject("session-1"), {
		sessionId: "session-1",
		useChat: (selector) => selector(createChatSnapshot())
	})
	const tree = component(props)
	const stage = treeFind(tree, (element) => element.props?.className === "dshc-stage")[0]
	assert.ok(stage, "the stage renders")

	// A pointerdown whose target reports the first card, then a move, then up.
	const cardTarget = { dataset: { dshcKey: "n1" } }
	const at = (x, y) => ({
		button: 0,
		pointerId: 1,
		clientX: x,
		clientY: y,
		target: { closest: (selector) => (selector === "[data-dshc-key]" ? cardTarget : null) }
	})

	stage.props.onPointerDown(at(100, 100))
	stage.props.onPointerMove(at(160, 130))
	stage.props.onPointerUp(at(160, 130))

	const raw = storage.map.get("dsh-canvas:layout:session-1")
	assert.ok(raw, "the layout is persisted once the drag ends")
	const layout = JSON.parse(raw)
	assert.ok(layout.n1, "the dragged card is in the payload")
	// n1 is laid out at the turn-1 column, which the drag offset then moves by
	// the pointer delta divided by the current zoom.
	assert.equal(layout.n1.x, 316 + 60 / 0.85)
	assert.equal(layout.n1.y, 0 + 30 / 0.85)
})

test("dragging empty space pans instead of moving a card", async () => {
	const { exports, storage } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)
	const { registration, component } = ctx.registrations[0]

	const props = Object.assign({}, registration.inject("session-1"), {
		sessionId: "session-1",
		useChat: (selector) => selector(createChatSnapshot())
	})
	const tree = component(props)
	const stage = treeFind(tree, (element) => element.props?.className === "dshc-stage")[0]

	const empty = { button: 0, pointerId: 1, clientX: 10, clientY: 10, target: { closest: () => null } }
	stage.props.onPointerDown(empty)
	stage.props.onPointerMove(Object.assign({}, empty, { clientX: 60, clientY: 40 }))
	stage.props.onPointerUp(empty)

	assert.equal(storage.map.has("dsh-canvas:layout:session-1"), false, "panning writes no layout")
})

test("unloading the plugin removes the stylesheet it installed", async () => {
	const { exports, document } = await loadClientBundle()
	const ctx = createContext()
	exports.apply(ctx)

	const installed = () => document.headTags.filter((tag) => tag.dataset.plugin === NS).length
	assert.equal(installed(), 1)
	for (const effect of ctx.effects) effect.dispose()
	assert.equal(installed(), 0)
})

test("a second activation neither installs a second stylesheet nor steals the first one's", async () => {
	const { exports, document } = await loadClientBundle()
	const first = createContext()
	exports.apply(first)
	const second = createContext()
	exports.apply(second)

	const installed = () => document.headTags.filter((tag) => tag.dataset.plugin === NS).length
	assert.equal(installed(), 1, "one stylesheet for the page")

	// The owner unloads: the tag goes with it, and the survivor is left clean.
	for (const effect of first.effects) effect.dispose()
	assert.equal(installed(), 0)
})

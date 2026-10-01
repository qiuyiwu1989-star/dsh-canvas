/**
 * Test harness: load the client bundle the way the Web client loads it, and
 * render it with a stub React.
 *
 * The bundle is not an ES module — it calls `window.__ModuleLoader__.load` at
 * top level — so it is executed in a `node:vm` context with the globals a
 * browser would provide. The stub React implements the hook surface the canvas
 * uses by running each hook's function argument exactly once, which is enough
 * to walk the whole render path without a DOM.
 *
 * @module test/harness
 */

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import vm from "node:vm"

const here = dirname(fileURLToPath(import.meta.url))
export const root = join(here, "..")

/** `localStorage` backed by a plain Map, so tests can inspect what was written. */
export function createStorage() {
	const map = new Map()
	return {
		map,
		getItem: (key) => (map.has(key) ? map.get(key) : null),
		setItem: (key, value) => map.set(key, String(value)),
		removeItem: (key) => map.delete(key)
	}
}

/** Minimal `document` good enough for style-tag insertion and export anchors. */
export function createDocument() {
	const head = []
	const created = []
	const document = {
		head: {
			appendChild(node) {
				head.push(node)
			}
		},
		body: { appendChild() {}, removeChild() {} },
		headTags: head,
		createdTags: created,
		createElement(tag) {
			const element = {
				tagName: tag,
				dataset: {},
				textContent: "",
				style: {},
				children: [],
				href: "",
				download: "",
				click() {},
				remove() {
					const index = head.indexOf(element)
					if (index >= 0) head.splice(index, 1)
				}
			}
			created.push(element)
			return element
		},
		querySelector(selector) {
			const match = /^style\[data-plugin-css="(.*)"\]$/.exec(selector)
			if (match === null) return null
			return head.find((tag) => tag.dataset.pluginCss === match[1]) ?? null
		}
	}
	return document
}

/**
 * A React stand-in. `createElement` produces a plain tree node; hooks run their
 * function argument once so a single render pass produces real output.
 *
 * `useEffect` executes its callback immediately, which stands in for mount.
 * Cleanups are dropped: the stub renders one pass, so there is nothing to
 * unmount, and the plugin's teardown path is covered directly by disposing the
 * effects `ctx.effect` recorded.
 */
export function createReact() {
	return {
		createElement(type, props, ...children) {
			return { type, props: Object.assign({}, props, { children: children.flat() }) }
		},
		isValidElement: () => false,
		memo: (component) => component,
		useState(initial) {
			return [typeof initial === "function" ? initial() : initial, () => {}]
		},
		useReducer(_reducer, initial) {
			return [initial, () => {}]
		},
		useMemo(factory) {
			return factory()
		},
		useCallback(factory) {
			return factory
		},
		useRef(initial) {
			return { current: initial }
		},
		useEffect(effect) {
			effect()
		},
		useLayoutEffect(effect) {
			effect()
		},
		useSyncExternalStore(_subscribe, getSnapshot) {
			return getSnapshot()
		},
		useContext() {
			return undefined
		}
	}
}

/**
 * Resolve a tree node whose `type` is a component by rendering it, the way a
 * real renderer would. Host elements (`type` is a string) pass through.
 */
function resolve(node) {
	let current = node
	let guard = 0
	while (
		current !== null &&
		typeof current === "object" &&
		!Array.isArray(current) &&
		typeof current.type === "function"
	) {
		if (guard > 32) throw new Error("component tree did not settle — a component renders itself")
		guard += 1
		current = current.type(current.props)
	}
	return current
}

/**
 * Execute `lib/client.js` in a browser-like context.
 * @returns the registration the bundle handed to `window.__ModuleLoader__.load`.
 */
export async function loadClientBundle(options = {}) {
	const source = await readFile(join(root, "lib", "client.js"), "utf8")
	const storage = options.storage ?? createStorage()
	const document = options.document ?? createDocument()

	let registration
	const listeners = new Map()
	const window = {
		__ModuleLoader__: {
			load(entry) {
				registration = entry
			}
		},
		localStorage: storage,
		listeners,
		setTimeout: (fn) => setTimeout(fn, 0),
		clearTimeout: (handle) => clearTimeout(handle),
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, new Set())
			listeners.get(type).add(listener)
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener)
		},
		/** Fire every listener registered for one event type. */
		dispatch(type, event) {
			for (const listener of listeners.get(type) ?? []) listener(event)
		}
	}

	const sandbox = {
		window,
		document,
		navigator: { language: options.language ?? "zh-CN" },
		console,
		setTimeout,
		clearTimeout,
		Blob: class BlobStub {
			constructor(parts, opts) {
				this.parts = parts
				this.type = opts?.type
			}
		},
		URL: { createObjectURL: () => "blob:stub", revokeObjectURL: () => {} },
		Date,
		Math,
		JSON,
		Object,
		Array,
		Set,
		Map,
		Number,
		String,
		Boolean,
		Error,
		RegExp,
		Infinity,
		NaN,
		undefined
	}
	sandbox.globalThis = sandbox

	const react = options.react ?? createReact()
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: "lib/client.js" })

	if (registration === undefined) throw new Error("the bundle never called window.__ModuleLoader__.load")

	const exports = registration.factory((specifier) => {
		if (specifier === "react") return react
		throw new Error(`unexpected require(${JSON.stringify(specifier)})`)
	})

	return { registration, exports, react, window, document, storage, sandbox }
}

/** A fake locale service shaped like the shell's `ctx.locale`. */
export function createLocale(options = {}) {
	let current = options.active ?? "zh"
	const registrations = []
	const listeners = new Set()
	// The real service caches its snapshot, and `useSyncExternalStore` requires
	// that: a fresh object on every read is an infinite render loop. `churn`
	// reproduces the failure on purpose, for the test that pins the plugin's
	// tolerance of a snapshot whose identity is not reused.
	let revision = 1
	let cached = { active: current, locales: [], revision }
	return {
		registrations,
		register(namespace, id, dict) {
			registrations.push({ namespace, id, dict })
			return () => {}
		},
		bind(namespace) {
			return (key, params) => {
				const entry = registrations.find((item) => item.namespace === namespace && item.id === current)
				const template = entry?.dict?.[key]
				if (template === undefined) return key
				if (params === undefined) return template
				return template.replace(/\{(\w+)\}/g, (whole, name) =>
					Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
				)
			}
		},
		getSnapshot() {
			if (options.churn === true) return { active: current, locales: [], revision }
			return cached
		},
		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		/** Test helper: switch language the way the real service would. */
		setActive(next) {
			current = next
			revision += 1
			cached = { active: current, locales: [], revision }
			for (const listener of listeners) listener()
		}
	}
}

/**
 * A fake Cordis client context recording every effect and registration.
 * @param options.locale - locale service to expose, or `null` for none.
 */
export function createContext(options = {}) {
	const locale = options.locale === undefined ? createLocale() : options.locale
	const effects = []
	const slotWaits = []
	const registrations = []
	const ctx = {
		effects,
		slotWaits,
		registrations,
		get(name) {
			if (name === "locale") return locale === null ? undefined : locale
			return undefined
		},
		effect(callback, label) {
			const dispose = callback()
			effects.push({ label, dispose })
			return () => {}
		},
		slots: {
			inject(key, callback) {
				slotWaits.push(key)
				const disposers = []
				const result = callback()
				if (typeof result === "function") disposers.push(result)
				else if (result !== undefined && result !== null && typeof result[Symbol.iterator] === "function") disposers.push(...result)
				return () => {
					for (const dispose of disposers) dispose()
				}
			},
			register(registration, component) {
				registrations.push({ registration, component })
				return () => {}
			}
		}
	}
	return ctx
}

/** Build a translator from one of the bundle's dictionaries. */
export function makeTranslate(dict) {
	return (key, params) => {
		const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
		if (params === undefined) return template
		return template.replace(/\{(\w+)\}/g, (whole, name) =>
			Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
		)
	}
}

/**
 * Copy a value into this realm's objects.
 *
 * Values produced inside the bundle's `node:vm` context carry that realm's
 * `Array` and `Object` prototypes, and `node:assert/strict` compares prototypes
 * as well as structure — so a structurally identical array would still fail.
 * Normalizing through JSON makes the assertion about the data, which is what
 * the test is actually claiming.
 */
export function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

/** Concatenate every text node under a rendered element tree. */
export function treeText(node) {
	const resolved = resolve(node)
	if (resolved === null || resolved === undefined || resolved === false || resolved === true) return ""
	if (typeof resolved === "string" || typeof resolved === "number") return String(resolved)
	if (Array.isArray(resolved)) return resolved.map(treeText).join(" ")
	if (typeof resolved === "object" && resolved.props !== undefined) return treeText(resolved.props.children)
	return ""
}

/** Collect every element of one `type` under a rendered element tree. */
export function treeFind(node, predicate, found = []) {
	const resolved = resolve(node)
	if (resolved === null || resolved === undefined || typeof resolved !== "object") return found
	if (Array.isArray(resolved)) {
		for (const child of resolved) treeFind(child, predicate, found)
		return found
	}
	if (resolved.type !== undefined && predicate(resolved)) found.push(resolved)
	treeFind(resolved.props?.children, predicate, found)
	return found
}

/** A synthetic Chat snapshot with the node shapes the canvas reads. */
export function createChatSnapshot() {
	const nodes = [
		{
			key: "n1",
			kind: "user",
			anchorSeq: 1,
			location: { kind: "turn", turn: 1 },
			data: { content: [{ type: "text", text: "帮我核对这份报价单的三处金额。" }] }
		},
		{
			key: "n2",
			kind: "assistant-step",
			anchorSeq: 2,
			location: { kind: "step", turn: 1, step: 1 },
			data: {
				status: "settled",
				turn: 1,
				step: 1,
				blocks: [
					{ kind: "reasoning", text: "先看合计,再看单价的四舍五入。" },
					{ kind: "text", text: "三处对不上:第 2 行小计、税费、合计。" }
				]
			}
		},
		{
			key: "n3",
			kind: "tool-call",
			anchorSeq: 3,
			location: { kind: "step", turn: 1, step: 2 },
			data: { root: { callId: "c1", name: "read", argsRaw: '{"file_path":"quote.xlsx"}' } }
		},
		{ key: "n4", kind: "steering", anchorSeq: 4, location: { kind: "step", turn: 1, step: 3 }, data: { content: [{ type: "text", text: "只改合计,别动单价。" }] } },
		{
			key: "n5",
			kind: "assistant-step",
			anchorSeq: 5,
			location: { kind: "step", turn: 2, step: 1 },
			data: { status: "running", turn: 2, step: 1, blocks: [{ kind: "text", text: "改完了,合计现在等于小计加税费。" }] }
		}
	]
	return {
		nodes: { values: () => nodes },
		order: nodes.map((node) => node.key),
		locations: { getTurn: () => [], getStep: () => [] },
		navigation: { items: () => [] },
		timeline: { turnOrder: [], turns: new Map() },
		legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] }
	}
}

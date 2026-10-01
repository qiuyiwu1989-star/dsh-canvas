#!/usr/bin/env node
/**
 * End-to-end smoke check, runnable without a browser.
 *
 * It does the four things that together decide whether this plugin works:
 *
 *  1. load `lib/client.js` the way the Web client loads it;
 *  2. mount it on a fake Cordis client context and read back the registration;
 *  3. render the registered view against a synthetic Session in both locales;
 *  4. rebuild `examples/sample-canvas.json` from the shipped sample and compare
 *     it with the committed fixture, so the example cannot drift from the code.
 *
 * Usage:
 *   node scripts/smoke.mjs           # verify (fails when the fixture is stale)
 *   node scripts/smoke.mjs --write   # regenerate the fixture
 */

import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { loadClientBundle, createContext, createLocale, createChatSnapshot, treeText, treeFind, root } from "../test/harness.mjs"

const write = process.argv.includes("--write")

const failures = []
function check(label, condition, detail) {
	if (condition) {
		process.stdout.write(`  ok   ${label}\n`)
		return
	}
	failures.push(`${label}${detail === undefined ? "" : ` — ${detail}`}`)
	process.stdout.write(`  FAIL ${label}${detail === undefined ? "" : ` — ${detail}`}\n`)
}

process.stdout.write("dsh-canvas smoke\n")

/* 1. the bundle loads and registers itself */

const { exports, registration, document } = await loadClientBundle()
check("bundle calls __ModuleLoader__.load once", registration !== undefined)
check("bundle registers under the package id", registration.id === "dsh-canvas", registration.id)
check("bundle exports apply and inject", typeof exports.apply === "function" && Array.isArray(exports.inject))

/* 2. it mounts and registers one conversation view */

const locale = createLocale({ active: "zh" })
const ctx = createContext({ locale })
exports.apply(ctx)

check("apply waits on the conversation view ring", ctx.slotWaits.join(",") === "conversation.view", ctx.slotWaits.join(","))
check("apply registers exactly one view", ctx.registrations.length === 1, String(ctx.registrations.length))
check("the stylesheet is installed", document.headTags.some((tag) => tag.dataset.plugin === "dsh-canvas"))

const { registration: view, component } = ctx.registrations[0]
check("view id is canvas", view.id === "canvas", view.id)
check("view sorts after graph", view.order === 30, String(view.order))
check("label is localized", view.label() === "画布", view.label())

/* 3. the view renders a session in both locales */

const snapshot = createChatSnapshot()

for (const active of ["zh", "en"]) {
	const perLocale = createContext({ locale: createLocale({ active }) })
	exports.apply(perLocale)
	const entry = perLocale.registrations[0]
	const props = Object.assign({}, entry.registration.inject("session-1"), {
		sessionId: "session-1",
		useChat: (selector) => selector(snapshot)
	})
	const tree = entry.component(props)
	const text = treeText(tree)
	const cards = treeFind(tree, (element) => element.props?.className === "dshc-card")
	const wires = treeFind(tree, (element) => element.props?.className === "dshc-wire")

	check(`[${active}] renders five cards`, cards.length === 5, String(cards.length))
	check(`[${active}] draws four wires`, wires.length === 4, String(wires.length))
	check(`[${active}] shows the view title`, entry.registration.label().length > 0)
	check(`[${active}] shows intent and tool roles`, /我的意图|My intent/.test(text) && /工具动作|Tool action/.test(text))
	check(`[${active}] names the tool call`, text.includes("read"))
}

/* 4. exports carry provenance */

const t = exports.__internals.makeFallbackTranslate()
const { cards } = exports.__internals.readCards(snapshot, t)
const markdown = exports.__internals.exportMarkdown(cards, "session-1", t)
const json = JSON.parse(exports.__internals.exportJson(cards, "session-1"))

check("markdown export lists every card", (markdown.match(/^## /gm) ?? []).length === cards.length)
check("markdown export carries provenance", /第 1 轮/.test(markdown) || /turn 1/.test(markdown))
check("json export is versioned", json.version === 1 && json.plugin === "dsh-canvas")
check("json export keeps the sequence number", json.cards.every((card) => Number.isFinite(card.seq)))

/* 5. the committed example matches the shipped sample */

const sample = exports.__internals.sampleCards("zh")
const fixture = {
	plugin: "dsh-canvas",
	version: 1,
	fictional: true,
	note: "Regenerate with: node scripts/smoke.mjs --write",
	cards: sample.map((card) => ({
		key: card.key,
		kind: card.kind,
		role: card.role,
		turn: card.turn,
		step: card.step,
		seq: card.seq,
		title: card.title,
		text: card.text,
		sample: true
	}))
}
const fixturePath = join(root, "examples", "sample-canvas.json")
const serialized = `${JSON.stringify(fixture, null, "\t")}\n`

if (write) {
	await writeFile(fixturePath, serialized, "utf8")
	process.stdout.write("  ok   examples/sample-canvas.json rewritten\n")
} else {
	const committed = await readFile(fixturePath, "utf8").catch(() => undefined)
	check(
		"examples/sample-canvas.json matches the shipped sample",
		committed === serialized,
		committed === undefined ? "the fixture is missing" : "run: node scripts/smoke.mjs --write"
	)
}

process.stdout.write(failures.length === 0 ? "\nsmoke: all checks passed\n" : `\nsmoke: ${failures.length} check(s) failed\n`)
process.exit(failures.length === 0 ? 0 : 1)

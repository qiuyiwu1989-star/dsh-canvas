/**
 * Thinking Canvas — DeepSeek Harness browser half.
 *
 * This file is a client bundle, not an ES module. The Web client loads it
 * through `window.__ModuleLoader__.load`, which registers a factory; running
 * the file only registers that factory, and the module body materializes on
 * first use. Platform modules (React here) resolve from the shell's frozen
 * module table through the `require` handed to the factory, so nothing is
 * bundled and nothing is installed.
 *
 * The plugin registers one entry in the conversation view ring
 * (`conversation.view`, id `canvas`) and renders the current Session as a
 * pan-and-zoom map of cards: intents, the AI's contributions, tool actions,
 * results, and the system events around them. Every card keeps the
 * `anchorSeq` of the Chat node behind it, so a card can always be traced back
 * to its source record.
 *
 * @see docs/ARCHITECTURE.md for the data contract this bundle reads.
 */

window.__ModuleLoader__.load({
	id: "dsh-canvas",
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports

		const React = require("react")

		/* ------------------------------------------------------------------ *
		 * 1. Copy
		 * ------------------------------------------------------------------ */

		const NS = "dsh-canvas"

		/**
		 * Dictionaries. The untyped `locale.register(ns, locale, dict)` form is
		 * the one an out-of-tree plugin uses: the typed form needs a namespace
		 * merged into the shell's `LocaleNamespaceMap`, which only in-tree
		 * packages can do.
		 */
		const DICTS = {
			zh: {
				"view.canvas": "画布",
				"canvas.title": "思考画布",
				"canvas.lead": "把这次会话摊开成一张图:我的意图、AI 的贡献、工具动作、成果。点卡片看原文。",
				"canvas.sample.badge": "示例 · 全部虚构",
				"canvas.sample.exit": "回到本次会话",
				"canvas.sample.enter": "打开示例画布",
				"canvas.empty.title": "这次会话还没有可画的对话",
				"canvas.empty.body": "发起一次提问,或者先看示例画布长什么样。",
				"canvas.search": "搜索卡片",
				"canvas.fit": "全览",
				"canvas.zoomOut": "缩小",
				"canvas.zoomIn": "放大",
				"canvas.allRoles": "全部",
				"canvas.mode.dim": "淡化其他",
				"canvas.mode.hide": "隐藏其他",
				"canvas.count": "{shown} / {total} 张",
				"canvas.hits": "{n} 张命中",
				"canvas.selected.none": "还没选卡片",
				"canvas.selected.count": "已选 {n} 张",
				"canvas.export.md": "导出选中为 Markdown",
				"canvas.export.json": "导出画布 JSON",
				"canvas.clear": "清空选择",
				"canvas.detail.empty": "点一张卡片,这里显示它的原文与出处。",
				"canvas.detail.meta": "第 {turn} 轮 · 步骤 {step} · 序号 {seq}",
				"canvas.detail.add": "加入待用",
				"canvas.detail.remove": "从待用移除",
				"canvas.detail.sample": "示例卡片没有真实原文;打开一次真实会话就有了。",
				"canvas.detail.reasoning": "推理过程",
				"canvas.running": "进行中",
				"canvas.hint": "拖动空白平移 · 滚轮缩放 · 拖动卡片调整位置 · Esc 取消选择",
				"canvas.more": "展开全文",
				"canvas.less": "收起",
				"canvas.error": "画布没能读到这次会话的数据:{message}",
				"canvas.export.header": "# 思考画布导出",
				"canvas.export.lead": "来自会话 {session} 的 {n} 张卡片,按画布顺序排列。",
				"canvas.export.source": "来源:第 {turn} 轮 · 步骤 {step} · 序号 {seq}",
				"canvas.image": "[图片]",
				"role.intent": "我的意图",
				"role.choice": "我的选择",
				"role.ai": "AI 的贡献",
				"role.action": "工具动作",
				"role.result": "成果",
				"role.context": "上下文",
				"role.system": "系统",
				"role.error": "出错",
				"role.other": "其他"
			},
			en: {
				"view.canvas": "Canvas",
				"canvas.title": "Thinking Canvas",
				"canvas.lead": "Lay this session out as one map: your intents, the AI's contributions, tool actions and results. Click a card for its source text.",
				"canvas.sample.badge": "Sample · entirely fictional",
				"canvas.sample.exit": "Back to this session",
				"canvas.sample.enter": "Open the sample canvas",
				"canvas.empty.title": "Nothing to draw in this session yet",
				"canvas.empty.body": "Send a message, or look at what the sample canvas looks like.",
				"canvas.search": "Search cards",
				"canvas.fit": "Fit",
				"canvas.zoomOut": "Zoom out",
				"canvas.zoomIn": "Zoom in",
				"canvas.allRoles": "All",
				"canvas.mode.dim": "Dim others",
				"canvas.mode.hide": "Hide others",
				"canvas.count": "{shown} / {total} cards",
				"canvas.hits": "{n} matched",
				"canvas.selected.none": "No cards selected",
				"canvas.selected.count": "{n} selected",
				"canvas.export.md": "Export selection as Markdown",
				"canvas.export.json": "Export canvas JSON",
				"canvas.clear": "Clear selection",
				"canvas.detail.empty": "Click a card to read its source text and provenance here.",
				"canvas.detail.meta": "Turn {turn} · step {step} · seq {seq}",
				"canvas.detail.add": "Add to selection",
				"canvas.detail.remove": "Remove from selection",
				"canvas.detail.sample": "Sample cards carry no real source text; open a real session to see it.",
				"canvas.detail.reasoning": "Reasoning",
				"canvas.running": "running",
				"canvas.hint": "Drag empty space to pan · wheel to zoom · drag a card to move it · Esc clears the selection",
				"canvas.more": "Show full text",
				"canvas.less": "Collapse",
				"canvas.error": "The canvas could not read this session: {message}",
				"canvas.export.header": "# Thinking Canvas export",
				"canvas.export.lead": "{n} cards from session {session}, in canvas order.",
				"canvas.export.source": "Source: turn {turn} · step {step} · seq {seq}",
				"canvas.image": "[image]",
				"role.intent": "My intent",
				"role.choice": "My choice",
				"role.ai": "AI contribution",
				"role.action": "Tool action",
				"role.result": "Result",
				"role.context": "Context",
				"role.system": "System",
				"role.error": "Error",
				"role.other": "Other"
			}
		}

		/** Replace `{name}` placeholders; unknown names are left alone. */
		function format(template, params) {
			if (params === undefined) return template
			return template.replace(/\{(\w+)\}/g, (whole, name) =>
				Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
			)
		}

		/** Translator used when the shell's locale service is unavailable. */
		function makeFallbackTranslate() {
			let locale = "en"
			try {
				const tag = String((typeof navigator !== "undefined" && navigator.language) || "en")
				if (tag.toLowerCase().startsWith("zh")) locale = "zh"
			} catch {
				/* no navigator — keep English */
			}
			const dict = DICTS[locale] || DICTS.en
			return (key, params) => format(Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key, params)
		}

		/* ------------------------------------------------------------------ *
		 * 2. Roles
		 * ------------------------------------------------------------------ */

		/**
		 * Canvas roles. The taxonomy is deliberately about who contributed
		 * what — not about the wire shape of the event — because that is the
		 * question a session map has to answer.
		 */
		const ROLES = ["intent", "choice", "ai", "action", "result", "context", "system", "error", "other"]

		/** Chat node kind → canvas role. Unknown kinds fall back to `other`. */
		const ROLE_OF_KIND = {
			user: "intent",
			steering: "choice",
			"assistant-step": "ai",
			"tool-call": "action",
			"workflow-run": "action",
			command: "action",
			"command-input": "action",
			context: "context",
			"system-prompt": "context",
			compaction: "system",
			"manual-compaction": "system",
			"model-retry": "system",
			"turn-process": "system",
			"turn-tail": "result",
			"turn-error": "error",
			"turn-max-tokens": "error"
		}

		/* ------------------------------------------------------------------ *
		 * 3. Reading the live Session
		 * ------------------------------------------------------------------ */

		/**
		 * Fields a text projection may descend into. A whitelist, not a deep
		 * walk: Chat node payloads hold live objects (attachments, tool
		 * lifecycles), and a generic traversal would end up displaying or
		 * copying runtime state instead of the text a reader asked for.
		 */
		const TEXT_KEYS = ["text", "content", "summary", "message", "title", "argsRaw", "blocks", "items"]

		const TEXT_BUDGET = 8000
		const PREVIEW_LIMIT = 320

		/**
		 * Project a bounded amount of plain text out of one payload.
		 * @param value - any value found on the whitelisted path.
		 * @param out - accumulated string fragments.
		 * @param depth - recursion depth so far.
		 * @param budget - mutable remaining-character budget.
		 */
		function collectText(value, out, depth, budget) {
			if (budget.left <= 0 || depth > 3) return
			if (typeof value === "string") {
				const slice = value.slice(0, Math.max(0, budget.left))
				budget.left -= slice.length
				if (slice.trim() !== "") out.push(slice)
				return
			}
			if (value === null || typeof value !== "object") return
			if (Array.isArray(value)) {
				for (let index = 0; index < value.length && index < 32; index += 1) collectText(value[index], out, depth + 1, budget)
				return
			}
			if (React.isValidElement(value)) return
			for (const key of TEXT_KEYS) {
				if (Object.prototype.hasOwnProperty.call(value, key)) collectText(value[key], out, depth + 1, budget)
			}
		}

		function textOf(value, limit) {
			const out = []
			collectText(value, out, 0, { left: limit })
			return out.join("\n").trim()
		}

		/** First non-empty line, used as a card title when a payload has no name. */
		function firstLine(text, limit) {
			const flat = String(text || "").replace(/[ \t]+/g, " ").trim()
			if (flat === "") return ""
			const line = flat.split("\n")[0].trim()
			return line.length > limit ? `${line.slice(0, limit)}…` : line
		}

		/** User and steering payloads carry `content`, an array of typed blocks. */
		function readUserText(data, t) {
			const parts = []
			const blocks = Array.isArray(data && data.content) ? data.content : []
			for (const block of blocks) {
				if (block === null || typeof block !== "object") continue
				if (block.type === "image") parts.push(t("canvas.image"))
				else if (typeof block.text === "string") parts.push(block.text)
			}
			const joined = parts.join("\n").trim()
			return joined !== "" ? joined : textOf(data, TEXT_BUDGET)
		}

		/** Assistant payloads carry `blocks`; reasoning is kept apart on purpose. */
		function readAssistantText(data, t) {
			const text = []
			const reasoning = []
			const blocks = Array.isArray(data && data.blocks) ? data.blocks : []
			for (const block of blocks) {
				if (block === null || typeof block !== "object") continue
				if (block.kind === "text" && typeof block.text === "string") text.push(block.text)
				else if (block.kind === "reasoning" && typeof block.text === "string") reasoning.push(block.text)
				else if (block.kind === "image") text.push(t("canvas.image"))
			}
			return { text: text.join("\n").trim(), reasoning: reasoning.join("\n").trim() }
		}

		/**
		 * Turn one Chat node into one canvas card. Only leaf fields are read;
		 * the node itself is never retained on the card.
		 * @param node - a Chat node from the live snapshot.
		 * @param t - translator.
		 * @returns a card, or undefined when the node carries nothing to draw.
		 */
		function cardFromChatNode(node, t) {
			if (node === null || typeof node !== "object") return undefined
			const kind = typeof node.kind === "string" ? node.kind : "unknown"
			const role = Object.prototype.hasOwnProperty.call(ROLE_OF_KIND, kind) ? ROLE_OF_KIND[kind] : "other"
			const data = node.data !== null && typeof node.data === "object" ? node.data : {}
			const location = node.location !== null && typeof node.location === "object" ? node.location : {}

			let title = ""
			let text = ""
			let reasoning = ""
			let running = false

			if (kind === "user" || kind === "steering") {
				text = readUserText(data, t)
				title = firstLine(text, 48)
			} else if (kind === "assistant-step") {
				const read = readAssistantText(data, t)
				text = read.text
				reasoning = read.reasoning
				running = data.status === "running"
				title = firstLine(text, 48) || t("role.ai")
			} else if (kind === "tool-call") {
				const root = data.root !== null && typeof data.root === "object" ? data.root : {}
				title = typeof root.name === "string" && root.name !== "" ? root.name : t("role.action")
				text = typeof root.argsRaw === "string" ? root.argsRaw : ""
				running = !Object.prototype.hasOwnProperty.call(root, "kind")
			} else {
				text = textOf(data, 4000)
				title = firstLine(text, 48) || t(`role.${role}`)
			}

			if (title === "" && text === "" && reasoning === "") return undefined

			const turn = Number.isFinite(location.turn) ? location.turn : 0
			const step = Number.isFinite(location.step) ? location.step : 0
			const seq = Number.isFinite(node.anchorSeq) ? node.anchorSeq : 0
			const key = typeof node.key === "string" && node.key !== "" ? node.key : `${kind}:${seq}:${turn}:${step}`

			return { key, kind, role, turn, step, seq, running, title, text, reasoning, sample: false }
		}

		/**
		 * Read the whole loaded window as canvas cards.
		 * @param snapshot - the Chat target snapshot, or undefined.
		 * @param t - translator.
		 * @returns `{ cards, error }`; `error` is set when an unreadable
		 * snapshot arrived, so the view can say so instead of showing an empty map.
		 */
		function readCards(snapshot, t) {
			try {
				if (snapshot === null || typeof snapshot !== "object") return { cards: [] }
				const source = snapshot.nodes !== null && typeof snapshot.nodes === "object" ? snapshot.nodes : undefined
				const nodes = source !== undefined && typeof source.values === "function" ? source.values() : []
				const list = Array.isArray(nodes) ? nodes : []
				const cards = []
				for (const node of list) {
					const card = cardFromChatNode(node, t)
					if (card !== undefined) cards.push(card)
				}
				cards.sort((left, right) => left.turn - right.turn || left.seq - right.seq)
				return { cards }
			} catch (error) {
				return { cards: [], error: error instanceof Error ? error.message : String(error) }
			}
		}

		/* ------------------------------------------------------------------ *
		 * 4. Sample canvas
		 * ------------------------------------------------------------------ */

		/**
		 * A fictional five-card story used when a session has nothing to draw.
		 * Every word is invented; no real transcript, name or file is involved.
		 */
		function sampleCards(lang) {
			const zh = lang === "zh"
			return [
				{
					key: "sample:1",
					kind: "user",
					role: "intent",
					turn: 1,
					step: 0,
					seq: 1,
					title: zh ? "把社区读书会做成一个报名页" : "Turn the reading club into a sign-up page",
					text: zh
						? "我们社区每月有一次读书会,现在靠群里接龙。想做一个简单报名页,能看还剩几个名额,报名后能收到提醒。这次只做报名,不做支付。"
						: "Our neighbourhood runs a monthly reading club and sign-ups happen in a chat thread. I want a simple sign-up page that shows the remaining seats and reminds people after they sign up. This round is sign-up only — no payments.",
					reasoning: "",
					running: false,
					sample: true
				},
				{
					key: "sample:2",
					kind: "assistant-step",
					role: "ai",
					turn: 1,
					step: 1,
					seq: 2,
					title: zh ? "先定人数上限放在哪里" : "Decide where the seat limit lives",
					text: zh
						? "建议先把「名额」定成一个明确数字,而不是一个状态:上限写死在页面配置里,已报名数从报名记录里数出来。这样页面任何时候都能自己算出剩余名额,不需要一个后台去维护它。"
						: "I suggest treating the seat limit as a declared number rather than a status: keep the cap in the page config and count the registrations. Then the page can always derive the remaining seats itself, with no back office maintaining it.",
					reasoning: "",
					running: false,
					sample: true
				},
				{
					key: "sample:3",
					kind: "steering",
					role: "choice",
					turn: 1,
					step: 2,
					seq: 3,
					title: zh ? "提醒改成活动前一天" : "Reminders move to the day before",
					text: zh
						? "不要报名后立刻提醒。改成活动前一天晚上提醒一次,当天早上再提醒一次。"
						: "Do not remind right after sign-up. Remind once the evening before the event and once on the morning of it.",
					reasoning: "",
					running: false,
					sample: true
				},
				{
					key: "sample:4",
					kind: "tool-call",
					role: "action",
					turn: 1,
					step: 3,
					seq: 4,
					title: "write",
					text: '{\n  "file_path": "…/signup/index.html",\n  "note": "single page, no build step"\n}',
					reasoning: "",
					running: false,
					sample: true
				},
				{
					key: "sample:5",
					kind: "assistant-step",
					role: "result",
					turn: 1,
					step: 4,
					seq: 5,
					title: zh ? "一个页面 + 一份名单" : "One page plus one roster",
					text: zh
						? "交付是一个零依赖的报名页,加一份可以直接打开的名单文件。剩余名额由页面上限减去名单行数得出。提醒改为活动前一天与当天早上各一次。没有支付、没有账号、没有后台。"
						: "Delivered one dependency-free sign-up page plus a roster file you can open directly. Remaining seats are the page cap minus the roster rows. Reminders fire the evening before and the morning of the event. No payments, no accounts, no back office.",
					reasoning: "",
					running: false,
					sample: true
				}
			]
		}

		/* ------------------------------------------------------------------ *
		 * 5. Layout and local state
		 * ------------------------------------------------------------------ */

		const COLUMN_WIDTH = 316
		const ROW_HEIGHT = 216
		const CARD_WIDTH = 252
		const CARD_HEIGHT = 196
		const MIN_ZOOM = 0.3
		const MAX_ZOOM = 1.8
		const PAD = 56

		/** Deterministic first-pass layout: one column per turn, stacked in seq order. */
		function layoutCards(cards) {
			const columns = new Map()
			const placed = {}
			for (const card of cards) {
				if (!columns.has(card.turn)) columns.set(card.turn, 0)
				const row = columns.get(card.turn)
				columns.set(card.turn, row + 1)
				placed[card.key] = { x: card.turn * COLUMN_WIDTH, y: row * ROW_HEIGHT }
			}
			return placed
		}

		const STORE_LAYOUT = "dsh-canvas:layout"
		const STORE_VIEW = "dsh-canvas:view"

		function readStore(key) {
			try {
				const raw = window.localStorage.getItem(key)
				return raw === null ? undefined : JSON.parse(raw)
			} catch {
				return undefined
			}
		}

		function writeStore(key, value) {
			try {
				window.localStorage.setItem(key, JSON.stringify(value))
			} catch {
				/* private mode or a full quota — the canvas still works, it just forgets */
			}
		}

		/* ------------------------------------------------------------------ *
		 * 6. Export
		 * ------------------------------------------------------------------ */

		function download(filename, text, type) {
			try {
				const blob = new Blob([text], { type: type || "text/markdown;charset=utf-8" })
				const url = URL.createObjectURL(blob)
				const anchor = document.createElement("a")
				anchor.href = url
				anchor.download = filename
				document.body.appendChild(anchor)
				anchor.click()
				anchor.remove()
				window.setTimeout(() => URL.revokeObjectURL(url), 0)
			} catch (error) {
				console.error("[dsh-canvas] export failed", error)
			}
		}

		function exportMarkdown(cards, sessionId, t) {
			const lines = [t("canvas.export.header"), "", t("canvas.export.lead", { session: sessionId, n: cards.length }), ""]
			for (const card of cards) {
				lines.push(`## ${t(`role.${card.role}`)} · ${card.title || card.kind}`, "")
				lines.push(t("canvas.export.source", { turn: card.turn, step: card.step, seq: card.seq }), "")
				if (card.text !== "") lines.push(card.text, "")
				if (card.reasoning !== "") lines.push(`<details><summary>${t("canvas.detail.reasoning")}</summary>`, "", card.reasoning, "", "</details>", "")
			}
			return lines.join("\n")
		}

		function exportJson(cards, sessionId) {
			return JSON.stringify(
				{
					plugin: NS,
					version: 1,
					session: sessionId,
					exportedAt: new Date().toISOString(),
					cards: cards.map((card) => ({
						key: card.key,
						kind: card.kind,
						role: card.role,
						turn: card.turn,
						step: card.step,
						seq: card.seq,
						title: card.title,
						text: card.text,
						reasoning: card.reasoning
					}))
				},
				null,
				2
			)
		}

		/* ------------------------------------------------------------------ *
		 * 7. Styles
		 * ------------------------------------------------------------------ */

		/**
		 * Everything is scoped under `.dshc-root`, and every surface colour
		 * comes from a published theme token so light and dark both follow the
		 * shell. Role accents are the one exception: a map needs more
		 * distinguishable hues than the alias set carries, so they are mid-tone
		 * literals that read on either ground. `--role` is set per card in JS.
		 */
		const CSS = [
			`.dshc-root{--dshc-intent:#3f7d52;--dshc-choice:#a8732a;--dshc-ai:#7a5ea8;--dshc-action:#3f7ba8;--dshc-result:#2f8f83;--dshc-context:#6b7280;--dshc-system:#6b7280;--dshc-error:var(--dsw-alias-state-error-primary);--dshc-other:#8a8f98;flex:1;width:100%;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6}`,
			`.dshc-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}`,
			`.dshc-bar h2{margin:0;font-size:15px;font-weight:600}`,
			`.dshc-lead{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);flex:1 1 240px;min-width:0}`,
			`.dshc-badge{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-base)}`,
			`.dshc-btn,.dshc-select,.dshc-input{font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:5px 10px;cursor:pointer}`,
			`.dshc-btn:hover{background:var(--dsw-alias-bg-overlay)}`,
			`.dshc-btn:focus-visible,.dshc-select:focus-visible,.dshc-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}`,
			`.dshc-btn[disabled]{opacity:.45;cursor:default}`,
			`.dshc-btn[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary)}`,
			`.dshc-input{cursor:text;min-width:140px}`,
			`.dshc-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}`,
			`.dshc-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}`,
			`.dshc-chip[aria-pressed=true]{color:var(--dsw-alias-label-primary);border-color:currentColor}`,
			`.dshc-chip i{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}`,
			`.dshc-count{font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:auto}`,
			`.dshc-body{flex:1;min-height:0;display:flex;position:relative}`,
			`.dshc-stage{flex:1;min-width:0;position:relative;overflow:hidden;touch-action:none;cursor:grab;background-image:radial-gradient(var(--dsw-alias-border-l1) 1px,transparent 1px);background-size:22px 22px}`,
			`.dshc-stage[data-panning=true]{cursor:grabbing}`,
			`.dshc-world{position:absolute;top:0;left:0;width:1px;height:1px;transform-origin:0 0}`,
			`.dshc-wires{position:absolute;left:-4000px;top:-4000px;width:8000px;height:8000px;overflow:visible;pointer-events:none}`,
			`.dshc-wire{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:2}`,
			`.dshc-wire[data-cross=turn]{stroke-dasharray:6 5}`,
			`.dshc-slot{position:absolute;width:${CARD_WIDTH}px}`,
			`.dshc-card{display:block;box-sizing:border-box;width:100%;min-height:${CARD_HEIGHT}px;border:1px solid var(--dsw-alias-border-l1);border-top:3px solid var(--dshc-other);border-radius:11px;background:var(--dsw-alias-bg-layer-1);padding:11px 13px 26px;cursor:grab;box-shadow:0 3px 12px rgb(0 0 0 / 6%);text-align:left;color:inherit;font:inherit;overflow:hidden}`,
			`.dshc-card:hover{box-shadow:0 6px 20px rgb(0 0 0 / 12%)}`,
			`.dshc-card[data-role=intent]{border-top-color:var(--dshc-intent)}`,
			`.dshc-card[data-role=choice]{border-top-color:var(--dshc-choice)}`,
			`.dshc-card[data-role=ai]{border-top-color:var(--dshc-ai)}`,
			`.dshc-card[data-role=action]{border-top-color:var(--dshc-action)}`,
			`.dshc-card[data-role=result]{border-top-color:var(--dshc-result)}`,
			`.dshc-card[data-role=context]{border-top-color:var(--dshc-context)}`,
			`.dshc-card[data-role=system]{border-top-color:var(--dshc-system)}`,
			`.dshc-card[data-role=error]{border-top-color:var(--dshc-error)}`,
			`.dshc-card[data-active=true]{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}`,
			`.dshc-card[data-selected=true]{background:var(--dsw-alias-bg-layer-2)}`,
			`.dshc-card[data-muted=true]{opacity:.18}`,
			`.dshc-card[data-hidden=true]{display:none}`,
			`.dshc-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}`,
			`.dshc-kind{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.4px;color:var(--dsw-alias-label-secondary)}`,
			`.dshc-dot{width:7px;height:7px;border-radius:50%;background:var(--role,var(--dshc-other));flex:none}`,
			`.dshc-live{font-size:10px;color:var(--dsw-alias-state-success-primary)}`,
			`.dshc-card h3{margin:7px 0 6px;font-size:14px;font-weight:600;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}`,
			`.dshc-card p{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap}`,
			`.dshc-src{position:absolute;left:13px;right:13px;bottom:9px;font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.75}`,
			`.dshc-pick{position:absolute;top:19px;right:9px;z-index:1;font-size:11px;line-height:1;padding:3px 7px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;cursor:pointer}`,
			`.dshc-panel{width:326px;flex:none;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);overflow:auto;padding:16px 18px calc(var(--dsh-composer-height,0px) + 18px)}`,
			`.dshc-panel h3{margin:6px 0 4px;font-size:16px;overflow-wrap:anywhere}`,
			`.dshc-meta{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0 0 12px}`,
			`.dshc-panel blockquote{margin:0 0 12px;padding:2px 0 2px 12px;border-left:3px solid var(--dsw-alias-border-l2);font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}`,
			`.dshc-panel details{margin:12px 0;font-size:12px}`,
			`.dshc-panel summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}`,
			`.dshc-empty{margin:auto;max-width:420px;text-align:center;padding:32px}`,
			`.dshc-empty h3{margin:0 0 8px;font-size:16px}`,
			`.dshc-empty p{margin:0 0 16px;font-size:13px;color:var(--dsw-alias-label-secondary)}`,
			`.dshc-tray{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 16px calc(var(--dsh-composer-height,0px) + 9px);border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}`,
			`.dshc-tray .dshc-count{margin-left:0}`,
			`.dshc-hint{position:absolute;left:16px;bottom:12px;font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 10px;pointer-events:none;opacity:.9}`,
			`.dshc-notice{position:absolute;left:16px;top:12px;font-size:12px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-radius:8px;padding:6px 12px}`,
			`.dshc-err{color:var(--dsw-alias-state-error-primary)}`,
			`@media (max-width:900px){.dshc-panel{width:250px;padding-left:12px;padding-right:12px}.dshc-lead{display:none}}`
		].join("\n")

		/**
		 * The stylesheet this module installed, if any. Ownership lives here
		 * rather than on the DOM node: a second activation must not be able to
		 * take the tag away from the activation that actually created it, or
		 * unloading the first would strand the tag and unloading the second
		 * would strip styles the first still needs.
		 */
		let ownedStyleTag = null

		function insertStyles() {
			const tagId = `${NS}/client.css`
			if (typeof document === "undefined") return () => {}
			const selector = `style[data-plugin-css="${tagId}"]`
			if (document.querySelector(selector) !== null) {
				// Somebody already installed this stylesheet; own nothing and
				// leave it for its owner to remove.
				return () => {}
			}
			const tag = document.createElement("style")
			tag.dataset.plugin = NS
			tag.dataset.pluginCss = tagId
			tag.textContent = CSS
			document.head.appendChild(tag)
			ownedStyleTag = tag
			return () => {
				if (ownedStyleTag === tag) {
					ownedStyleTag = null
					tag.remove()
				}
			}
		}

		/* ------------------------------------------------------------------ *
		 * 8. The view
		 * ------------------------------------------------------------------ */

		const NOOP = () => {}

		/**
		 * Subscribe to the locale face so a language switch re-renders the copy.
		 *
		 * The snapshot handed to `useSyncExternalStore` is the bare revision
		 * number, not the locale snapshot object. React requires a snapshot to be
		 * cached by identity and re-renders forever when it is not; a primitive
		 * is stable by value, so this stays correct even if the shell ever
		 * rebuilds the snapshot object between reads. It is also narrower: only a
		 * revision change can re-render the canvas.
		 */
		function useLocaleRevision(face) {
			const subscribe = face !== undefined && face !== null && typeof face.subscribe === "function" ? face.subscribe : NOOP
			const getSnapshot =
				face !== undefined && face !== null && typeof face.getSnapshot === "function"
					? () => {
							const snapshot = face.getSnapshot()
							return snapshot !== null && typeof snapshot === "object" ? snapshot.revision : undefined
						}
					: () => undefined
			return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
		}

		/**
		 * The registration entry point. Splitting the live half out keeps the
		 * `useChat` hook call unconditional: whether a Chat target supplies the
		 * hook is fixed for the lifetime of the registration, so the component
		 * type — and therefore the hook order — never changes underneath React.
		 */
		function CanvasView(props) {
			if (typeof props.useChat === "function") return React.createElement(LiveCanvas, props)
			return React.createElement(CanvasStage, Object.assign({}, props, { cards: [] }))
		}

		function LiveCanvas(props) {
			const snapshot = props.useChat((value) => value)
			const read = React.useMemo(() => readCards(snapshot, props.canvasT), [snapshot, props.canvasT])
			return React.createElement(CanvasStage, Object.assign({}, props, { cards: read.cards, readError: read.error }))
		}

		function CanvasStage(props) {
			const t = props.canvasT
			const localeRevision = useLocaleRevision(props.canvasLocale)

			const sessionId = typeof props.sessionId === "string" && props.sessionId !== "" ? props.sessionId : "session"
			const live = Array.isArray(props.cards) ? props.cards : []
			const readError = props.readError

			const [sampleOn, setSampleOn] = React.useState(false)
			const sampleLang = React.useMemo(() => (String(t("view.canvas")).match(/[\u4e00-\u9fa5]/) ? "zh" : "en"), [t, localeRevision])
			const sample = React.useMemo(() => sampleCards(sampleLang), [sampleLang])
			const cards = sampleOn ? sample : live

			const savedLayout = React.useMemo(() => {
				const stored = readStore(`${STORE_LAYOUT}:${sessionId}`)
				return stored !== null && typeof stored === "object" ? stored : {}
			}, [sessionId])
			const savedView = React.useMemo(() => {
				const stored = readStore(`${STORE_VIEW}:${sessionId}`)
				return stored !== null && typeof stored === "object" ? stored : {}
			}, [sessionId])

			const [moved, setMoved] = React.useState({})
			const [pan, setPan] = React.useState({
				x: Number.isFinite(savedView.x) ? savedView.x : PAD,
				y: Number.isFinite(savedView.y) ? savedView.y : PAD
			})
			const [zoom, setZoom] = React.useState(Number.isFinite(savedView.zoom) ? savedView.zoom : 0.85)
			const [activeKey, setActiveKey] = React.useState(null)
			const [selected, setSelected] = React.useState(() => new Set())
			const [mutedRoles, setMutedRoles] = React.useState(() => new Set())
			const [mode, setMode] = React.useState("dim")
			const [query, setQuery] = React.useState("")
			const [panning, setPanning] = React.useState(false)
			const [notice, setNotice] = React.useState("")
			const [fullText, setFullText] = React.useState(false)

			const stageRef = React.useRef(null)
			const dragRef = React.useRef(null)
			const positionsRef = React.useRef({})
			const movedRef = React.useRef({})
			const noticeTimer = React.useRef(null)

			const base = React.useMemo(() => layoutCards(cards), [cards])
			const positions = React.useMemo(() => {
				const merged = {}
				for (const card of cards) {
					const own = moved[card.key]
					const stored = savedLayout[card.key]
					merged[card.key] =
						own !== undefined
							? own
							: stored !== undefined && Number.isFinite(stored.x) && Number.isFinite(stored.y)
								? stored
								: base[card.key]
				}
				return merged
			}, [cards, base, moved, savedLayout])

			// Pointer handlers run outside render, so they read the latest
			// geometry from refs rather than from whatever closed over them.
			// Assigning these during render would be a write during render, and
			// a render React discards would leave the refs describing a frame
			// that never appeared.
			React.useEffect(() => {
				positionsRef.current = positions
			}, [positions])

			/** The one place card positions change, so the ref cannot drift from the state. */
			const moveCard = React.useCallback((key, point) => {
				const next = Object.assign({}, movedRef.current, { [key]: point })
				movedRef.current = next
				setMoved(next)
			}, [])

			const clearMoved = React.useCallback(() => {
				movedRef.current = {}
				setMoved({})
			}, [])

			const rolesPresent = React.useMemo(() => {
				const seen = new Set()
				for (const card of cards) seen.add(card.role)
				return ROLES.filter((role) => seen.has(role))
			}, [cards])

			const matches = React.useCallback(
				(card) => {
					const needle = query.trim().toLowerCase()
					if (needle === "") return true
					return `${card.title}\n${card.text}\n${card.reasoning}\n${card.kind}`.toLowerCase().includes(needle)
				},
				[query]
			)

			const visible = React.useMemo(() => {
				const kept = []
				for (const card of cards) {
					if (mutedRoles.has(card.role)) continue
					const isHit = matches(card)
					if (!isHit && mode === "hide" && query.trim() !== "") continue
					kept.push(card)
				}
				return kept
			}, [cards, mutedRoles, matches, mode, query])

			const hitCount = React.useMemo(() => (query.trim() === "" ? 0 : cards.filter(matches).length), [cards, query, matches])

			React.useEffect(() => {
				if (notice === "") return undefined
				if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
				noticeTimer.current = window.setTimeout(() => setNotice(""), 2400)
				return () => {
					if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
				}
			}, [notice])

			React.useEffect(() => {
				writeStore(`${STORE_VIEW}:${sessionId}`, { x: pan.x, y: pan.y, zoom })
			}, [sessionId, pan, zoom])

			const fit = React.useCallback(() => {
				const stage = stageRef.current
				if (stage === null || visible.length === 0) return
				const rect = stage.getBoundingClientRect()
				let minX = Infinity
				let minY = Infinity
				let maxX = -Infinity
				let maxY = -Infinity
				for (const card of visible) {
					const point = positionsRef.current[card.key]
					if (point === undefined) continue
					minX = Math.min(minX, point.x)
					minY = Math.min(minY, point.y)
					maxX = Math.max(maxX, point.x + CARD_WIDTH)
					maxY = Math.max(maxY, point.y + CARD_HEIGHT)
				}
				if (!Number.isFinite(minX) || !Number.isFinite(minY)) return
				const width = Math.max(1, maxX - minX)
				const height = Math.max(1, maxY - minY)
				const scale = Math.max(
					MIN_ZOOM,
					Math.min(1, Math.min((rect.width - PAD * 2) / width, (rect.height - PAD * 2) / height))
				)
				setZoom(scale)
				setPan({
					x: (rect.width - width * scale) / 2 - minX * scale,
					y: (rect.height - height * scale) / 2 - minY * scale
				})
			}, [visible])

			React.useEffect(() => {
				const stage = stageRef.current
				if (stage === null) return undefined
				const onWheel = (event) => {
					event.preventDefault()
					const rect = stage.getBoundingClientRect()
					const pointX = event.clientX - rect.left
					const pointY = event.clientY - rect.top
					setZoom((previous) => {
						const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, previous * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))
						setPan((current) => ({
							x: pointX - ((pointX - current.x) * next) / previous,
							y: pointY - ((pointY - current.y) * next) / previous
						}))
						return next
					})
				}
				stage.addEventListener("wheel", onWheel, { passive: false })
				return () => stage.removeEventListener("wheel", onWheel)
			}, [])

			React.useEffect(() => {
				const onKey = (event) => {
					if (event.key === "Escape") {
						setActiveKey(null)
						setFullText(false)
					}
				}
				window.addEventListener("keydown", onKey)
				return () => window.removeEventListener("keydown", onKey)
			}, [])

			/** One pointer handler on the stage drives both panning and card moves. */
			const onPointerDown = React.useCallback(
				(event) => {
					if (event.button !== 0) return
					const stage = stageRef.current
					const cardElement = typeof event.target.closest === "function" ? event.target.closest("[data-dshc-key]") : null
					if (cardElement !== null) {
						const point = positionsRef.current[cardElement.dataset.dshcKey]
						if (point !== undefined) {
							dragRef.current = {
								mode: "card",
								key: cardElement.dataset.dshcKey,
								startX: event.clientX,
								startY: event.clientY,
								originX: point.x,
								originY: point.y
							}
						}
					} else {
						dragRef.current = { mode: "pan", startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y }
						setPanning(true)
					}
					if (stage !== null && typeof stage.setPointerCapture === "function") {
						try {
							stage.setPointerCapture(event.pointerId)
						} catch {
							/* the pointer is already gone — the next move simply does nothing */
						}
					}
				},
				[pan.x, pan.y]
			)

			const onPointerMove = React.useCallback(
				(event) => {
					const drag = dragRef.current
					if (drag === null) return
					const dx = event.clientX - drag.startX
					const dy = event.clientY - drag.startY
					if (drag.mode === "pan") {
						setPan({ x: drag.originX + dx, y: drag.originY + dy })
						return
					}
					moveCard(drag.key, { x: drag.originX + dx / zoom, y: drag.originY + dy / zoom })
				},
				[zoom, moveCard]
			)

			const onPointerUp = React.useCallback(() => {
				const drag = dragRef.current
				dragRef.current = null
				setPanning(false)
				if (drag === null || drag.mode !== "card") return
				const merged = Object.assign({}, positionsRef.current, movedRef.current)
				const payload = {}
				for (const card of cards) {
					const point = merged[card.key]
					if (point !== undefined) payload[card.key] = { x: point.x, y: point.y }
				}
				writeStore(`${STORE_LAYOUT}:${sessionId}`, payload)
			}, [cards, sessionId])

			const toggleSelected = React.useCallback((key) => {
				setSelected((current) => {
					const next = new Set(current)
					if (next.has(key)) next.delete(key)
					else next.add(key)
					return next
				})
			}, [])

			const selectedCards = React.useMemo(() => cards.filter((card) => selected.has(card.key)), [cards, selected])
			const active = React.useMemo(() => cards.find((card) => card.key === activeKey), [cards, activeKey])
			const zoomBy = React.useCallback((factor) => setZoom((previous) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, previous * factor))), [])

			const node = React.createElement
			const empty = cards.length === 0 && !sampleOn

			const wires = []
			for (let index = 0; index < visible.length - 1; index += 1) {
				const from = visible[index]
				const to = visible[index + 1]
				const start = positions[from.key]
				const end = positions[to.key]
				if (start === undefined || end === undefined) continue
				const x1 = start.x + CARD_WIDTH
				const y1 = start.y + 46
				const x2 = end.x
				const y2 = end.y + 46
				wires.push(
					node("path", {
						key: `${from.key}->${to.key}`,
						className: "dshc-wire",
						"data-cross": from.turn === to.turn ? "step" : "turn",
						d: `M${x1} ${y1} C${x1 + 44} ${y1}, ${x2 - 44} ${y2}, ${x2} ${y2}`
					})
				)
			}

			const header = node(
				"div",
				{ className: "dshc-bar" },
				node("h2", null, t("canvas.title")),
				node("p", { className: "dshc-lead" }, t("canvas.lead")),
				sampleOn ? node("span", { className: "dshc-badge" }, t("canvas.sample.badge")) : null,
				node(
					"button",
					{
						type: "button",
						className: "dshc-btn",
						onClick: () => {
							setSampleOn((value) => !value)
							setActiveKey(null)
							setSelected(new Set())
							clearMoved()
						}
					},
					sampleOn ? t("canvas.sample.exit") : t("canvas.sample.enter")
				)
			)

			const filters = node(
				"div",
				{ className: "dshc-filters" },
				node(
					"button",
					{
						type: "button",
						className: "dshc-chip",
						"aria-pressed": mutedRoles.size === 0,
						onClick: () => setMutedRoles(new Set())
					},
					t("canvas.allRoles")
				),
				rolesPresent.map((role) =>
					node(
						"button",
						{
							key: role,
							type: "button",
							className: "dshc-chip",
							style: { color: `var(--dshc-${role})` },
							"aria-pressed": !mutedRoles.has(role),
							onClick: () =>
								setMutedRoles((current) => {
									const next = new Set(current)
									if (next.has(role)) next.delete(role)
									else next.add(role)
									return next.size === rolesPresent.length ? new Set() : next
								})
						},
						node("i", null),
						t(`role.${role}`)
					)
				),
				node("input", {
					className: "dshc-input",
					type: "search",
					placeholder: t("canvas.search"),
					"aria-label": t("canvas.search"),
					value: query,
					onChange: (event) => setQuery(event.target.value)
				}),
				node(
					"select",
					{
						className: "dshc-select",
						"aria-label": t("canvas.mode.dim"),
						value: mode,
						onChange: (event) => setMode(event.target.value)
					},
					node("option", { value: "dim" }, t("canvas.mode.dim")),
					node("option", { value: "hide" }, t("canvas.mode.hide"))
				),
				node(
					"button",
					{ type: "button", className: "dshc-btn", "aria-label": t("canvas.zoomOut"), onClick: () => zoomBy(1 / 1.2) },
					"−"
				),
				node("button", { type: "button", className: "dshc-btn", "aria-label": t("canvas.zoomIn"), onClick: () => zoomBy(1.2) }, "+"),
				node("button", { type: "button", className: "dshc-btn", onClick: fit }, t("canvas.fit")),
				node(
					"span",
					{ className: "dshc-count" },
					query.trim() === ""
						? t("canvas.count", { shown: visible.length, total: cards.length })
						: `${t("canvas.count", { shown: visible.length, total: cards.length })} · ${t("canvas.hits", { n: hitCount })}`
				)
			)

			const stage = node(
				"div",
				{
					className: "dshc-stage",
					ref: stageRef,
					"data-panning": panning,
					onPointerDown,
					onPointerMove,
					onPointerUp,
					onPointerCancel: onPointerUp,
					onClick: (event) => {
						const onCard = typeof event.target.closest === "function" && event.target.closest("[data-dshc-key]") !== null
						if (!onCard) setActiveKey(null)
					}
				},
				node(
					"div",
					{ className: "dshc-world", style: { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` } },
					node("svg", { className: "dshc-wires", "aria-hidden": "true" }, node("g", { transform: "translate(4000 4000)" }, wires)),
					visible.map((card) => {
						const point = positions[card.key]
						if (point === undefined) return null
						const isMuted = query.trim() !== "" && mode === "dim" && !matches(card)
						return node(
							"div",
							{
								key: card.key,
								className: "dshc-slot",
								style: { left: `${point.x}px`, top: `${point.y}px` },
								"data-dshc-key": card.key
							},
							node(
								"article",
								{
									className: "dshc-card",
									"data-role": card.role,
									"data-active": activeKey === card.key,
									"data-selected": selected.has(card.key),
									"data-muted": isMuted,
									style: { "--role": `var(--dshc-${card.role})` },
									tabIndex: 0,
									role: "button",
									"aria-label": `${t(`role.${card.role}`)}: ${card.title}`,
									onClick: () => {
										setActiveKey(card.key)
										setFullText(false)
									},
									onKeyDown: (event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault()
											setActiveKey(card.key)
											setFullText(false)
										}
									}
								},
								node(
									"span",
									{ className: "dshc-kind" },
									node("i", { className: "dshc-dot" }),
									t(`role.${card.role}`),
									card.running ? node("span", { className: "dshc-live" }, `· ${t("canvas.running")}`) : null
								),
								node("h3", null, card.title),
								node("p", null, (card.text !== "" ? card.text : card.reasoning).slice(0, PREVIEW_LIMIT)),
								node("span", { className: "dshc-src" }, t("canvas.detail.meta", { turn: card.turn, step: card.step, seq: card.seq }))
							),
							node(
								"button",
								{
									type: "button",
									className: "dshc-pick",
									"aria-label": selected.has(card.key) ? t("canvas.detail.remove") : t("canvas.detail.add"),
									onClick: (event) => {
										event.stopPropagation()
										toggleSelected(card.key)
									}
								},
								selected.has(card.key) ? "✓" : "＋"
							)
						)
					})
				),
				node("div", { className: "dshc-hint" }, t("canvas.hint")),
				notice === "" ? null : node("div", { className: "dshc-notice", role: "status" }, notice)
			)

			const panel = node(
				"aside",
				{ className: "dshc-panel" },
				readError !== undefined ? node("p", { className: "dshc-err" }, t("canvas.error", { message: String(readError) })) : null,
				active === undefined
					? node("p", { className: "dshc-meta" }, t("canvas.detail.empty"))
					: node(
							"div",
							null,
							node(
								"span",
								{ className: "dshc-kind" },
								node("i", { className: "dshc-dot", style: { "--role": `var(--dshc-${active.role})` } }),
								t(`role.${active.role}`)
							),
							node("h3", null, active.title),
							node("p", { className: "dshc-meta" }, t("canvas.detail.meta", { turn: active.turn, step: active.step, seq: active.seq })),
							active.sample ? node("p", { className: "dshc-meta" }, t("canvas.detail.sample")) : null,
							active.text !== "" ? node("blockquote", null, fullText ? active.text : active.text.slice(0, 900)) : null,
							active.text.length > 900
								? node(
										"button",
										{ type: "button", className: "dshc-btn", onClick: () => setFullText((value) => !value) },
										fullText ? t("canvas.less") : t("canvas.more")
									)
								: null,
							active.reasoning !== ""
								? node(
										"details",
										null,
										node("summary", null, t("canvas.detail.reasoning")),
										node("blockquote", null, active.reasoning)
									)
								: null,
							node(
								"button",
								{ type: "button", className: "dshc-btn", onClick: () => toggleSelected(active.key) },
								selected.has(active.key) ? t("canvas.detail.remove") : t("canvas.detail.add")
							)
						)
			)

			const body = empty
				? node(
						"div",
						{ className: "dshc-body" },
						node(
							"div",
							{ className: "dshc-empty" },
							readError !== undefined ? node("p", { className: "dshc-err" }, t("canvas.error", { message: String(readError) })) : null,
							node("h3", null, t("canvas.empty.title")),
							node("p", null, t("canvas.empty.body")),
							node("button", { type: "button", className: "dshc-btn", onClick: () => setSampleOn(true) }, t("canvas.sample.enter"))
						)
					)
				: node("div", { className: "dshc-body" }, stage, panel)

			const tray = node(
				"div",
				{ className: "dshc-tray" },
				node(
					"span",
					{ className: "dshc-count" },
					selectedCards.length === 0 ? t("canvas.selected.none") : t("canvas.selected.count", { n: selectedCards.length })
				),
				node(
					"button",
					{
						type: "button",
						className: "dshc-btn",
						disabled: selectedCards.length === 0,
						onClick: () => {
							download(`dsh-canvas-${sessionId}.md`, exportMarkdown(selectedCards, sessionId, t), "text/markdown;charset=utf-8")
							setNotice(t("canvas.export.md"))
						}
					},
					t("canvas.export.md")
				),
				node(
					"button",
					{
						type: "button",
						className: "dshc-btn",
						disabled: cards.length === 0,
						onClick: () => {
							download(`dsh-canvas-${sessionId}.json`, exportJson(cards, sessionId), "application/json;charset=utf-8")
							setNotice(t("canvas.export.json"))
						}
					},
					t("canvas.export.json")
				),
				node(
					"button",
					{
						type: "button",
						className: "dshc-btn",
						disabled: selectedCards.length === 0,
						onClick: () => setSelected(new Set())
					},
					t("canvas.clear")
				)
			)

			return node("div", { className: "dshc-root" }, header, empty ? null : filters, body, empty ? null : tray)
		}

		/* ------------------------------------------------------------------ *
		 * 9. Plugin body
		 * ------------------------------------------------------------------ */

		/** Required service: the UI slot registry. */
		const inject = ["slots"]

		/** Where the canvas sits in the conversation view ring (chat 0, trajectory 10, graph 20). */
		const VIEW_ORDER = 30

		/**
		 * Mount the canvas view.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const locale = ctx.get("locale")

			let t = makeFallbackTranslate()
			let canvasLocale

			if (locale !== undefined && locale !== null) {
				ctx.effect(() => {
					const disposers = []
					for (const id of Object.keys(DICTS)) {
						try {
							disposers.push(locale.register(NS, id, DICTS[id]))
						} catch (error) {
							console.error(`[${NS}] dictionary registration failed for ${id}`, error)
						}
					}
					return () => {
						for (const dispose of disposers) dispose()
					}
				}, `${NS}: dictionaries`)

				try {
					t = locale.bind(NS)
					canvasLocale = {
						getSnapshot: () => locale.getSnapshot(),
						subscribe: (listener) => locale.subscribe(listener)
					}
				} catch (error) {
					console.error(`[${NS}] locale bind failed`, error)
				}
			}

			ctx.effect(() => insertStyles(), `${NS}: styles`)

			ctx.slots.inject("conversation.view", () =>
				ctx.slots.register(
					{
						name: "conversation.view",
						id: "canvas",
						order: VIEW_ORDER,
						label: () => t("view.canvas"),
						inject: () => ({ canvasT: t, canvasLocale })
					},
					CanvasView
				)
			)
		}

		exports.apply = apply
		exports.inject = inject
		exports.NS = NS
		exports.VIEW_ID = "canvas"
		exports.VIEW_ORDER = VIEW_ORDER
		exports.__internals = {
			readCards,
			cardFromChatNode,
			layoutCards,
			sampleCards,
			exportMarkdown,
			exportJson,
			makeFallbackTranslate,
			ROLES,
			ROLE_OF_KIND,
			DICTS
		}
		return module.exports
	}
})

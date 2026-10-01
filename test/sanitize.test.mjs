/**
 * Publication guard: nothing private ships.
 *
 * A canvas plugin is easy to leak into, because the thing it renders is a real
 * conversation. This test walks every text file in the repository and fails on
 * a marker that must never appear in a public tree: a personal name, an
 * absolute home path, a private domain, a server address, a credential.
 *
 * This file is excluded from its own scan — it is the one place the markers are
 * written down on purpose. Everything else, including documentation and example
 * data, is scanned.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, sep } from "node:path"

import { root } from "./harness.mjs"

const SELF = join("test", "sanitize.test.mjs")
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "coverage", "tmp"])
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".txt", ".html", ".css"])

/** Each rule is a label plus a pattern; the label is what the failure prints. */
const RULES = [
	{ label: "personal name", pattern: /邱懿武/ },
	{ label: "absolute macOS home path", pattern: /\/Users\/[A-Za-z]/ },
	{ label: "absolute external volume path", pattern: /\/Volumes\// },
	{ label: "private domain", pattern: /qiuyiwu\.com|alimq\.com|zaowuyun\.com|yongle\.school/i },
	{ label: "private host", pattern: /shennao|moodboard\.|fish-k\.xyz/i },
	{ label: "server address", pattern: /\b122\.51\.221\.171\b/ },
	{ label: "private repository", pattern: /yingnao-core|qmemory_bridge|qmemory\b/i },
	{ label: "email address", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
	{ label: "credential-shaped string", pattern: /\bsk-[A-Za-z0-9]{16,}\b|\bBearer\s+[A-Za-z0-9._-]{16,}\b|\bAKID[A-Za-z0-9]{12,}\b/ },
	{ label: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
]

async function walk(directory, found = []) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (SKIP_DIRECTORIES.has(entry.name)) continue
			await walk(join(directory, entry.name), found)
			continue
		}
		if (!entry.isFile()) continue
		const extension = entry.name.slice(entry.name.lastIndexOf("."))
		if (!TEXT_EXTENSIONS.has(extension)) continue
		const path = join(directory, entry.name)
		if (relative(root, path) === SELF) continue
		found.push(path)
	}
	return found
}

test("no private marker appears anywhere in the published tree", async () => {
	const files = await walk(root)
	assert.ok(files.length >= 10, `expected the repository to contain files, found ${files.length}`)

	const offences = []
	for (const file of files) {
		const content = await readFile(file, "utf8")
		for (const rule of RULES) {
			const match = rule.pattern.exec(content)
			if (match === null) continue
			const before = content.slice(0, match.index)
			const line = before.split("\n").length
			offences.push(`${relative(root, file).split(sep).join("/")}:${line} — ${rule.label} (${JSON.stringify(match[0])})`)
		}
	}

	assert.deepEqual(offences, [], `private markers found:\n${offences.join("\n")}`)
})

test("the scan actually covers the files that carry prose and data", async () => {
	const files = (await walk(root)).map((file) => relative(root, file).split(sep).join("/"))
	for (const required of ["README.md", "README.zh.md", "lib/client.js", "package.json", "cordis.patch.yml"]) {
		assert.ok(files.includes(required), `${required} must be inside the scan`)
	}
})

test("example data is fictional and self-labelled", async () => {
	const raw = await readFile(join(root, "examples", "sample-canvas.json"), "utf8")
	const parsed = JSON.parse(raw)
	assert.equal(parsed.plugin, "dsh-canvas")
	assert.equal(parsed.fictional, true, "example data must declare itself fictional")
	assert.ok(Array.isArray(parsed.cards))
	assert.ok(parsed.cards.length > 0)
	for (const card of parsed.cards) {
		assert.equal(card.sample, true)
	}
	const size = (await stat(join(root, "examples", "sample-canvas.json"))).size
	assert.ok(size < 64 * 1024, "example data stays small enough to read in a diff")
})

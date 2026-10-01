/**
 * Manifest tests: the declarations the harness reads before any code runs.
 *
 * A plugin is discovered by shape, not by intention. If `dsh.bundle.patch`
 * points nowhere, if `exports["./client"]` is missing, or if the patch names a
 * package the profile cannot resolve, the failure shows up as a plugin that
 * silently contributes nothing. These tests pin those declarations to files
 * that actually exist.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile, access } from "node:fs/promises"
import { join } from "node:path"

import { root } from "./harness.mjs"

const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
const patch = await readFile(join(root, "cordis.patch.yml"), "utf8")

test("the package is named and licensed for a public release", () => {
	assert.equal(manifest.name, "dsh-canvas")
	assert.equal(manifest.license, "MIT")
	assert.equal(manifest.private, undefined, "a private package cannot be installed from a git URL")
	assert.match(manifest.repository.url, /github\.com\/qiuyiwu1989-star\/dsh-canvas/)
})

test("the client half is declared the way the module system looks for it", () => {
	assert.equal(manifest.dsh.client.platform, "web")
	assert.equal(manifest.exports["./client"].default, "./lib/client.js")
	assert.ok(manifest.files.includes("lib"), "lib/ must ship, or a git install has no code")
})

test("the bundle declaration points at a real patch file", async () => {
	assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml")
	assert.equal(manifest.exports["./cordis.patch.yml"], "./cordis.patch.yml")
	await access(join(root, "cordis.patch.yml"))
	assert.ok(manifest.files.includes("cordis.patch.yml"))
})

test("the patch inserts exactly one row, and it is this package", () => {
	const rows = patch.split("\n").filter((line) => line.trim().startsWith("- id:"))
	assert.equal(rows.length, 1, "one inserted row")
	assert.match(patch, /- insert:/)
	assert.match(rows[0], /- id: canvas/)
	assert.match(patch, /name: 'dsh-canvas'/, "the row must resolve to this package name")
})

test("every entry point the manifest names exists on disk", async () => {
	await access(join(root, "lib", "index.js"))
	await access(join(root, "lib", "client.js"))
	await access(join(root, "README.md"))
	await access(join(root, "README.zh.md"))
	await access(join(root, "LICENSE"))
})

test("the client half declares no runtime dependencies", () => {
	// The bundle resolves React from the shell's frozen module table. Declaring
	// an npm dependency would make `pnpm add github:...` pull a second React.
	assert.equal(manifest.dependencies, undefined)
	assert.equal(manifest.peerDependencies, undefined)
	assert.equal(manifest.devDependencies, undefined)
})

test("the test script runs the contract tests", () => {
	assert.match(manifest.scripts.test, /node --test/)
	assert.equal(manifest.scripts.verify, "npm run test && npm run smoke")
})

test("the package declares the Node floor the client module format needs", () => {
	// `node --test` with a file glob and `node:vm` context creation are both
	// used by the test suite; 22.19 is the floor the sibling dsh plugins use.
	assert.match(manifest.engines.node, /22\.19/)
})

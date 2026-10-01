/**
 * Host-half tests.
 *
 * The host half is intentionally empty, and that emptiness is the contract:
 * the row exists so the Loader mounts this package (which is how the client
 * module system discovers `dsh.client`), and it must not register a service, a
 * Tool, or any prompt text. A change here should fail these tests loudly.
 */

import test from "node:test"
import assert from "node:assert/strict"

import * as host from "../lib/index.js"

test("the host half exports an apply function and nothing else load-bearing", () => {
	assert.equal(typeof host.apply, "function")
	assert.equal(host.apply.length, 0, "apply takes no arguments: it registers nothing")
})

test("applying the host half is a no-op", () => {
	const calls = []
	const ctx = new Proxy(
		{},
		{
			get(_target, property) {
				if (property === "then") return undefined
				return (...args) => {
					calls.push({ property: String(property), args })
					return () => {}
				}
			}
		}
	)

	assert.equal(host.apply(ctx), undefined)
	assert.deepEqual(calls, [], "the host half must not touch the context")
})

test("the default export carries the same apply for either import shape", () => {
	assert.equal(host.default.apply, host.apply)
})

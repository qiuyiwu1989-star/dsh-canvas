/**
 * Thinking Canvas host half.
 *
 * The canvas itself is a browser plugin: it ships through this package's
 * `exports["./client"]` and registers into the Web client's conversation view
 * ring. This half contributes no Host service, no Tool and no prompt text — it
 * exists because the client module system discovers a browser bundle from the
 * Loader entry that mounts this package. A package that declared `dsh.client`
 * without a mounted row would ship a bundle nothing ever asks for.
 *
 * @module dsh-canvas
 */

/** Host plugin body — this package contributes browser presentation only. */
export function apply() {}

export default { apply }

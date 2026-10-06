// threadText/src/webflow/embed.ts — zero-config browser bundle for Webflow Custom Code Embed.
// Auto-initialises threadText on any element marked with [data-threadtext], reading options
// from data-* attributes, and exposes a small window.ThreadText API for manual control.
import { createThreadText } from '../core/threadText'
import type { ThreadTextOptions, ThreadTextInstance } from '../core/types'

/** Attribute that opts an element in to the embroidery renderer. */
const OPT_IN_ATTR = 'data-threadtext'

/** Per-element teardown record so destroy() can free the instance and restore markup. */
interface Instance {
	/** Live renderer handle. */
	instance: ThreadTextInstance
	/** Unused (the renderer restores the element's own content); kept for the record shape. */
	originalHTML: string
}

/** Tracks live instances keyed by their element — WeakMap so removed nodes are GC'd. */
const INSTANCES = new WeakMap<HTMLElement, Instance>()

/** Elements currently running, so ones removed from the page can be cleaned up. */
const TRACKED = new Set<HTMLElement>()

/**
 * Read threadText options from an element's data-* attributes.
 * Unset attributes fall through to the library defaults.
 *
 * Supported attributes:
 *   data-tt-text          — text to embroider (defaults to the element's text content)
 *   data-tt-font          — CSS font-family of a loaded font
 *   data-tt-weight        — numeric font weight (100–900)
 *   data-tt-thread-color  — floss colour (hex or rgb())
 *   data-tt-thread-color2 — second floss colour (for two-tone / gradient)
 *   data-tt-color-mode    — "solid" | "twotone" | "gradient" (default "solid")
 *   data-tt-backstitch    — "true" to add a running-stitch outline around each glyph
 *   data-tt-outline-color — backstitch outline colour
 *   data-tt-pitch         — thread spacing in px
 *   data-tt-fill          — fraction of the width the word fills (its size)
 *   data-tt-align         — "left" | "center" | "right" (default "center")
 *   data-tt-sew-style     — "hand" for a single-thread hand look (default "machine")
 *   data-tt-stitch-mode   — "satin" | "cross" | "chain" | "running" (default "satin")
 *   data-tt-axes          — variable-font axes as JSON, e.g. '{"opsz":40,"SOFT":60}'
 *   data-tt-sew-rate      — satin rows per second
 *   data-tt-sheen         — "false" to disable the cursor sheen
 *   data-tt-animate       — "false" to draw instantly (no sew-in)
 *   data-tt-editable      — "true" to make the word typeable
 *
 * @param el - The opted-in element
 * @param fallbackText - Text to use when data-tt-text is absent
 */
function readOptions(el: HTMLElement, fallbackText: string): ThreadTextOptions {
	const d = el.dataset
	const opts: ThreadTextOptions = { text: d.ttText ?? fallbackText }

	if (d.ttFont) opts.font = d.ttFont
	if (d.ttWeight !== undefined) { const n = parseFloat(d.ttWeight); if (Number.isFinite(n)) opts.weight = n }
	if (d.ttThreadColor) opts.threadColor = d.ttThreadColor
	if (d.ttThreadColor2) opts.threadColor2 = d.ttThreadColor2
	if (d.ttColorMode && ['solid', 'twotone', 'gradient'].includes(d.ttColorMode)) opts.colorMode = d.ttColorMode as ThreadTextOptions['colorMode']
	if (d.ttBackstitch === 'true') opts.backstitch = true
	if (d.ttOutlineColor) opts.outlineColor = d.ttOutlineColor
	if (d.ttPitch !== undefined) { const n = parseFloat(d.ttPitch); if (Number.isFinite(n)) opts.pitch = n }
	if (d.ttFill !== undefined) { const n = parseFloat(d.ttFill); if (Number.isFinite(n)) opts.fill = n }
	if (d.ttAlign && ['left', 'center', 'right'].includes(d.ttAlign)) opts.align = d.ttAlign as ThreadTextOptions['align']
	if (d.ttSewStyle === 'hand') opts.sewStyle = 'hand'
	if (d.ttStitchMode && ['satin', 'cross', 'chain', 'running'].includes(d.ttStitchMode)) opts.stitchMode = d.ttStitchMode as ThreadTextOptions['stitchMode']
	if (d.ttAxes) { try { const a = JSON.parse(d.ttAxes); if (a && typeof a === 'object') opts.axes = a } catch { /* ignore malformed JSON */ } }
	if (d.ttSewRate !== undefined) { const n = parseFloat(d.ttSewRate); if (Number.isFinite(n)) opts.sewRate = n }
	if (d.ttSheen === 'false') opts.sheen = false
	if (d.ttAnimate === 'false') opts.animate = false
	if (d.ttEditable === 'true') opts.editable = true

	return opts
}

/**
 * Initialise a single element: mount the renderer. The element keeps its own content and semantics (a
 * heading stays a heading, links stay links): the renderer keeps that content in the page, visually
 * hidden, for screen readers, find-in-page and translation, and puts it back on destroy.
 * Idempotent — re-initialising tears down the previous run.
 *
 * @param el - Element to embroider
 */
function initElement(el: HTMLElement): void {
	destroy(el)
	const text = (el.dataset.ttText ?? el.textContent ?? '').trim()
	if (!text) return
	const instance = createThreadText(el, readOptions(el, text))
	INSTANCES.set(el, { instance, originalHTML: '' })
	TRACKED.add(el)
}

/**
 * Stop and restore a single element if it has a live instance (its own content and listeners come back).
 *
 * @param el - Element previously initialised
 */
function destroy(el: HTMLElement): void {
	const rec = INSTANCES.get(el)
	if (!rec) return
	rec.instance.destroy()
	INSTANCES.delete(el)
	TRACKED.delete(el)
}

/**
 * Initialise opted-in elements under (and including) a root. Elements already running are left alone;
 * use restart(el) to rebuild one.
 *
 * @param root - Element or document to search (default: document)
 */
function init(root: ParentNode = document): void {
	const found: HTMLElement[] = []
	if (root instanceof HTMLElement && root.matches(`[${OPT_IN_ATTR}]`)) found.push(root)
	root.querySelectorAll<HTMLElement>(`[${OPT_IN_ATTR}]`).forEach((el) => found.push(el))
	for (const el of found) if (!INSTANCES.has(el)) initElement(el)
}

/**
 * Rebuild one element, re-reading its data-* attributes.
 *
 * @param el - Element to rebuild
 */
function restart(el: HTMLElement): void {
	initElement(el)
}

/**
 * Auto-initialise once the DOM is parsed and web fonts have loaded, and set up elements added later.
 * Fonts must settle first: the stitch flow field is rasterised from the final glyph geometry.
 */
function autoInit(): void {
	const run = () => {
		if (typeof document !== 'undefined' && document.fonts?.ready) {
			document.fonts.ready.then(() => init()).catch(() => init())
		} else {
			init()
		}
		if (typeof MutationObserver !== 'undefined' && document.body) {
			new MutationObserver((records) => {
				let removed = false
				for (const rec of records) {
					if (rec.removedNodes.length) removed = true
					rec.addedNodes.forEach((n) => {
						if (n instanceof HTMLElement && n.isConnected && !n.classList.contains('tt-text')) init(n)
					})
				}
				// Elements removed from the page: free their renderer (worker, canvases, listeners).
				if (removed) TRACKED.forEach((el) => { if (!el.isConnected) destroy(el) })
			}).observe(document.body, { childList: true, subtree: true })
		}
	}
	if (typeof document !== 'undefined' && document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run, { once: true })
	} else {
		run()
	}
}

autoInit()

// Public browser API — assigned to window.ThreadText via the IIFE global name.
export { init, destroy, restart }

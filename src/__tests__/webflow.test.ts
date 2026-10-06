// threadText/src/__tests__/webflow.test.ts — Webflow embed auto-init / manual control
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { init, destroy } from '../webflow/embed'
import { THREAD_TEXT_CLASSES } from '../core/types'

// Same canvas-2D stub the core tests use — happy-dom has no canvas backend.
function makeCtxStub() {
	const gradient = { addColorStop() {} }
	return {
		fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', font: '', textAlign: '', textBaseline: '', globalCompositeOperation: '', globalAlpha: 1, filter: '',
		clearRect() {}, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, closePath() {}, fill() {}, stroke() {},
		save() {}, restore() {}, translate() {}, rotate() {}, drawImage() {},
		createLinearGradient() { return gradient }, createRadialGradient() { return gradient },
		measureText(s: string) { return { width: (s ? s.length : 1) * 10 } },
		getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } },
		putImageData() {},
		createImageData(w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } },
	}
}

beforeEach(() => {
	document.body.innerHTML = ''
	;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => makeCtxStub()
	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		value: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false } }),
	})
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { check: () => true, load: () => Promise.resolve([]), ready: Promise.resolve() },
	})
})

afterEach(() => { vi.restoreAllMocks() })

describe('webflow embed', () => {
	it('init mounts the renderer on [data-threadtext] and exposes the word to a11y', () => {
		const el = document.createElement('div')
		el.setAttribute('data-threadtext', '')
		el.textContent = 'Web'
		document.body.appendChild(el)

		init()

		expect(el.querySelectorAll('canvas').length).toBe(2)
		expect(el.querySelector('.' + THREAD_TEXT_CLASSES.bg)).toBeTruthy()
		// The element keeps its own role; its text stays in the page (visually hidden) for assistive tech.
		expect(el.getAttribute('role')).toBeNull()
		const sr = el.querySelector('.' + THREAD_TEXT_CLASSES.text)
		expect(sr?.textContent).toBe('Web')
		el.querySelectorAll('canvas').forEach((c) => expect(c.getAttribute('aria-hidden')).toBe('true'))
	})

	it('data-tt-text overrides the element text content', () => {
		const el = document.createElement('div')
		el.setAttribute('data-threadtext', '')
		el.setAttribute('data-tt-text', 'Floss')
		document.body.appendChild(el)

		init()
		expect(el.querySelector('.' + THREAD_TEXT_CLASSES.text)?.textContent).toBe('Floss')
		expect(el.querySelectorAll('canvas').length).toBe(2)
	})

	it('destroy tears down and restores the original markup', () => {
		const el = document.createElement('div')
		el.setAttribute('data-threadtext', '')
		el.textContent = 'Bye'
		document.body.appendChild(el)

		init()
		expect(el.querySelectorAll('canvas').length).toBe(2)

		destroy(el)
		expect(el.querySelectorAll('canvas').length).toBe(0)
		expect(el.textContent).toBe('Bye')
		expect(el.getAttribute('role')).toBeNull()
	})

	it('re-init on the same element does not stack canvases', () => {
		const el = document.createElement('div')
		el.setAttribute('data-threadtext', '')
		el.textContent = 'Once'
		document.body.appendChild(el)

		init()
		init() // second pass must tear down the first
		expect(el.querySelectorAll('canvas').length).toBe(2)
	})
})

// ─── Review fixes (2026-10) ──────────────────────────────────────────────────

import { createThreadText } from '../core/threadText'

describe('review fixes', () => {
	it('keeps the element, its semantics and its links; puts the same nodes back on destroy', () => {
		const h = document.createElement('h1')
		h.innerHTML = 'Thread <a href="#x" id="L">link</a>'
		h.style.position = ''
		document.body.appendChild(h)
		const link = h.querySelector('a')!
		let clicks = 0
		link.addEventListener('click', (e) => { e.preventDefault(); clicks++ })
		const inst = createThreadText(h, { text: 'Thread link' })
		expect(h.getAttribute('role')).toBeNull()
		expect(h.querySelector('#L')).toBe(link)
		h.querySelectorAll('canvas').forEach((c) => expect(c.getAttribute('aria-hidden')).toBe('true'))
		inst.destroy()
		expect(h.querySelector('a')).toBe(link)
		link.click()
		expect(clicks).toBe(1)
		expect(h.innerHTML).toBe('Thread <a href="#x" id="L">link</a>')
		expect(h.getAttribute('style')).toBeNull()
	})

	it('exposes the embroidered text when the element is empty', () => {
		const d = document.createElement('div')
		document.body.appendChild(d)
		const inst = createThreadText(d, { text: 'Floss' })
		expect(d.querySelector('.' + THREAD_TEXT_CLASSES.text)?.textContent).toBe('Floss')
		inst.setText('Silk')
		expect(d.querySelector('.' + THREAD_TEXT_CLASSES.text)?.textContent).toBe('Silk')
		inst.destroy()
		expect(d.childNodes.length).toBe(0)
	})

	it('invalid numbers fall back instead of throwing or leaving a blank canvas', () => {
		const d = document.createElement('div')
		document.body.appendChild(d)
		expect(() => {
			const inst = createThreadText(d, { text: 'Hi', pitch: NaN, sewRate: Infinity, weight: NaN, fill: NaN, font: '' })
			inst.update({ pitch: NaN, sewRate: NaN, weight: NaN })
			inst.destroy()
		}).not.toThrow()
	})

	it('empty text reserves no blank box', () => {
		const d = document.createElement('div')
		document.body.appendChild(d)
		const inst = createThreadText(d, { text: '   ' })
		expect(d.style.height === '' || d.style.height === '0px').toBe(true)
		inst.destroy()
	})

	it('init(el) sets up the element itself and leaves running ones alone', () => {
		const el = document.createElement('p')
		el.setAttribute('data-threadtext', '')
		el.textContent = 'Once'
		document.body.appendChild(el)
		init(el)
		const canvases = Array.from(el.querySelectorAll('canvas'))
		expect(canvases.length).toBe(2)
		init()
		expect(Array.from(el.querySelectorAll('canvas'))).toEqual(canvases)
		destroy(el)
	})
})

describe('reduced motion', () => {
	it('follows the system setting live and stops listening on destroy', () => {
		const listeners = new Set<() => void>()
		const mq = { matches: false, media: '', addEventListener: (_: string, f: () => void) => listeners.add(f), removeEventListener: (_: string, f: () => void) => listeners.delete(f) }
		Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => mq })
		const d = document.createElement('div')
		document.body.appendChild(d)
		const inst = createThreadText(d, { text: 'Calm' })
		expect(listeners.size).toBe(1)
		mq.matches = true
		expect(() => listeners.forEach((f) => f())).not.toThrow()
		inst.destroy()
		expect(listeners.size).toBe(0)
	})

	it('an explicit reducedMotion option is not overridden by the system setting', () => {
		const added: unknown[] = []
		Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener: (...a: unknown[]) => added.push(a), removeEventListener() {} }) })
		const d = document.createElement('div')
		document.body.appendChild(d)
		createThreadText(d, { text: 'Go', reducedMotion: false }).destroy()
		expect(added.length).toBe(0)
	})
})

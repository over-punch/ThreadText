// threadText/src/react/useThreadText.ts — React hook: instance lifecycle + live updates
import { useEffect, useLayoutEffect, useRef } from 'react'
import { createThreadText } from '../core/threadText'
import type { ThreadTextInstance, ThreadTextOptions } from '../core/types'

/**
 * React hook that mounts a threadText renderer inside a ref'd container.
 *
 * The instance is created once and kept alive; every option change is applied live via
 * `instance.update()` (no remount, no re-sew), and text changes route through `setText`. The renderer
 * re-fits to its container's width by itself and tears down on unmount. Only `reducedMotion` (fixed at
 * creation) forces a fresh instance.
 *
 * @typeParam T - the container element type (default `HTMLElement`); pass e.g.
 * `useThreadText<HTMLDivElement>(...)` so the returned ref attaches cleanly to a `<div>`.
 * @param options - {@link ThreadTextOptions} for the renderer.
 * @returns A ref to attach to the target container element.
 */
export function useThreadText<T extends HTMLElement = HTMLElement>(options: ThreadTextOptions) {
	const ref = useRef<T>(null)
	const instanceRef = useRef<ThreadTextInstance | null>(null)
	const optionsRef = useRef(options)
	optionsRef.current = options
	const onTextChangeRef = useRef(options.onTextChange)
	onTextChangeRef.current = options.onTextChange

	const { text, reducedMotion, onTextChange: _onTextChange, ...live } = options
	// Every option except text and the callback, serialised so an inline object doesn't update every render.
	const liveKey = JSON.stringify(live)

	// (Re)create on mount, when reducedMotion changes (it's fixed at construction), and when the element
	// changes (e.g. a different `as`); runs after every render but does nothing otherwise.
	const mounted = useRef<{ el: HTMLElement; reducedMotion: unknown } | null>(null)
	useLayoutEffect(() => {
		const el = ref.current
		const current = mounted.current
		if (current && current.el === el && current.reducedMotion === reducedMotion) return
		instanceRef.current?.destroy()
		instanceRef.current = null
		mounted.current = null
		if (!el) return
		instanceRef.current = createThreadText(el, {
			...optionsRef.current,
			// Stable callback wrapper so typing edits always reach the latest handler.
			onTextChange: (t) => onTextChangeRef.current?.(t),
		})
		mounted.current = { el, reducedMotion }
	})

	// Tear down on unmount.
	useEffect(() => () => {
		instanceRef.current?.destroy()
		instanceRef.current = null
		mounted.current = null
	}, [])

	// Live option changes → update() (instant redraw, never a re-sew).
	useEffect(() => {
		const { text: _t, reducedMotion: _r, onTextChange: _o, ...current } = optionsRef.current
		instanceRef.current?.update(current)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [liveKey])

	// Text changes → setText.
	useEffect(() => {
		instanceRef.current?.setText(text)
	}, [text])

	return ref
}

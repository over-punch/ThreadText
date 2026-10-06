// threadText/src/react/ThreadText.tsx — React component wrapper
import React, { forwardRef, useCallback } from 'react'
import { useThreadText } from './useThreadText'
import type { ThreadTextOptions } from '../core/types'

interface ThreadTextProps extends ThreadTextOptions, Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className' | 'style'> {
	className?: string
	style?: React.CSSProperties
	/** Container element type, e.g. 'h1' — it keeps its own semantics. (default: 'div') */
	as?: React.ElementType
}

/** ThreadTextOptions keys: consumed by the renderer, not forwarded to the DOM element. */
const OPTION_KEYS: (keyof ThreadTextOptions)[] = [
	'text', 'font', 'weight', 'fill', 'align', 'pitch', 'threadColor', 'threadColor2', 'colorMode', 'backstitch',
	'outlineColor', 'sewRate', 'sewStyle', 'stitchMode', 'sheen', 'animate', 'editable', 'reducedMotion', 'axes', 'onTextChange',
]

/**
 * Drop-in component that embroiders `text` inside a self-sizing container. The element keeps its own
 * semantics (`as="h1"` stays a heading): the renderer puts the text in the element, visually hidden, for
 * screen readers, find-in-page and translation, and hides the canvases from them. HTML attributes and
 * handlers (id, aria-*, data-*, lang, onClick…) are forwarded to the element.
 */
export const ThreadText = forwardRef<HTMLElement, ThreadTextProps>(
	function ThreadText({ className, style, as: Tag = 'div', ...rest }, forwardedRef) {
		const options = {} as ThreadTextOptions
		const htmlProps: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(rest)) {
			if ((OPTION_KEYS as string[]).includes(key)) (options as unknown as Record<string, unknown>)[key] = value
			else htmlProps[key] = value
		}
		const innerRef = useThreadText(options)

		// Merge the hook's internal ref with any forwarded ref.
		const mergedRef = useCallback(
			(node: HTMLElement | null) => {
				;(innerRef as React.MutableRefObject<HTMLElement | null>).current = node
				if (typeof forwardedRef === 'function') forwardedRef(node)
				else if (forwardedRef) forwardedRef.current = node
			},
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[innerRef, forwardedRef],
		)

		// A changed `as` is a new element: remount it (key) so the renderer mounts into it.
		return (
			<Tag
				key={typeof Tag === 'string' ? Tag : 'C'}
				ref={mergedRef as React.Ref<HTMLElement>}
				className={className}
				style={style}
				{...htmlProps}
			/>
		)
	},
)

ThreadText.displayName = 'ThreadText'

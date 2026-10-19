/**
 * true from 1024px (the desktop shell). Based on the window width, so it is right on the first
 * render (useMediaQuery reports false until mounted, which flashes the phone layout).
 */
export function useIsDesktop(minWidth = 1024) {
  const { width } = useWindowSize()
  return computed(() => width.value >= minWidth)
}

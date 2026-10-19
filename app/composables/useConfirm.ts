import { DConfirmModal } from '#components'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  /** Text the user must type to enable the button (e.g. the project title). */
  phrase?: string
  danger?: boolean
}

/** Asks for confirmation before something that cannot be undone. Resolves true when confirmed. */
export function useConfirm() {
  const overlay = useOverlay()
  const modal = overlay.create(DConfirmModal)
  return async (options: ConfirmOptions): Promise<boolean> => {
    const result = await modal.open(options)
    return result === true
  }
}

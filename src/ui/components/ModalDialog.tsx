import { useEffect, useRef, type ReactNode } from 'react';
import { audio } from '@/game/audio/AudioManager';

interface ModalDialogProps {
  labelledBy: string;
  describedBy?: string | undefined;
  children: ReactNode;
  /** Called on a fresh (non-repeated) Escape press. Escape does nothing when omitted. */
  onEscape?: () => void;
  className?: string;
  testId?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab / Shift+Tab cycling inside the dialog (never out to the page or browser UI). */
function trapTab(dialog: HTMLDialogElement, event: KeyboardEvent): void {
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Modal built on the native <dialog> element: `showModal()` makes the rest of the page inert,
 * traps focus inside the dialog and restores focus when it closes. The element's own cancel
 * behaviour is replaced so Escape only does what the caller wants.
 */
export function ModalDialog({ labelledBy, describedBy, children, onEscape, className, testId }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    audio.play('ui_open', { volume: 0.4 });

    const onCancel = (event: Event): void => {
      event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        trapTab(dialog, event);
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) onEscapeRef.current?.();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('keydown', onKeyDown);
      if (dialog.open) dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={['modal', className].filter(Boolean).join(' ')}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-testid={testId}
    >
      <div className="panel">
        <div className="panel__content">{children}</div>
      </div>
    </dialog>
  );
}

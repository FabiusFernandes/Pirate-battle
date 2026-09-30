import type { ComponentPropsWithoutRef, ReactNode } from 'react';

interface PanelProps extends ComponentPropsWithoutRef<'section'> {
  children: ReactNode;
  size?: 'default' | 'wide';
}

/** Wooden framed panel from the UI atlas (`panel_menu`, rendered as a 9-slice border image). */
export function Panel({ children, size = 'default', className, ...rest }: PanelProps) {
  return (
    <section {...rest} className={['panel', `panel--${size}`, className].filter(Boolean).join(' ')}>
      <div className="panel__content">{children}</div>
    </section>
  );
}

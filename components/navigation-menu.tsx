'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';

export function NavigationMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    }
    const desktop = window.matchMedia('(min-width: 1025px)');
    function resize() {
      if (desktop.matches) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    desktop.addEventListener('change', resize);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      desktop.removeEventListener('change', resize);
    };
  }, [open]);

  return (
    <div className="navigation-menu" ref={root}>
      <button
        className="navigation-toggle"
        type="button"
        ref={toggle}
        aria-label={open ? 'Chiudi menu' : 'Apri menu'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        <span>Menu</span>
      </button>
      <div
        className="navigation-content"
        id={id}
        data-open={open}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('a, .logout-button'))
            setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}

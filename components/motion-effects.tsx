'use client';

import { useEffect } from 'react';

const revealGroups = [
  {
    selector:
      '.home-stories .section-heading, .crew-copy, .page-heading, .year-heading, .rule-head, .registry-heading',
    direction: 'left',
  },
  {
    selector: '.dream-card, .crew-feature, .profile-balance',
    direction: 'right',
  },
  {
    selector:
      '.welcome-strip, .profile-intro > div, .profile-cards > *, .section-block, .filter-bar, .leaderboard-title, .leader-row, .route-card, .mystery-card, .rule-columns > div, .weapon-rule-grid > div, .admin-toolbar, .admin-tile, .registry-section, .admin-mysteries, .mystery-admin-card, .table-wrap, .empty-state, .footer-inner, .auth-frame, .auth-postcards figure',
    direction: 'up',
  },
] as const;

export function MotionEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (reducedMotion.matches) {
      root.classList.add('motion-reduced');
      return () => root.classList.remove('motion-reduced');
    }

    root.classList.add('motion-enhanced', 'motion-preparing');

    let revealIndex = 0;
    let revealsReady = false;
    let prepareFrame = 0;
    let scrollFrame = 0;
    let pointerFrame = 0;
    const pendingReveals = new Set<HTMLElement>();

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -4% 0px', threshold: 0.05 },
    );

    function bindElement(element: HTMLElement, direction: string) {
      if (element.dataset.motionBound === 'true') {
        if (revealsReady) revealObserver.observe(element);
        else pendingReveals.add(element);
        return;
      }
      element.dataset.motionBound = 'true';
      element.dataset.motionDirection = direction;
      element.style.setProperty('--motion-order', String(revealIndex % 6));
      element.classList.add('motion-reveal');
      revealIndex += 1;
      if (revealsReady) revealObserver.observe(element);
      else pendingReveals.add(element);
    }

    function scan(scope: Document | HTMLElement) {
      revealGroups.forEach(({ selector, direction }) => {
        if (scope instanceof HTMLElement && scope.matches(selector)) {
          bindElement(scope, direction);
        }
        scope
          .querySelectorAll<HTMLElement>(selector)
          .forEach((element) => bindElement(element, direction));
      });
    }

    scan(document);
    prepareFrame = window.requestAnimationFrame(() => {
      // Commit the hidden starting state before enabling reveal transitions.
      void root.offsetHeight;
      root.classList.remove('motion-preparing');
      revealsReady = true;
      pendingReveals.forEach((element) => revealObserver.observe(element));
      pendingReveals.clear();
    });

    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node);
        });
      });
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    function updateScroll() {
      scrollFrame = 0;
      const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(Math.max(window.scrollY / scrollable, 0), 1);
      root.style.setProperty('--page-progress', String(progress));
      root.classList.toggle('motion-scrolled', window.scrollY > 18);
    }

    function onScroll() {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(updateScroll);
    }

    function onPointerMove(event: PointerEvent) {
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      pointerFrame = window.requestAnimationFrame(() => {
        root.style.setProperty('--pointer-x', `${(x * 18).toFixed(2)}px`);
        root.style.setProperty('--pointer-y', `${(y * 12).toFixed(2)}px`);
        pointerFrame = 0;
      });
    }

    updateScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (precisePointer.matches)
      window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      revealObserver.disconnect();
      mutations.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      if (prepareFrame) window.cancelAnimationFrame(prepareFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      root.classList.remove('motion-enhanced', 'motion-preparing', 'motion-scrolled');
      root.style.removeProperty('--page-progress');
      root.style.removeProperty('--pointer-x');
      root.style.removeProperty('--pointer-y');
    };
  }, []);

  return <div className="motion-progress" aria-hidden="true" />;
}

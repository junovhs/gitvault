/** Keyboard navigation shared by both static entrypoints. No network or persistence. */
function focusMain(scrollToTop: boolean): void {
  const main = document.querySelector<HTMLElement>('main');
  if (!main) return;
  main.tabIndex = -1;
  main.focus({ preventScroll: true });
  if (scrollToTop) window.scrollTo({ top: 0, behavior: 'auto' });
  else main.scrollIntoView({ block: 'start', behavior: 'auto' });
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('[data-skip-content]') : null;
  if (!target) return;
  // #main is a DOM destination, not a GitVault application route.
  event.preventDefault();
  focusMain(false);
});
window.addEventListener('hashchange', () => {
  // Let the app's route handler replace its main element before transferring focus.
  requestAnimationFrame(() => focusMain(true));
});

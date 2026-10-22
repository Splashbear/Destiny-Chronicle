/** Focus helpers for modal dialogs (CODE_CLEANUP_SPEC). */

export function trapFocusInModal(event: KeyboardEvent): void {
  const modal = document.querySelector('.modal.show');
  if (!modal) return;

  const focusableElements = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[
    focusableElements.length - 1
  ] as HTMLElement;

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement?.focus();
  } else if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement?.focus();
  }
}

export function focusFirstElementInModal(
  modalSelector: string,
  delayMs = 100
): void {
  setTimeout(() => {
    const modal = document.querySelector(modalSelector);
    if (modal) {
      const firstFocusable = modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      firstFocusable?.focus();
    }
  }, delayMs);
}

export function clearModalFocusToSearch(): void {
  const searchInput = document.querySelector(
    'input[placeholder*="username"]'
  ) as HTMLElement;
  searchInput?.focus();
}

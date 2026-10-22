// @ts-nocheck
/** Keyboard / visibility handlers extracted from PlayerSearchComponent (CODE_CLEANUP_SPEC). */

export function handleEscapeKey(c: any): void {
  if (c.showPlatformPicker) {
    c.showPlatformPicker = false;
    c.clearModalFocus();
    c.cdr.detectChanges();
  } else if (c.showFavoritesModal) {
    c.showFavoritesModal = false;
    c.clearModalFocus();
    c.cdr.detectChanges();
  } else if (c.showExportDialog) {
    c.showExportDialog = false;
    c.clearModalFocus();
    c.cdr.detectChanges();
  }
}

export function handleEnterKey(c: any, event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (
    target.tagName === 'INPUT' &&
    target.getAttribute('placeholder')?.includes('username')
  ) {
    if (c.searchUsername.trim()) {
      c.addPlayer();
    }
  }
  if (
    target.tagName === 'BUTTON' &&
    (c.showPlatformPicker || c.showFavoritesModal)
  ) {
    return;
  }
}

export function handleTabKey(c: any, event: KeyboardEvent): void {
  if (c.showPlatformPicker || c.showFavoritesModal) {
    c.trapFocusInModal(event);
  }
}

export function onVisibilityChange(c: any): void {
  if (typeof document === 'undefined') return;
  if (document.hidden) {
    if (c.showLoadingModal || c.loadingProgress) {
      c.wasLoadingWhileTabHidden = true;
    }
  } else {
    if (c.wasLoadingWhileTabHidden) {
      c.wasLoadingWhileTabHidden = false;
      c.showBackgroundLoadingTip = true;
      c.cdr.markForCheck();
      setTimeout(() => {
        c.showBackgroundLoadingTip = false;
        c.cdr.markForCheck();
      }, 10000);
    }
    if (c.showLoadingModal || c.loadingProgress) {
      c.cdr.detectChanges();
    }
  }
}

export function closeModalOnBackdrop(c: any, event: Event): void {
  const onBackdrop = event.target === event.currentTarget;
  if (onBackdrop && c.modalBackdropArmed) {
    c.showPlatformPicker = false;
    c.showFavoritesModal = false;
    c.showShareDropdown = false;
  }
  c.modalBackdropArmed = false;
}

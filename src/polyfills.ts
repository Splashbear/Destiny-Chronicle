/**
 * This file includes polyfills needed by Angular and is loaded before the app.
 * You can add your own extra polyfills to this file.
 */

// Zone.js is required by Angular
import 'zone.js';

// IndexedDB polyfill for Safari
if (typeof window !== 'undefined') {
  // Safari IndexedDB compatibility
  if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
    // Ensure IndexedDB is available
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported in this Safari version');
    }
  }

  // Web Share API polyfill
  if (!navigator.share) {
    (navigator as any).share = undefined;
  }

  // Clipboard API polyfill
  if (!navigator.clipboard) {
    (navigator as any).clipboard = {
      writeText: (text: string) => {
        return new Promise<void>((resolve, reject) => {
          try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
              resolve();
            } else {
              reject(new Error('Copy command failed'));
            }
          } catch (error) {
            reject(error);
          }
        });
      }
    };
  }

  // Promise.allSettled polyfill for older browsers
  if (!Promise.allSettled) {
    Promise.allSettled = function<T>(promises: Promise<T>[]) {
      return Promise.all(
        promises.map(promise =>
          promise
            .then(value => ({ status: 'fulfilled' as const, value }))
            .catch(reason => ({ status: 'rejected' as const, reason }))
        )
      );
    };
  }
}

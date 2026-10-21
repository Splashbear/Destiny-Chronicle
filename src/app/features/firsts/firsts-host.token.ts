import { InjectionToken } from '@angular/core';

/**
 * Parent host for the Firsts tab (CODE_CLEANUP_SPEC Step 4).
 * PlayerSearchComponent provides itself; later a FirstsStore can replace it.
 */
export const FIRSTS_HOST = new InjectionToken<any>('FIRSTS_HOST');

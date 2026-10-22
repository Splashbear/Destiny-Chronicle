import { InjectionToken } from '@angular/core';

/**
 * Parent host for the Accomplishments tab (CODE_CLEANUP_SPEC Step 4).
 * PlayerSearchComponent provides itself; a dedicated store can replace it later.
 */
export const ACCOMPLISHMENTS_HOST = new InjectionToken<any>('ACCOMPLISHMENTS_HOST');

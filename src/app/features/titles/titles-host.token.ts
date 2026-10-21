import { InjectionToken } from '@angular/core';

/**
 * Parent host for the Titles tab (CODE_CLEANUP_SPEC Step 4).
 * PlayerSearchComponent provides itself; a TitlesStore can replace it later.
 */
export const TITLES_HOST = new InjectionToken<any>('TITLES_HOST');

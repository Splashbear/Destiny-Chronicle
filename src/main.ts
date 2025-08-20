import './polyfills';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { isDevMode } from '@angular/core';
import { environment } from './environments/environment';

// Suppress noisy debug logs when debug flag is off (works in dev and prod)
if (!environment.debug) {
	const originalWarn = console.warn.bind(console);
	const isDebugLike = (firstArg: any): boolean => {
		if (typeof firstArg !== 'string') return false;
		return firstArg.includes('[DEBUG]') || firstArg.includes('{debug}') || firstArg.includes('[Date Check]');
	};
	console.log = () => {};
	console.debug = () => {};
	console.warn = (...args: any[]) => {
		if (isDebugLike(args[0])) { return; }
		originalWarn(...args);
	};
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

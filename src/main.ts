import './polyfills';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { isDevMode } from '@angular/core';
import { environment } from './environments/environment';

// Suppress debug logs in production
if (!environment.debug) {
	const originalWarn = console.warn.bind(console);
	const originalError = console.error.bind(console);
	const isDebugLike = (firstArg: any): boolean => {
		if (typeof firstArg !== 'string') return false;
		return firstArg.includes('[DEBUG]') || firstArg.includes('[TITLES DEBUG]') || firstArg.includes('[Date Check]');
	};
	console.log = () => {};
	console.debug = () => {};
	console.info = () => {};
	console.time = (_label?: string) => {};
	console.timeEnd = (_label?: string) => {};
	// timeLog may not exist in all environments; guard if present
	if (typeof console.timeLog === 'function') {
		(console as any).timeLog = (_label?: string, ..._data: any[]) => {};
	}
	console.warn = (...args: any[]) => {
		if (isDebugLike(args[0])) { return; }
		originalWarn(...args);
	};
	console.error = (...args: any[]) => {
		if (isDebugLike(args[0])) { return; }
		originalError(...args);
	};
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

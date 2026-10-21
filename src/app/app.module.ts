/**
 * Legacy NgModule — unused. Bootstrap is `bootstrapApplication` in `src/main.ts`.
 * Kept only so old imports do not break; do not add providers here.
 * BungieApiService is `providedIn: 'root'` in `core/data`.
 */
import { NgModule } from '@angular/core';

@NgModule({})
export class AppModule {}

import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { TestApiComponent } from './components/test-api/test-api.component';
import { BungieApiService } from './services/bungie-api.service';
import { WorkerService } from './services/worker.service';

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppComponent,
    TestApiComponent
  ],
  providers: [
    BungieApiService,
    WorkerService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { } 
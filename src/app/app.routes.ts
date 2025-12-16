import { Routes } from '@angular/router';
import { JoinComponent } from './features/join/join.component';
import { PartyComponent } from './features/party/party.component';
import { QrComponent } from './features/qr/qr.component';

export const routes: Routes = [
  { path: '', component: JoinComponent },
  { path: 'party', component: PartyComponent },
  { path: 'qr/:code', component: QrComponent },
  { path: '**', redirectTo: '' },
];

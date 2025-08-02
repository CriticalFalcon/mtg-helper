import { Routes } from '@angular/router';
import { CardSearchComponent } from './card-search/card-search.component';

export const routes: Routes = [
    { path: 'card/:name', component: CardSearchComponent },
    { path: '**', redirectTo: '' } // fallback
];

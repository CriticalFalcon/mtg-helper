import { Routes } from '@angular/router';
import { CardSearchComponent } from './card-search/card-search.component';
import { DeckCompareComponent } from './deck-compare/deck-compare.component';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
	{ path: '', component: HomeComponent },
	{ path: 'card', component: CardSearchComponent },
	{ path: 'card/:name', component: CardSearchComponent },
	{ path: 'compare', component: DeckCompareComponent },
	{ path: '**', redirectTo: '' } // fallback
];

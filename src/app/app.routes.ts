import { Routes } from '@angular/router';
import { CardSearchComponent } from './card-search/card-search.component';
import { DeckAnalyzerComponent } from './deck-analyzer/deck-analyzer.component';
import { DeckCompareComponent } from './deck-compare/deck-compare.component';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
	{ path: '', component: HomeComponent },
	{ path: 'card', component: CardSearchComponent },
	{ path: 'card/:name', component: CardSearchComponent },
	{ path: 'analyzer', component: DeckAnalyzerComponent },
	{ path: 'compare', component: DeckCompareComponent },
	{ path: '**', redirectTo: '' }, // fallback
];

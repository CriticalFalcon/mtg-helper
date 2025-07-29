import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CardSearchComponent } from "./card-search/card-search.component";

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, CardSearchComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {
    title = 'mtg-helper';
}

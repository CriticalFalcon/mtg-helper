import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CardSearchComponent } from "./card-search/card-search.component";
import { NavbarComponent } from "./navbar/navbar.component";

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, CardSearchComponent, NavbarComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {
    title = 'mtg-helper';
}

import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate, query, group } from '@angular/animations';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',

  animations: [
    trigger('routeAnimations', [
      transition('* <=> *', [
        style({ position: 'relative' }),

        query(
          ':enter, :leave',
          [
            style({
              position: 'absolute',
              width: '100%',
              top: 0,
              left: 0,
            }),
          ],
          { optional: true },
        ),

        group([
          query(':leave', [animate('200ms ease', style({ opacity: 0 }))], { optional: true }),

          query(':enter', [style({ opacity: 0 }), animate('200ms ease', style({ opacity: 1 }))], {
            optional: true,
          }),
        ]),
      ]),
    ]),
  ],
})
export class App {
  protected readonly title = signal('SAMS');
}

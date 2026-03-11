import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidenav } from '../sidenav/sidenav';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, Sidenav, Topbar],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {}

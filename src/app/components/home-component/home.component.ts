import { RoundlistComponent } from './../roundlist-component/roundlist-component';
import { Component } from '@angular/core';
import { TableComponent} from '../table-component/table-component';
@Component({
  standalone: true,
  selector: 'app-home.component',
  imports: [RoundlistComponent,TableComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

}

import { Component } from '@angular/core';
import { FeatureService } from '../feature.service';

@Component({
  selector: 'app-add-absence',
  templateUrl: './add-absence.component.html',
})
export class AddAbsenceComponent {
  constructor(private readonly featureService: FeatureService) {}

  save(): void {
    if (this.featureService.isEnabled('absence')) {
      console.log('saved');
    }
  }
}

import { Component, Input } from '@angular/core';
import { FeatureService } from '../feature.service';

@Component({
  selector: 'app-badge',
  templateUrl: './badge.component.html',
  styleUrls: ['./badge.component.scss'],
})
export class BadgeComponent {
  @Input() label = '';

  constructor(private readonly featureService: FeatureService) {}

  isHighlighted(): boolean {
    return this.featureService.isEnabled('badge-highlight');
  }
}

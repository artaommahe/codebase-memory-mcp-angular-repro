import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FeatureService {
  isEnabled(flag: string): boolean {
    return flag.length > 0;
  }
}

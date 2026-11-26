import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Turns a stored image path (/uploads/x.jpg) into a full URL on the API server. */
@Pipe({ name: 'imageUrl' })
export class ImageUrlPipe implements PipeTransform {
  transform(path: string | null | undefined): string {
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    return `${environment.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }
}

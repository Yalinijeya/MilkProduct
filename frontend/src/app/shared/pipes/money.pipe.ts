import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../../environments/environment';

const whole = new Intl.NumberFormat(environment.locale, { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat(environment.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats a number as money, e.g. 1250 → "Rs. 1,250", 55.5 → "Rs. 55.50" */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    const v = value ?? 0;
    return environment.currencySymbol + (Number.isInteger(v) ? whole : cents).format(v);
  }
}

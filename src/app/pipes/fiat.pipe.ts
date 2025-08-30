import { CurrencyPipe } from '@angular/common'
import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
	name: 'fiat'
})

export class FiatPipe extends CurrencyPipe implements PipeTransform {
	transform (
		value: any,
		currencyCode?: string,
		display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
		digits?: string,
		locale?: string
	): any {
		if (currencyCode === '') {
			return ``
		}
		if (currencyCode === 'BTC') {
			return `BTC ${Number(value || 0).toFixed(6)}`
		}
		return super.transform(value, currencyCode, 'symbol-narrow', digits, locale)
	}
}

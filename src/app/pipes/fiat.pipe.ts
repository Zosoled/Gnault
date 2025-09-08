import { CurrencyPipe } from '@angular/common'
import { inject, Pipe, PipeTransform } from '@angular/core'
import { PriceService } from 'app/services'

@Pipe({ name: 'fiat' })
export class FiatPipe extends CurrencyPipe implements PipeTransform {
	svcPrice = inject(PriceService)

	transform(
		value: any,
		currencyCode?: string,
		display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean,
		digits?: string,
		locale?: string
	): any {
		if (currencyCode === '') {
			return ''
		}
		if (currencyCode === 'BTC') {
			return `BTC ${Number(value || 0).toFixed(6)}`
		}
		return super.transform(value, currencyCode, 'symbol-narrow', digits, locale)
	}
}

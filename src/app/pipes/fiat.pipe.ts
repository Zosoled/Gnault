import { CurrencyPipe } from '@angular/common'
import { inject, Pipe, PipeTransform } from '@angular/core'
import { AppSettingsService, PriceService } from 'app/services'
import { Tools } from 'libnemo'

@Pipe({ name: 'fiat', pure: false })
export class FiatPipe extends CurrencyPipe implements PipeTransform {
	svcAppSettings = inject(AppSettingsService)
	svcPrice = inject(PriceService)

	transform (value: any): any {
		if (typeof value === 'string') {
			value = value.replace(/0+(.)/, '$1')
		}
		const nano = Tools.convert(value, 'raw', 'nano', 'number')
		const lastPrice = this.svcPrice.lastPrice()
		const fiat = nano * lastPrice
		const displayCurrency = this.svcAppSettings.settings().displayCurrency.toUpperCase()
		const currencyCode = this.override[displayCurrency] ?? displayCurrency
		const maxFractionDigits = currencyCode === 'BTC' ? 6 : 2
		const result = super.transform(fiat, currencyCode, 'symbol', `1.2-${maxFractionDigits}`)
		return result
	}

	override = {
		'BMD': 'BD$'
	}
}

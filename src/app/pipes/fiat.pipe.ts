import { CurrencyPipe } from '@angular/common'
import { inject, Pipe, PipeTransform } from '@angular/core'
import { AppSettingsService, PriceService } from 'app/services'
import { Tools } from 'libnemo'

@Pipe({ name: 'fiat' })
export class FiatPipe extends CurrencyPipe implements PipeTransform {
	svcAppSettings = inject(AppSettingsService)
	svcPrice = inject(PriceService)

	transform (value: any): any {
		if (typeof value === 'string') {
			value = value.replace(/0+(.)/, '$1')
		}
		value = Tools.convert(value, 'raw', 'nano', 'number') * this.svcPrice.lastPrice()
		const currencyCode = this.svcAppSettings.settings.displayCurrency
		const maxFractionDigits = currencyCode === 'BTC' ? 6 : 2
		return super.transform(value, currencyCode.toUpperCase(), 'symbol', `1.2-${maxFractionDigits}`)
	}
}

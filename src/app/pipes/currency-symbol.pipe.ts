import { CurrencyPipe } from '@angular/common'
import { Pipe, PipeTransform, inject } from '@angular/core'
import { AppSettingsService } from 'app/services'

// Shows the currency symbol ($, BTC, etc) and removes any numeric values
@Pipe({ name: 'currencySymbol' })
export class CurrencySymbolPipe extends CurrencyPipe implements PipeTransform {
	svcAppSettings = inject(AppSettingsService)
	transform (value: any): any {
		const currency = super.transform(0, this.svcAppSettings.settings.displayCurrency.toUpperCase(), 'symbol', '1.0-0')
		return currency.replace(/[0-9]/g, '')
	}
}

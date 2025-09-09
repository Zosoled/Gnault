import { CurrencyPipe } from '@angular/common'
import { Pipe, PipeTransform } from '@angular/core'

// Shows the currency symbol ($, BTC, etc) and removes any numeric values
@Pipe({ name: 'currencySymbol' })
export class CurrencySymbolPipe extends CurrencyPipe implements PipeTransform {
	transform(value: any, args?: any): any {
		const currency = super.transform(0, value, 'symbol', '1.0-2')
		return currency.replace(/[0-9]/g, '')
	}
}

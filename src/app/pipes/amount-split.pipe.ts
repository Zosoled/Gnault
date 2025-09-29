import { Pipe, PipeTransform } from '@angular/core'

/**
 * Splits a number at the decimal point and returns either the integer or the
 * fraction.
 */
@Pipe({ name: 'amountsplit' })
export class AmountSplitPipe implements PipeTransform {
	transform (input: string, index: number): string {
		const splitAmount = input.split('.')[index]
		// Integer
		if (index === 0) {
			return splitAmount.replace('BTC ', '').trim()
		}
		// Fraction
		const fractionalAmount = (splitAmount ?? '').replace(/0+$/g, '').trim()
		return fractionalAmount === '' ? '' : `.${fractionalAmount}`
	}
}

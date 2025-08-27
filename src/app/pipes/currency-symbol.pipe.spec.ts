import { CurrencySymbolPipe } from './currency-symbol.pipe'

describe('CurrencySymbolPipe', () => {
	it('create an instance', () => {
		const pipe = new CurrencySymbolPipe('en-us')
		expect(pipe).toBeTruthy()
	})
})

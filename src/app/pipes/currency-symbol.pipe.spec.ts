import { CurrencySymbolPipe } from 'app/pipes'

describe('CurrencySymbolPipe', () => {
	it('create an instance', () => {
		const pipe = new CurrencySymbolPipe('en-us')
		expect(pipe).toBeTruthy()
	})
})

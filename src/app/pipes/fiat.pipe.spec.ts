import { FiatPipe } from 'app/pipes'

describe('FiatPipe', () => {
	it('create an instance', () => {
		const pipe = new FiatPipe('en-us')
		expect(pipe).toBeTruthy()
	})
})

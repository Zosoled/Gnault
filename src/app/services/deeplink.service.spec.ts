import { TestBed, inject } from '@angular/core/testing'
import { DeeplinkService } from 'app/services'

describe('DeeplinkService', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [DeeplinkService]
		})
	})

	it('should be created', inject([DeeplinkService], (service: DeeplinkService) => {
		expect(service).toBeTruthy()
	}))
})

import { TestBed, inject } from '@angular/core/testing'
import { NinjaService } from 'app/services'

describe('NinjaService', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [NinjaService]
		})
	})

	it('should be created', inject([NinjaService], (service: NinjaService) => {
		expect(service).toBeTruthy()
	}))
})

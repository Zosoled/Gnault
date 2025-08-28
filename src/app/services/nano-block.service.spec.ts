import { TestBed, inject } from '@angular/core/testing'
import { NanoBlockService } from 'app/services'

describe('NanoBlockService', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [NanoBlockService]
		})
	})

	it('should be created', inject([NanoBlockService], (service: NanoBlockService) => {
		expect(service).toBeTruthy()
	}))
})

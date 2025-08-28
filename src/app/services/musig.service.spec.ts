import { TestBed } from '@angular/core/testing'
import { MusigService } from 'app/services'

describe('MusigService', () => {
	let service: MusigService

	beforeEach(() => {
		TestBed.configureTestingModule({})
		service = TestBed.inject(MusigService)
	})

	it('should be created', () => {
		expect(service).toBeTruthy()
	})
})

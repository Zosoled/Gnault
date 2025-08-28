import { TestBed, inject } from '@angular/core/testing'
import { ModalService } from 'app/services'

describe('ModalService', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [ModalService]
		})
	})

	it('should be created', inject([ModalService], (service: ModalService) => {
		expect(service).toBeTruthy()
	}))
})

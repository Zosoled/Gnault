import { TestBed, inject } from '@angular/core/testing'
import { WorkPoolService } from 'app/services'

describe('WorkPoolService', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [WorkPoolService]
		})
	})

	it('should be created', inject([WorkPoolService], (service: WorkPoolService) => {
		expect(service).toBeTruthy()
	}))
})

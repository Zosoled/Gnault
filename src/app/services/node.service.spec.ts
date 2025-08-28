import { TestBed, inject } from '@angular/core/testing'
import { NodeService } from 'app/services'

describe('NodeService', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [NodeService]
		})
	})

	it('should be created', inject([NodeService], (service: NodeService) => {
		expect(service).toBeTruthy()
	}))
})

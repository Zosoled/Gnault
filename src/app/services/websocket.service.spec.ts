import { TestBed, inject } from '@angular/core/testing'
import { WebsocketService } from 'app/services'

describe('WebsocketService', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [WebsocketService]
		})
	})

	it('should be created', inject([WebsocketService], (service: WebsocketService) => {
		expect(service).toBeTruthy()
	}))
})

import { TestBed, inject } from '@angular/core/testing'
import { AddressBookService } from 'app/services'

describe('AddressBookService', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [AddressBookService]
		})
	})

	it('should be created', inject([AddressBookService], (service: AddressBookService) => {
		expect(service).toBeTruthy()
	}))
})

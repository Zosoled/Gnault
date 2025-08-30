import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { ImportAddressBookComponent } from 'app/components'

describe('ImportAddressBookComponent', () => {
	let component: ImportAddressBookComponent
	let fixture: ComponentFixture<ImportAddressBookComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [ImportAddressBookComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(ImportAddressBookComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

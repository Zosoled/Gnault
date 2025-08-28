import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { QrScanComponent } from 'app/components'

describe('AddressBookComponent', () => {
	let component: QrScanComponent
	let fixture: ComponentFixture<QrScanComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [QrScanComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(QrScanComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

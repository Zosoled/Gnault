import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { NanoAddressComponent } from 'app/components/elements'

describe('NanoAddressComponent', () => {
	let component: NanoAddressComponent
	let fixture: ComponentFixture<NanoAddressComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [NanoAddressComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(NanoAddressComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { NanoAccountIdComponent } from 'app/components/helpers'

describe('NanoAccountIdComponent', () => {
	let component: NanoAccountIdComponent
	let fixture: ComponentFixture<NanoAccountIdComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [NanoAccountIdComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(NanoAccountIdComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

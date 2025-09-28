import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { NanoCardComponent } from 'app/components/elements'

describe('NanoCardComponent', () => {
	let component: NanoCardComponent
	let fixture: ComponentFixture<NanoCardComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [NanoCardComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(NanoCardComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

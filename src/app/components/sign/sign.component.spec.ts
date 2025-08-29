import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { SignComponent } from 'app/components'

describe('SignComponent', () => {
	let component: SignComponent
	let fixture: ComponentFixture<SignComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [SignComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(SignComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

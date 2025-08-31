import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { ChangeRepWidgetComponent } from 'app/components'

describe('ChangeRepWidgetComponent', () => {
	let component: ChangeRepWidgetComponent
	let fixture: ComponentFixture<ChangeRepWidgetComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [ChangeRepWidgetComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(ChangeRepWidgetComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

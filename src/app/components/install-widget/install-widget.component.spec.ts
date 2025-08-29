import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { InstallWidgetComponent } from 'app/components'

describe('InstallWidgetComponent', () => {
	let component: InstallWidgetComponent
	let fixture: ComponentFixture<InstallWidgetComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [InstallWidgetComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(InstallWidgetComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { SetPasswordDialogComponent } from 'app/components'

describe('SetPasswordDialogComponent', () => {
	let component: SetPasswordDialogComponent
	let fixture: ComponentFixture<SetPasswordDialogComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [SetPasswordDialogComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(SetPasswordDialogComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

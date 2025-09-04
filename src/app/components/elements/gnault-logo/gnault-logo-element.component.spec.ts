import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { GnaultLogoElementComponent } from 'app/components/elements'

describe('GnaultLogoElementComponent', () => {
	let component: GnaultLogoElementComponent
	let fixture: ComponentFixture<GnaultLogoElementComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [GnaultLogoElementComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(GnaultLogoElementComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { WalletsComponent } from 'app/components'

describe('WalletsComponent', () => {
	let component: WalletsComponent
	let fixture: ComponentFixture<WalletsComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [WalletsComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(WalletsComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

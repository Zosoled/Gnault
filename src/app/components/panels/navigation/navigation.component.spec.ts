import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { NavigationComponent } from 'app/components'

describe('NavigationComponent', () => {
	let component: NavigationComponent
	let fixture: ComponentFixture<NavigationComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [
				NavigationComponent
			],
		}).compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(NavigationComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})

	it('should have wallet widget', waitForAsync(() => {
		const compiled = fixture.debugElement.nativeElement
		expect(compiled.querySelector('app-wallet-widget')).toBeTruthy()
	}))
})

import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { UnlockWalletDialogComponent } from 'app/components/dialogs'

describe('UnlockWalletDialogComponent', () => {
	let component: UnlockWalletDialogComponent
	let fixture: ComponentFixture<UnlockWalletDialogComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [UnlockWalletDialogComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(UnlockWalletDialogComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

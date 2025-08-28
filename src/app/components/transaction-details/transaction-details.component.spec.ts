import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { TransactionDetailsComponent } from 'app/components'

describe('TransactionDetailsComponent', () => {
	let component: TransactionDetailsComponent
	let fixture: ComponentFixture<TransactionDetailsComponent>

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [TransactionDetailsComponent]
		})
			.compileComponents()
	}))

	beforeEach(() => {
		fixture = TestBed.createComponent(TransactionDetailsComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it('should create', () => {
		expect(component).toBeTruthy()
	})
})

import { AfterViewInit, Component, ElementRef, ViewChild, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective, translate } from '@jsverse/transloco'
import { NotificationsService, WalletService } from 'app/services'

@Component({
	selector: 'app-unlock-wallet-dialog',
	templateUrl: './unlock-wallet-dialog.component.html',
	styleUrls: ['./unlock-wallet-dialog.component.css'],
	imports: [FormsModule, TranslocoDirective],
})
export class UnlockWalletDialogComponent implements AfterViewInit {
	private svcNotifications = inject(NotificationsService)

	svcWallet = inject(WalletService)

	isFocused: boolean = false
	isIncorrect: boolean = false
	isPending: boolean = false
	modal: any
	password = ''
	UIkit = (window as any).UIkit

	@ViewChild('dialog') dialog: ElementRef
	@ViewChild('input') input: ElementRef

	ngAfterViewInit () {
		this.modal = this.UIkit.modal(this.dialog.nativeElement)
		this.UIkit.util.on(this.dialog.nativeElement, 'hidden', () => {
			this.onModalHidden()
		})
		this.svcWallet.isUnlockRequested$.subscribe(async (isRequested) => {
			if (isRequested && !this.svcWallet.isLedger()) {
				this.modal ? this.showModal() : (this.isPending = true)
			}
		})
		if (this.isPending) {
			this.showModal()
			this.isPending = false
		}
	}

	showModal () {
		this.password = ''
		this.modal.show()
		this.input.nativeElement.focus()
	}

	onModalHidden () {
		this.password = ''
		this.isFocused = false
		this.isIncorrect = false
		this.svcWallet.isUnlockRequested$.next(false)
	}

	async unlock () {
		const unlocked = await this.svcWallet.unlockWallet(this.password)
		this.password = ''
		if (unlocked) {
			this.isIncorrect = false
			this.modal.hide()
			this.svcNotifications.sendSuccess(translate('accounts.wallet-unlocked'))
		} else {
			this.isIncorrect = true
			this.svcNotifications.sendError(translate('accounts.wrong-password'))
		}
	}
}

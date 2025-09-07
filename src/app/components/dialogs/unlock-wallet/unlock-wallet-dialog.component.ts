import { AfterViewInit, Component, ElementRef, ViewChild, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { NotificationsService, WalletService } from 'app/services'

@Component({
	selector: 'app-unlock-wallet-dialog',
	templateUrl: './unlock-wallet-dialog.component.html',
	styleUrls: ['./unlock-wallet-dialog.component.css'],
	imports: [FormsModule, TranslocoPipe],
})
export class UnlockWalletDialogComponent implements AfterViewInit {
	private notificationService = inject(NotificationsService)
	private translocoService = inject(TranslocoService)

	walletService = inject(WalletService)

	modal: any
	password = ''
	isFocused: boolean = false
	isIncorrect: boolean = false
	isPending: boolean = false

	@ViewChild('dialog') dialog: ElementRef
	@ViewChild('input') input: ElementRef

	ngAfterViewInit() {
		const UIkit = (window as any).UIkit
		this.modal = UIkit.modal(this.dialog.nativeElement)
		UIkit.util.on(this.dialog.nativeElement, 'hidden', () => {
			this.onModalHidden()
		})
		this.walletService.isUnlockRequested$.subscribe(async (isRequested) => {
			if (isRequested) {
				this.modal ? this.showModal() : (this.isPending = true)
			}
		})
		if (this.isPending) {
			this.showModal()
			this.isPending = false
		}
	}

	showModal() {
		this.password = ''
		this.modal.show()
		this.input.nativeElement.focus()
	}

	onModalHidden() {
		this.password = ''
		this.isFocused = false
		this.isIncorrect = false
		this.walletService.isUnlockRequested$.next(false)
	}

	async unlock() {
		const unlocked = await this.walletService.unlockWallet(this.password)
		this.password = ''
		if (unlocked) {
			this.isIncorrect = false
			this.modal.hide()
			this.notificationService.sendSuccess(this.translocoService.translate('accounts.wallet-unlocked'))
		} else {
			this.isIncorrect = true
			this.notificationService.sendError(this.translocoService.translate('accounts.wrong-password'))
		}
	}
}

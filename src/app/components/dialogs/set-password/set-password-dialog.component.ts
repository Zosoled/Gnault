import { AfterViewInit, Component, ElementRef, ViewChild, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import { NotificationsService, WalletService } from 'app/services'
import { Wallet } from 'libnemo'

@Component({
	selector: 'app-set-password-dialog',
	templateUrl: './set-password-dialog.component.html',
	styleUrls: ['./set-password-dialog.component.css'],
	imports: [FormsModule, TranslocoDirective],
})
export class SetPasswordDialogComponent implements AfterViewInit {
	private svcNotifications = inject(NotificationsService)
	private svcTransloco = inject(TranslocoService)
	private svcWallet = inject(WalletService)

	newPassword: string = ''
	confirmPassword: string = ''

	isFocused: boolean = false
	isNotMatch: boolean = false
	isPending: boolean = false
	isTooShort: boolean = false

	fnWallet: (password: string) => Promise<Wallet>
	modal: any
	UIkit = (window as any).UIkit

	@ViewChild('dialog') dialog: ElementRef
	@ViewChild('newPasswordInput') newPasswordInput: ElementRef
	@ViewChild('confirmPasswordInput') confirmPasswordInput: ElementRef

	ngAfterViewInit () {
		this.modal = this.UIkit.modal(this.dialog.nativeElement)
		this.UIkit.util.on(this.dialog.nativeElement, 'hidden', () => {
			this.onModalHidden()
		})
		this.svcWallet.isChangePasswordRequested$.subscribe(async (fn: (password: string) => Promise<Wallet>) => {
			if (fn) {
				this.fnWallet = fn
				this.modal ? this.showModal() : (this.isPending = true)
			}
		})
		if (this.isPending) {
			this.showModal()
			this.isPending = false
		}
	}

	showModal () {
		this.newPassword = ''
		this.confirmPassword = ''
		this.isNotMatch = false
		this.isPending = false
		this.isTooShort = false
		this.modal.show()
		this.newPasswordInput.nativeElement.focus()
	}

	onModalHidden () {
		this.newPassword = ''
		this.confirmPassword = ''
		this.isNotMatch = false
		this.isPending = false
		this.isTooShort = false
		this.svcWallet.isChangePasswordRequested$.next(null)
		this.fnWallet = null
	}

	async update () {
		if (this.newPassword.length < 6) {
			this.isTooShort = true
		} else if (this.newPassword !== this.confirmPassword) {
			this.isNotMatch = true
		} else {
			try {
				const wallet = await this.fnWallet(this.newPassword)
				this.modal.hide()
				this.svcNotifications.sendSuccess(this.svcTransloco.translate('configure-wallet.set-wallet-password.success'))
				this.svcWallet.passwordUpdated$.next(wallet)
			} catch (err) {
				console.warn(err)
				this.svcNotifications.sendError(this.svcTransloco.translate('configure-wallet.set-wallet-password.error'))
				this.svcWallet.passwordUpdated$.next(null)
			} finally {
				this.newPassword = this.confirmPassword = ''
			}
		}
	}
}

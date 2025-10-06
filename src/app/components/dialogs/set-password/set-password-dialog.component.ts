import { AfterViewInit, Component, ElementRef, ViewChild, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import { NotificationsService, WalletService } from 'app/services'

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

	confirmPassword: string = ''
	isFocused: boolean = false
	isNotMatch: boolean = false
	isPending: boolean = false
	isTooShort: boolean = false
	modal: any
	newPassword: string = ''
	UIkit = (window as any).UIkit

	@ViewChild('dialog') dialog: ElementRef
	@ViewChild('newPasswordInput') newPasswordInput: ElementRef
	@ViewChild('confirmPasswordInput') confirmPasswordInput: ElementRef

	ngAfterViewInit () {
		this.modal = this.UIkit.modal(this.dialog.nativeElement)
		this.UIkit.util.on(this.dialog.nativeElement, 'hidden', () => {
			this.onModalHidden()
		})
		this.svcWallet.isChangePasswordRequested$.subscribe(async (isRequested) => {
			if (isRequested) {
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
		this.svcWallet.isChangePasswordRequested$.next(false)
	}

	async update () {
		if (this.newPassword.length < 6) {
			this.isTooShort = true
		} else if (this.newPassword !== this.confirmPassword) {
			this.isNotMatch = true
		} else {
			try {
				const updated = await this.svcWallet.setPassword(this.newPassword)
				if (!updated) {
					throw new Error('Failed to update password')
				}
				this.modal.hide()
				this.svcNotifications.sendSuccess(this.svcTransloco.translate('configure-wallet.set-wallet-password.success'))
			} catch (err) {
				this.svcNotifications.sendError(this.svcTransloco.translate('configure-wallet.set-wallet-password.error'))
			} finally {
				this.newPassword = this.confirmPassword = ''
			}
		}
	}
}

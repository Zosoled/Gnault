import { CommonModule } from '@angular/common'
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import {
	AppSettingsService,
	LedgerService,
	NotificationService,
	PowService,
	WalletService
} from 'app/services'

@Component({
	selector: 'app-wallet-widget',
	templateUrl: './wallet-widget.component.html',
	styleUrls: ['./wallet-widget.component.css'],
	imports: [
		CommonModule,
		FormsModule,
		RouterLink,
		TranslocoPipe
	]
})

export class WalletWidgetComponent implements OnInit {
	private notificationService = inject(NotificationService)
	private powService = inject(PowService)
	private translocoService = inject(TranslocoService)
	walletService = inject(WalletService)
	ledgerService = inject(LedgerService)
	settings = inject(AppSettingsService)

	wallet = this.walletService.wallet
	ledgerStatus = {
		status: 'not-connected',
		statusText: '',
	}
	powAlert = false

	unlockPassword = ''
	validatePassword = false

	modal: any = null
	mayAttemptUnlock = true
	timeoutIdAllowingUnlock: any = null

	@ViewChild('passwordInput') passwordInput: ElementRef

	ngOnInit () {
		const UIkit = (window as any).UIkit
		const modal = UIkit.modal(document.getElementById('unlock-wallet-modal'))
		UIkit.util.on('#unlock-wallet-modal', 'hidden', () => {
			this.onModalHidden()
		})
		this.modal = modal

		this.ledgerService.ledgerStatus$.subscribe((ledgerStatus) => {
			this.ledgerStatus = ledgerStatus
		})

		// Detect if a PoW is taking too long and alert
		this.powService.powAlert$.subscribe(async shouldAlert => {
			if (shouldAlert) {
				this.powAlert = true
			} else {
				this.powAlert = false
			}
		})

		this.walletService.wallet.unlockModalRequested$.subscribe(async wasRequested => {
			if (wasRequested === true) {
				this.showModal()
			}
		})
	}

	showModal () {
		this.unlockPassword = ''
		this.modal.show()
	}

	onModalHidden () {
		this.unlockPassword = ''
		this.walletService.wallet.unlockModalRequested$.next(false)
	}

	async lockWallet () {
		const locked = await this.walletService.lockWallet()
		if (locked) {
			this.notificationService.sendSuccess(this.translocoService.translate('accounts.wallet-locked'))
		} else {
			this.notificationService.sendError(`Unable to lock wallet`)
		}
	}

	async reloadLedger () {
		this.notificationService.sendInfo(`Checking Ledger Status...`, { identifier: 'ledger-status', length: 0 })
		try {
			await this.ledgerService.loadLedger()
			this.notificationService.removeNotification('ledger-status')
			if (this.ledgerStatus.status === 'CONNECTED') {
				this.notificationService.sendSuccess(`Successfully connected to Ledger device`)
			} else if (this.ledgerStatus.status === 'LOCKED') {
				this.notificationService.sendError(`Ledger device locked. Unlock and try again.`)
			}
		} catch (err) {
			console.log(`Got error when loading ledger! `, err)
			this.notificationService.removeNotification('ledger-status')
			// this.notificationService.sendError(`Unable to load Ledger Device: ${err.message}`)
		}
	}

	allowUnlock (params: any) {
		this.mayAttemptUnlock = true
		this.timeoutIdAllowingUnlock = null
		this.unlockPassword = ''

		if (params.focusInputElement === true) {
			setTimeout(() => { this.passwordInput.nativeElement.focus() }, 10)
		}
	}

	async unlockWallet () {
		if (this.mayAttemptUnlock === false) {
			return
		}
		this.mayAttemptUnlock = false
		if (this.timeoutIdAllowingUnlock !== null) {
			clearTimeout(this.timeoutIdAllowingUnlock)
		}
		this.timeoutIdAllowingUnlock = setTimeout(
			() => {
				this.allowUnlock({ focusInputElement: true })
			},
			500
		)
		const unlocked = await this.walletService.unlockWallet(this.unlockPassword)

		if (unlocked) {
			this.notificationService.sendSuccess(this.translocoService.translate('accounts.wallet-unlocked'))
			this.modal.hide()
			if (this.timeoutIdAllowingUnlock !== null) {
				clearTimeout(this.timeoutIdAllowingUnlock)
				this.timeoutIdAllowingUnlock = null
			}
			this.allowUnlock({ focusInputElement: false })
		} else {
			this.notificationService.sendError(this.translocoService.translate('accounts.wrong-password'))
		}
	}

	cancelPow () {
		this.powService.cancelAllPow(true)
	}
}

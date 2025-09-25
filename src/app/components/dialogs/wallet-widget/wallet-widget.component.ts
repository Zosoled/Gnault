import { Component, OnInit, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { NotificationsService, PowService, WalletService } from 'app/services'

@Component({
	selector: 'app-wallet-widget',
	templateUrl: './wallet-widget.component.html',
	styleUrls: ['./wallet-widget.component.css'],
	imports: [FormsModule, RouterLink, TranslocoPipe],
})
export class WalletWidgetComponent implements OnInit {
	private svcNotifications = inject(NotificationsService)
	private svcPow = inject(PowService)
	private svcTransloco = inject(TranslocoService)
	private svcWallet = inject(WalletService)

	powAlert = signal(false)

	get isConfigured () {
		return this.svcWallet.isConfigured()
	}
	get isLedger () {
		return this.svcWallet.isLedger()
	}
	get isLocked () {
		return this.svcWallet.isLocked()
	}
	get ledgerStatus () {
		return this.svcWallet.ledgerStatus
	}

	ngOnInit () {
		// Detect if a PoW is taking too long and alert
		this.svcPow.powAlert$.subscribe(async (shouldAlert) => {
			if (shouldAlert) {
				this.powAlert.set(true)
			} else {
				this.powAlert.set(false)
			}
		})
	}

	async lockWallet () {
		try {
			await this.svcWallet.lockWallet()
			this.svcNotifications.sendSuccess(this.svcTransloco.translate('accounts.wallet-locked'))
		} catch (err) {
			this.svcNotifications.sendError(`Unable to lock wallet`)
		}
	}

	async reloadLedger () {
		this.svcNotifications.sendInfo(`Checking Ledger Status...`, { identifier: 'ledger-status', length: 0 })
		try {
			await this.svcWallet.selectedWallet().config({ connection: 'hid' })
			await this.svcWallet.selectedWallet().unlock()
			this.svcNotifications.removeNotification('ledger-status')
			if (this.isLocked) {
				this.svcNotifications.sendError(`Ledger device locked. Unlock and try again.`)
			} else {
				this.svcNotifications.sendSuccess(`Successfully connected to Ledger device`)
			}
		} catch (err) {
			console.log(`Got error when loading ledger! `, err)
			this.svcNotifications.removeNotification('ledger-status')
			// this.notificationService.sendError(`Unable to load Ledger Device: ${err.message}`)
		}
	}

	async requestUnlock () {
		const isUnlocked = await this.svcWallet.requestUnlock()
		if (isUnlocked) {
			this.svcNotifications.sendSuccess(this.svcTransloco.translate('accounts.wallet-unlocked'))
		} else {
			this.svcNotifications.sendError(this.svcTransloco.translate('accounts.wrong-password'))
		}
	}

	cancelPow () {
		this.svcPow.cancelAllPow(true)
	}
}

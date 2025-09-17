import { Component, OnInit, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { LedgerService, NotificationsService, PowService, WalletService } from 'app/services'

@Component({
	selector: 'app-wallet-widget',
	templateUrl: './wallet-widget.component.html',
	styleUrls: ['./wallet-widget.component.css'],
	imports: [FormsModule, RouterLink, TranslocoPipe],
})
export class WalletWidgetComponent implements OnInit {
	private svcLedger = inject(LedgerService)
	private svcNotifications = inject(NotificationsService)
	private svcPow = inject(PowService)
	private svcTransloco = inject(TranslocoService)
	private svcWallet = inject(WalletService)

	isConfigured = computed(() => this.svcWallet.isConfigured)
	isLedger = computed(() => this.svcWallet.isLedger)
	isLocked = computed(() => this.svcWallet.isLocked)

	powAlert = false

	ngOnInit () {
		// Detect if a PoW is taking too long and alert
		this.svcPow.powAlert$.subscribe(async (shouldAlert) => {
			if (shouldAlert) {
				this.powAlert = true
			} else {
				this.powAlert = false
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
			await this.svcWallet.selectedWallet.config({ connection: undefined })
			this.svcNotifications.removeNotification('ledger-status')
			if (this.ledgerStatus === 'CONNECTED') {
				this.svcNotifications.sendSuccess(`Successfully connected to Ledger device`)
			} else if (this.ledgerStatus === 'LOCKED') {
				this.svcNotifications.sendError(`Ledger device locked. Unlock and try again.`)
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

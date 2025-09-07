import { Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { AppSettingsService, LedgerService, NotificationsService, PowService, WalletService } from 'app/services'

@Component({
	selector: 'app-wallet-widget',
	templateUrl: './wallet-widget.component.html',
	styleUrls: ['./wallet-widget.component.css'],
	imports: [FormsModule, RouterLink, TranslocoPipe],
})
export class WalletWidgetComponent implements OnInit {
	private notificationService = inject(NotificationsService)
	private powService = inject(PowService)
	private translocoService = inject(TranslocoService)

	ledgerService = inject(LedgerService)
	settings = inject(AppSettingsService)
	walletService = inject(WalletService)

	ledgerStatus = {
		status: 'not-connected',
		statusText: '',
	}
	powAlert = false

	ngOnInit() {
		this.ledgerService.ledgerStatus$.subscribe((ledgerStatus) => {
			this.ledgerStatus = ledgerStatus
		})

		// Detect if a PoW is taking too long and alert
		this.powService.powAlert$.subscribe(async (shouldAlert) => {
			if (shouldAlert) {
				this.powAlert = true
			} else {
				this.powAlert = false
			}
		})
	}

	async lockWallet() {
		const locked = await this.walletService.lockWallet()
		if (locked) {
			this.notificationService.sendSuccess(this.translocoService.translate('accounts.wallet-locked'))
		} else {
			this.notificationService.sendError(`Unable to lock wallet`)
		}
	}

	async reloadLedger() {
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

	async unlockWallet() {
		const isUnlocked = await this.walletService.requestUnlock()
		if (isUnlocked === false) {
			return
		}
	}

	cancelPow() {
		this.powService.cancelAllPow(true)
	}
}

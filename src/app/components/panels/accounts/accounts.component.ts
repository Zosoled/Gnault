import { CommonModule, UpperCasePipe } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import { NanoAccountIdComponent, NanoIdenticonComponent } from 'app/components/elements'
import { AmountSplitPipe, FiatPipe, RaiPipe } from 'app/pipes'
import {
	AppSettingsService,
	NotificationsService,
	RepresentativeService,
	WalletService
} from 'app/services'
import { Account } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import { Subject, timer } from 'rxjs'
import { debounce } from 'rxjs/operators'

@Component({
	selector: 'app-accounts',
	templateUrl: './accounts.component.html',
	styleUrls: ['./accounts.component.css'],
	imports: [
		AmountSplitPipe,
		ClipboardModule,
		CommonModule,
		FiatPipe,
		FormsModule,
		NanoAccountIdComponent,
		NanoIdenticonComponent,
		RaiPipe,
		RouterLink,
		TranslocoDirective,
		UpperCasePipe,
	],
})
export class AccountsComponent implements OnInit {
	private router = inject(Router)
	private svcAppSettings = inject(AppSettingsService)
	private svcNotifications = inject(NotificationsService)
	private svcRepresentative = inject(RepresentativeService)
	private svcTransloco = inject(TranslocoService)
	private svcWallet = inject(WalletService)

	accounts = this.svcWallet.accounts
	viewAdvanced = false
	newAccountIndex = null
	// When we change the accounts, redetect changable reps (Debounce by 5 seconds)
	accountsChanged$ = new Subject()
	reloadRepWarning$ = this.accountsChanged$.pipe(debounce(() => timer(5000)))

	get identiconsStyle () {
		return this.settings.identiconsStyle
	}
	get isBalanceUpdating () {
		return this.svcWallet.isBalanceUpdating
	}
	get isLedgerWallet () {
		return this.svcWallet.isLedger()
	}
	get settings () {
		return this.svcAppSettings.settings()
	}

	async ngOnInit () {
		this.reloadRepWarning$.subscribe((a) => {
			this.svcRepresentative.detectChangeableReps()
		})
		this.sortAccounts()
	}

	async createAccount () {
		if (this.svcWallet.isLocked()) {
			await this.svcWallet.requestUnlock()
			if (this.svcWallet.isLocked()) {
				return
			}
		}
		if (this.isLedgerWallet && this.svcWallet.isLocked()) {
			return this.svcNotifications.sendWarning(this.svcTransloco.translate('accounts.ledger-device-must-be-ready'))
		}
		if (this.svcWallet.accounts.length >= 20) {
			return this.svcNotifications.sendWarning(
				this.svcTransloco.translate('accounts.you-can-only-track-up-to-x-accounts-at-a-time', { accounts: 20 })
			)
		}
		// Advanced view, manual account index?
		let accountIndex: number = 0
		if (this.viewAdvanced && this.newAccountIndex != null) {
			const index = parseInt(this.newAccountIndex, 10)
			if (index < 0) {
				return this.svcNotifications.sendWarning(
					this.svcTransloco.translate('accounts.invalid-account-index-must-be-positive-number')
				)
			}
			const existingAccount = this.svcWallet.accounts.find((a) => a.index === index)
			if (existingAccount) {
				return this.svcNotifications.sendWarning(
					this.svcTransloco.translate('accounts.the-account-at-this-index-is-already-loaded')
				)
			}
			accountIndex = index
		}
		try {
			const newAccount = await this.svcWallet.addWalletAccount(accountIndex)
			await this.svcWallet.reloadBalances()
			this.svcNotifications.sendSuccess(
				this.svcTransloco.translate('accounts.successfully-created-new-account', { account: newAccount.address })
			)
			this.newAccountIndex = null
			this.accountsChanged$.next(newAccount.address)
		} catch (err) {
			this.svcNotifications.sendError(
				this.svcTransloco.translate('accounts.unable-to-add-new-account', { error: err.message })
			)
		}
	}

	sortAccounts () {
		// if (this.walletService.isLocked()) return this.notificationService.sendError(`Wallet is locked.`)
		// if (!this.walletService.isConfigured()) return this.notificationService.sendError(`Wallet is not configured`)
		// if (this.walletService.accounts.length <= 1) {
		// return this.notificationService.sendWarning(`You need at least 2 accounts to sort them`)
		// }
		if (this.svcWallet.isLocked() || !this.svcWallet.isConfigured() || this.svcWallet.accounts.length <= 1) {
			return
		}
		this.svcWallet.accounts = this.svcWallet.accounts.sort((a, b) => a.index - b.index)
		// this.accounts = this.walletService.accounts
		// Save new sorted accounts list
		this.svcWallet.saveWalletExport()
		// this.notificationService.sendSuccess(`Successfully sorted accounts by index!`)
	}

	navigateToAccount (account: Account) {
		if (account == null) {
			this.svcNotifications.sendError('Failed to navigate to account')
			this.router.navigate(['accounts/'])
		}

		// why only small screen sizes?
		if (window.innerWidth < 940) {
			this.svcWallet.selectedAccount.set(account)
			this.svcWallet.selectedAccount$.next(account)
			this.svcWallet.saveWalletExport()
		}
		this.router.navigate([`accounts/${account.address}`], { queryParams: { compact: 1 } })
	}

	copied () {
		this.svcNotifications.removeNotification('success-copied')
		this.svcNotifications.sendSuccess(this.svcTransloco.translate('general.successfully-copied-to-clipboard'), {
			identifier: 'success-copied',
		})
	}

	async deleteAccount (account) {
		if (this.svcWallet.isLocked()) {
			await this.svcWallet.requestUnlock()
			if (this.svcWallet.isLocked()) {
				return
			}
		}

		try {
			await this.svcWallet.removeWalletAccount(account.address)
			this.svcNotifications.sendSuccess(
				this.svcTransloco.translate('accounts.successfully-removed-account', { account: account.address })
			)
			this.accountsChanged$.next(account.address)
		} catch (err) {
			this.svcNotifications.sendError(
				this.svcTransloco.translate('accounts.unable-to-delete-account', { error: err.message })
			)
		}
	}

	async showLedgerAddress (account) {
		if (this.svcWallet.isLocked()) {
			return this.svcNotifications.sendWarning(this.svcTransloco.translate('accounts.ledger-device-must-be-ready'))
		}
		this.svcNotifications.sendInfo(
			this.svcTransloco.translate('accounts.confirming-account-address-on-ledger-device'),
			{ identifier: 'ledger-account', length: 0 }
		)
		try {
			await this.svcWallet.selectedWallet().account(account.index)
			this.svcNotifications.sendSuccess(this.svcTransloco.translate('accounts.account-address-confirmed-on-ledger'))
		} catch (err) {
			this.svcNotifications.sendError(
				this.svcTransloco.translate('accounts.account-address-denied-if-it-is-wrong-do-not-use-the-wallet')
			)
		}
		this.svcNotifications.removeNotification('ledger-account')
	}
}

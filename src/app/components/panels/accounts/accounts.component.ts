import { CommonModule, UpperCasePipe } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { NanoAccountIdComponent, NanoIdenticonComponent } from 'app/components/elements'
import { AmountSplitPipe, FiatPipe, RaiPipe } from 'app/pipes'
import {
	AppSettingsService,
	LedgerService,
	LedgerStatus,
	NotificationsService,
	RepresentativeService,
	WalletService,
} from 'app/services'
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
		TranslocoPipe,
		UpperCasePipe,
	],
})
export class AccountsComponent implements OnInit {
	private notificationService = inject(NotificationsService)
	private representatives = inject(RepresentativeService)
	private router = inject(Router)
	private ledger = inject(LedgerService)
	private translocoService = inject(TranslocoService)
	settings = inject(AppSettingsService)
	walletService = inject(WalletService)

	accounts = this.walletService.accounts
	isLedgerWallet = this.walletService.isLedger
	viewAdvanced = false
	newAccountIndex = null
	// When we change the accounts, redetect changable reps (Debounce by 5 seconds)
	accountsChanged$ = new Subject()
	reloadRepWarning$ = this.accountsChanged$.pipe(debounce(() => timer(5000)))

	async ngOnInit() {
		this.reloadRepWarning$.subscribe((a) => {
			this.representatives.detectChangeableReps()
		})
		this.sortAccounts()
	}

	async createAccount() {
		if (this.walletService.isLocked) {
			const wasUnlocked = await this.walletService.requestUnlock()

			if (wasUnlocked === false) {
				return
			}
		}

		if (this.isLedgerWallet && this.ledger.ledger.status !== LedgerStatus.READY) {
			return this.notificationService.sendWarning(
				this.translocoService.translate('accounts.ledger-device-must-be-ready')
			)
		}
		if (!this.walletService.isConfigured) {
			return this.notificationService.sendError(this.translocoService.translate('accounts.wallet-is-not-configured'))
		}
		if (this.walletService.accounts.length >= 20) {
			return this.notificationService.sendWarning(
				this.translocoService.translate('accounts.you-can-only-track-up-to-x-accounts-at-a-time', { accounts: 20 })
			)
		}
		// Advanced view, manual account index?
		let accountIndex = null
		if (this.viewAdvanced && this.newAccountIndex != null) {
			const index = parseInt(this.newAccountIndex, 10)
			if (index < 0) {
				return this.notificationService.sendWarning(
					this.translocoService.translate('accounts.invalid-account-index-must-be-positive-number')
				)
			}
			const existingAccount = this.walletService.accounts.find((a) => a.index === index)
			if (existingAccount) {
				return this.notificationService.sendWarning(
					this.translocoService.translate('accounts.the-account-at-this-index-is-already-loaded')
				)
			}
			accountIndex = index
		}
		try {
			const newAccount = await this.walletService.addWalletAccount(accountIndex)
			await this.walletService.reloadBalances()
			this.notificationService.sendSuccess(
				this.translocoService.translate('accounts.successfully-created-new-account', { account: newAccount.id })
			)
			this.newAccountIndex = null
			this.accountsChanged$.next(newAccount.id)
		} catch (err) {
			this.notificationService.sendError(
				this.translocoService.translate('accounts.unable-to-add-new-account', { error: err.message })
			)
		}
	}

	sortAccounts() {
		// if (this.walletService.isLocked()) return this.notificationService.sendError(`Wallet is locked.`)
		// if (!this.walletService.isConfigured()) return this.notificationService.sendError(`Wallet is not configured`)
		// if (this.walletService.accounts.length <= 1) {
		// return this.notificationService.sendWarning(`You need at least 2 accounts to sort them`)
		// }
		if (this.walletService.isLocked || !this.walletService.isConfigured || this.walletService.accounts.length <= 1) {
			return
		}
		this.walletService.accounts = this.walletService.accounts.sort((a, b) => a.index - b.index)
		// this.accounts = this.walletService.accounts
		// Save new sorted accounts list
		this.walletService.saveWalletExport()
		// this.notificationService.sendSuccess(`Successfully sorted accounts by index!`)
	}

	navigateToAccount(account) {
		const isSmallViewport = window.innerWidth < 940

		if (isSmallViewport === true) {
			this.walletService.selectedAccountAddress = account?.id ?? null
			this.walletService.selectedAccount = account
			this.walletService.selectedAccount$.next(account)
			this.walletService.saveWalletExport()
		}

		this.router.navigate([`accounts/${account.id}`], { queryParams: { compact: 1 } })
	}

	copied() {
		this.notificationService.removeNotification('success-copied')
		this.notificationService.sendSuccess(this.translocoService.translate('general.successfully-copied-to-clipboard'), {
			identifier: 'success-copied',
		})
	}

	async deleteAccount(account) {
		if (this.walletService.isLocked) {
			const wasUnlocked = await this.walletService.requestUnlock()

			if (wasUnlocked === false) {
				return
			}
		}

		try {
			await this.walletService.removeWalletAccount(account.id)
			this.notificationService.sendSuccess(
				this.translocoService.translate('accounts.successfully-removed-account', { account: account.id })
			)
			this.accountsChanged$.next(account.id)
		} catch (err) {
			this.notificationService.sendError(
				this.translocoService.translate('accounts.unable-to-delete-account', { error: err.message })
			)
		}
	}

	async showLedgerAddress(account) {
		if (this.ledger.ledger.status !== LedgerStatus.READY) {
			return this.notificationService.sendWarning(
				this.translocoService.translate('accounts.ledger-device-must-be-ready')
			)
		}
		this.notificationService.sendInfo(
			this.translocoService.translate('accounts.confirming-account-address-on-ledger-device'),
			{ identifier: 'ledger-account', length: 0 }
		)
		try {
			await this.ledger.getLedgerAccount(account.index, true)
			this.notificationService.sendSuccess(
				this.translocoService.translate('accounts.account-address-confirmed-on-ledger')
			)
		} catch (err) {
			this.notificationService.sendError(
				this.translocoService.translate('accounts.account-address-denied-if-it-is-wrong-do-not-use-the-wallet')
			)
		}
		this.notificationService.removeNotification('ledger-account')
	}
}

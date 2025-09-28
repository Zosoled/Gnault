import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, effect, inject } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { TranslocoService } from '@jsverse/transloco'
import { NanoAccountIdComponent, NanoIdenticonComponent } from 'app/components/elements'
import { AmountSplitPipe, CurrencySymbolPipe, FiatPipe, RaiPipe, SqueezePipe } from 'app/pipes'
import {
	AddressBookService,
	ApiService,
	AppSettingsService,
	NanoBlockService,
	NotificationsService,
	PriceService,
	QrModalService,
	UtilService,
	WalletService,
	WorkPoolService
} from 'app/services'
import { environment } from 'environments/environment'
import { Tools } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import { BehaviorSubject } from 'rxjs'

@Component({
	selector: 'app-send',
	templateUrl: './send.component.html',
	styleUrls: ['./send.component.css'],
	imports: [
		AmountSplitPipe,
		ClipboardModule,
		CommonModule,
		CurrencySymbolPipe,
		FiatPipe,
		FormsModule,
		NanoAccountIdComponent,
		NanoIdenticonComponent,
		RaiPipe,
		ReactiveFormsModule,
		RouterLink,
		SqueezePipe,
	],
})
export class SendComponent implements AfterViewInit {
	private route = inject(ActivatedRoute)
	private svcAddressBook = inject(AddressBookService)
	private svcApi = inject(ApiService)
	private svcAppSettings = inject(AppSettingsService)
	private svcNanoBlock = inject(NanoBlockService)
	private svcNotifications = inject(NotificationsService)
	private svcPrice = inject(PriceService)
	private svcQrModal = inject(QrModalService)
	private svcTransloco = inject(TranslocoService)
	private svcUtil = inject(UtilService)
	private svcWallet = inject(WalletService)
	private svcWorkPool = inject(WorkPoolService)

	activePanel = 'send'
	addressBookMatch = ''
	addressBookResults$ = new BehaviorSubject([])
	amounts = {
		fiat: new FormControl<number>(null, { nonNullable: false, validators: Validators.pattern('\d*\.?\d*') }),
		nano: new FormControl<number>(null, { nonNullable: false, validators: Validators.pattern('\d*\.?\d*') }),
		raw: new FormControl<bigint>(null, { nonNullable: false, validators: Validators.pattern('\d*') }),
	}
	sendDestinationType = 'external-address'
	showAddressBook = false

	get accounts () {
		return this.svcWallet.accounts
	}
	get amount () {
		return this.amounts.raw.value
	}
	get displayCurrency () {
		return this.svcAppSettings.settings.displayCurrency.toUpperCase()
	}
	get identiconsStyle () {
		return this.svcAppSettings.settings.identiconsStyle
	}
	get lastPrice () {
		return this.svcPrice.lastPrice()
	}

	fromAccount: any = {}
	fromAddress: any = ''
	fromAddressBook = ''
	toAccount: any = false
	toAddress = ''
	toOwnAddress: any = ''
	toAddressBook = ''
	toAccountStatus = null
	preparingTransaction = false
	confirmingTransaction = false

	// Update selected account if changed in the sidebar
	selectAccount = effect(() => {
		if (this.activePanel === 'send') {
			const selectedAccount = this.svcWallet.selectedAccount()
			if (selectedAccount) {
				this.fromAddress = selectedAccount.address
			} else {
				this.findFirstAccount()
			}
		}
	})

	async ngAfterViewInit () {
		const params = this.route.snapshot.queryParams
		this.updateQueries(params)
		this.svcAddressBook.loadAddressBook()

		// Set default From account
		this.fromAddress = this.accounts[0]?.address ?? ''


		// Update the account if query params changes. For example donation button while active on this page
		this.route.queryParams.subscribe((queries) => {
			this.updateQueries(queries)
		})

		// Set the account selected in the sidebar as default
		if (this.svcWallet.selectedAccount() !== null) {
			this.fromAddress = this.svcWallet.selectedAccount().address
		} else {
			// If "total balance" is selected in the sidebar, use the first account in the wallet that has a balance
			this.findFirstAccount()
		}
	}

	updateQueries (params) {
		if (params && params.amount && !isNaN(params.amount)) {
			this.amounts.raw.setValue(Tools.convert(params.amount, 'raw', 'raw', 'bigint'))
			this.syncTo('raw')
		}

		if (params && params.to) {
			this.toAddress = params.to
			this.validateDestination()
			this.sendDestinationType = 'external-address'
		}
	}

	async findFirstAccount () {
		// Load balances before we try to find the right account
		if (this.svcWallet.balance === 0n) {
			await this.svcWallet.reloadBalances()
		}

		// Look for the first account that has a balance
		const addressWithBalance = this.accounts.reduce((previous, current) => {
			if (previous) return previous
			if (current.balance > 0n) return current.id
			return null
		}, null)

		if (addressWithBalance) {
			this.fromAddress = addressWithBalance
		}
	}

	/**
	 * When value of one unit is changed, sync the other two units of measure.
	 * @param {('fiat' | 'nano' | 'raw')} unit
	 */
	async syncTo (unit: 'fiat' | 'nano' | 'raw'): Promise<void> {
		console.log('syncPrices()')
		console.log(`lastPrice: ${this.lastPrice}`)
		console.log(`fiat: ${this.amounts.fiat.value}`)
		console.log(`nano: ${this.amounts.nano.value}`)
		console.log(`raw: ${this.amounts.raw.value}`)
		try {
			switch (unit) {
				case 'fiat': {
					const fiat = this.amounts.fiat.value
					this.amounts.nano.setValue(fiat ? fiat / this.lastPrice : null)
					this.amounts.raw.setValue(fiat ? Tools.convert(fiat / this.lastPrice, 'nano', 'raw', 'bigint') : null)
					return
				}
				case 'nano': {
					const nano = this.amounts.nano.value
					this.amounts.fiat.setValue(nano ? nano * this.lastPrice : null)
					this.amounts.raw.setValue(nano ? Tools.convert(nano, 'nano', 'raw', 'bigint') : null)
					return
				}
				case 'raw': {
					const raw = this.amounts.raw.value
					this.amounts.nano.setValue(raw ? Tools.convert(raw, 'raw', 'nano', 'number') : null)
					this.amounts.fiat.setValue(raw ? Tools.convert(raw, 'raw', 'nano', 'number') * this.lastPrice : null)
					return
				}
			}
		} catch (err) {
			this.svcNotifications.sendError(err?.message ?? err)
		}
	}

	async onDestinationAddressInput () {
		this.addressBookMatch = ''
		this.searchAddressBook()
		const destinationAddress = this.toAddress || ''
		const nanoURIScheme = /^nano:.+$/g
		const isNanoURI = nanoURIScheme.test(destinationAddress)
		if (isNanoURI === true) {
			const url = new URL(destinationAddress)
			if (this.svcUtil.account.isValidAccount(url.pathname)) {
				const amountAsRaw = url.searchParams.get('amount')
				const amountAsXNO = amountAsRaw ? await Tools.convert(amountAsRaw, 'raw', 'nano').toString() : null
				setTimeout(() => {
					this.updateQueries({
						to: url.pathname,
						amount: amountAsXNO,
					})
				}, 10)
			}
		}
	}

	searchAddressBook () {
		this.showAddressBook = true
		const search = this.toAddress || ''
		const addressBook = this.svcAddressBook.addressBook
		const matches = addressBook.filter((a) => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1).slice(0, 5)
		this.addressBookResults$.next(matches)
	}

	selectBookEntry (account) {
		this.showAddressBook = false
		this.toAddress = account
		this.searchAddressBook()
		this.validateDestination()
	}

	setSendDestinationType (newType: string) {
		this.sendDestinationType = newType
	}

	async validateDestination () {
		// The timeout is used to solve a bug where the results get hidden too fast and the click is never registered
		setTimeout(() => (this.showAddressBook = false), 400)

		// Remove spaces from the account id
		this.toAddress = this.toAddress.replace(/ /g, '')
		this.addressBookMatch =
			this.svcAddressBook.getAccountName(this.toAddress) || this.getAccountLabel(this.toAddress, null)
		if (!this.addressBookMatch && this.toAddress === environment.donationAddress) {
			this.addressBookMatch = 'Gnault Donations'
		}

		// const accountInfo = await this.walletService.walletApi.accountInfo(this.toAddress)
		this.toAccountStatus = null
		if (this.svcUtil.account.isValidAccount(this.toAddress)) {
			const accountInfo = await this.svcApi.accountInfo(this.toAddress)
			if (accountInfo?.error === 'Account not found') {
				this.toAccountStatus = 1
			}
			if (accountInfo?.frontier) {
				this.toAccountStatus = 2
			}
		} else {
			this.toAccountStatus = 0
		}
	}

	getAccountLabel (address, defaultLabel) {
		const walletAccount = this.svcWallet.accounts.find((a) => a.address === address)
		if (walletAccount == null) {
			return defaultLabel
		}
		return this.svcTransloco.translate('general.account') + ' #' + walletAccount.index
	}

	getDestinationAddress () {
		if (this.sendDestinationType === 'external-address') {
			return this.toAddress
		}
		// 'own-address'
		const walletAccount = this.svcWallet.accounts.find((a) => a.address === this.toOwnAddress)
		if (!walletAccount) {
			// Unable to find receiving account in wallet
			return ''
		}
		if (this.toOwnAddress === this.fromAddress) {
			// Sending to the same address is only allowed via 'external-address'
			return ''
		}
		return this.toOwnAddress
	}

	async sendTransaction () {
		try {
			const destinationAddress = this.getDestinationAddress()
			const isValid = this.svcUtil.account.isValidAccount(destinationAddress)
			if (!isValid) {
				return this.svcNotifications.sendWarning(`To account address is not valid`)
			}
			if (!this.fromAddress || !destinationAddress) {
				return this.svcNotifications.sendWarning(`From and to account are required`)
			}
			if (!['bigint', 'number', 'string'].includes(typeof this.amounts.raw.value)) {
				return this.svcNotifications.sendWarning(`Invalid amount ${typeof this.amounts.raw.value}`)
			}
			const amount = BigInt(this.amounts.raw.value)
			if (amount <= 0n) {
				return this.svcNotifications.sendWarning('Amount must be greater than zero')
			}
			this.preparingTransaction = true

			const from = await this.svcApi.accountInfo(this.fromAddress)
			const to = await this.svcApi.accountInfo(destinationAddress)

			this.preparingTransaction = false

			if (!from) {
				return this.svcNotifications.sendError(`From account not found`)
			}

			const bigBalanceFrom = BigInt(from.balance ?? 0n)
			const bigBalanceTo = BigInt(to.balance ?? 0n)

			this.fromAccount = from
			this.toAccount = to

			if (bigBalanceFrom - amount < 0n) {
				return this.svcNotifications.sendError(`From account does not have enough XNO`)
			}
			this.fromAddressBook =
				this.svcAddressBook.getAccountName(this.fromAddress) || this.getAccountLabel(this.fromAddress, 'Account')
			this.toAddressBook =
				this.svcAddressBook.getAccountName(destinationAddress) || this.getAccountLabel(destinationAddress, null)

			// Start precomputing the work...
			this.svcWorkPool.addWorkToCache(this.fromAccount.frontier, 1)
			this.activePanel = 'confirm'
		} catch (err) {
			this.svcNotifications.sendError(err?.message ?? err)
		}
	}

	async confirmTransaction () {
		const wallet = this.svcWallet.selectedWallet()
		const walletAccount = this.svcWallet.accounts.find((a) => a.address === this.fromAddress)
		if (!walletAccount) {
			throw new Error(`Unable to find sending account in wallet`)
		}
		if (this.svcWallet.isLocked()) {
			const wasUnlocked = await this.svcWallet.requestUnlock()
			if (wasUnlocked === false) {
				return
			}
		}
		this.confirmingTransaction = true
		try {
			const destinationAddress = this.getDestinationAddress()
			const newHash = await this.svcNanoBlock.generateSend(
				wallet,
				walletAccount,
				destinationAddress,
				this.amounts.raw.value,
				this.svcWallet.isLedger()
			)
			if (newHash) {
				this.svcNotifications.removeNotification('success-send')
				this.svcNotifications.sendSuccess(`Successfully sent XNO ${this.amounts.nano}!`, {
					identifier: 'success-send',
				})
				this.activePanel = 'send'
				this.amounts.raw.setValue(0n)
				this.toAddress = ''
				this.toOwnAddress = ''
				this.toAccountStatus = null
				this.fromAddressBook = ''
				this.toAddressBook = ''
				this.addressBookMatch = ''
			} else if (!this.svcWallet.isLedger()) {
				this.svcNotifications.sendError(`There was an error sending your transaction. Please try again.`)
			}
		} catch (err) {
			this.svcNotifications.sendError(err?.message ?? err)
		}
		this.confirmingTransaction = false
	}

	async setMaxAmount () {
		const walletAccount = this.svcWallet.accounts.find((a) => a.address === this.fromAddress)
		if (walletAccount) {
			this.amounts.raw.setValue(walletAccount.balance)
			this.syncTo('raw')
		}
	}

	resetAmount () {
		this.amounts.fiat.setValue(0)
		this.amounts.nano.setValue(0)
		this.amounts.raw.setValue(0n)
	}

	// open qr reader modal
	openQR (reference, type) {
		if (!this.preparingTransaction) {
			const qrResult = this.svcQrModal.openQR(reference, type)
			qrResult.then((data) => {
				if (data.reference === 'account1') {
					this.toAddress = data.content
					this.validateDestination()
				}
			})
		}
	}

	copied () {
		this.svcNotifications.removeNotification('success-copied')
		this.svcNotifications.sendSuccess('Copied to clipboard', { identifier: 'success-copied' })
	}
}

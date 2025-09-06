import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { TranslocoService } from '@jsverse/transloco'
import { Tools } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import { BehaviorSubject } from 'rxjs'
import { NanoAccountIdComponent, NanoIdenticonComponent } from 'app/components/elements'
import {
	AmountSplitPipe,
	CurrencySymbolPipe,
	FiatPipe,
	RaiPipe,
	SqueezePipe
} from 'app/pipes'
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
		RouterLink,
		SqueezePipe
	]
})

export class SendComponent implements OnInit {
	private route = inject(ActivatedRoute)
	private walletService = inject(WalletService)
	private addressBookService = inject(AddressBookService)
	private notificationService = inject(NotificationsService)
	private nodeApi = inject(ApiService)
	private nanoBlock = inject(NanoBlockService)
	price = inject(PriceService)
	private workPool = inject(WorkPoolService)
	settings = inject(AppSettingsService)
	private util = inject(UtilService)
	private qrModalService = inject(QrModalService)
	private http = inject(HttpClient)
	private translocoService = inject(TranslocoService)

	activePanel = 'send'
	sendDestinationType = 'external-address'
	accounts = this.walletService.accounts
	addressBookResults$ = new BehaviorSubject([])
	showAddressBook = false
	addressBookMatch = ''

	amount: bigint = 0n
	get amountFiat (): number { return this.amountNano * this.price.price.lastPrice }
	get amountNano (): number { return parseFloat(Tools.convert(this.amount, 'raw', 'nano')) }

	fromAccount: any = {}
	fromAccountID: any = ''
	fromAddressBook = ''
	toAccount: any = false
	toAccountID = ''
	toOwnAccountID: any = ''
	toAddressBook = ''
	toAccountStatus = null
	amountStatus = null
	preparingTransaction = false
	confirmingTransaction = false
	selAccountInit = false

	async ngOnInit () {
		const params = this.route.snapshot.queryParams
		this.updateQueries(params)
		this.addressBookService.loadAddressBook()

		// Set default From account
		this.fromAccountID = this.accounts[0]?.id ?? ''

		// Update selected account if changed in the sidebar
		this.walletService.selectedAccount$.subscribe(async acc => {
			if (this.activePanel !== 'send') {
				// Transaction details already finalized
				return
			}

			if (this.selAccountInit) {
				if (acc) {
					this.fromAccountID = acc.id
				} else {
					this.findFirstAccount()
				}
			}
			this.selAccountInit = true
		})

		// Update the account if query params changes. For example donation button while active on this page
		this.route.queryParams.subscribe(queries => {
			this.updateQueries(queries)
		})

		// Set the account selected in the sidebar as default
		if (this.walletService.selectedAccount !== null) {
			this.fromAccountID = this.walletService.selectedAccount.id
		} else {
			// If "total balance" is selected in the sidebar, use the first account in the wallet that has a balance
			this.findFirstAccount()
		}
	}

	updateQueries (params) {
		if (params && params.amount && !isNaN(params.amount)) {
			this.amount = BigInt(Tools.convert(params.amount, 'nano', 'raw'))
			this.syncFiatPrice()
		}

		if (params && params.to) {
			this.toAccountID = params.to
			this.validateDestination()
			this.sendDestinationType = 'external-address'
		}
	}

	async findFirstAccount () {
		// Load balances before we try to find the right account
		if (this.walletService.balance === 0n) {
			await this.walletService.reloadBalances()
		}

		// Look for the first account that has a balance
		const accountIDWithBalance = this.accounts.reduce((previous, current) => {
			if (previous) return previous
			if (current.balance > 0n) return current.id
			return null
		}, null)

		if (accountIDWithBalance) {
			this.fromAccountID = accountIDWithBalance
		}
	}

	// An update to the Nano amount, sync the fiat value
	async syncFiatPrice () {
		console.log(`syncFiatPrice()`)
		console.log(`this.amountFiat: ${this.amount}`)
		console.log(`this.price.price.lastPrice: ${this.price.price.lastPrice}`)
		if (!this.validateAmount() || Number(this.amount) === 0) {
			return
		}
		console.log(`sendTransaction() this.amount: ${this.amount}`)
		console.log(typeof this.amount)
		const rawAmount = BigInt(await Tools.convert(this.amount, 'nano', 'raw')) + this.amount
		if (rawAmount < 0n) {
			return
		}
	}

	// An update to the fiat amount, sync the nano value based on currently selected denomination
	async syncNanoPrice () {
		console.log(`syncNanoPrice()`)
		console.log(`this.amountFiat: ${this.amountFiat}`)
		console.log(`this.price.price.lastPrice: ${this.price.price.lastPrice}`)
		if (!this.amountFiat) {
			this.amount = 0n
			return
		}
		if (!this.util.string.isNumeric(this.amountFiat)) return
		const fx = this.amountFiat / this.price.price.lastPrice
		const raw = await Tools.convert(fx, 'nano', 'raw')
		this.amount = BigInt(raw)
	}

	async onDestinationAddressInput () {
		this.addressBookMatch = ''
		this.searchAddressBook()
		const destinationAddress = this.toAccountID || ''
		const nanoURIScheme = /^nano:.+$/g
		const isNanoURI = nanoURIScheme.test(destinationAddress)
		if (isNanoURI === true) {
			const url = new URL(destinationAddress)
			if (this.util.account.isValidAccount(url.pathname)) {
				const amountAsRaw = url.searchParams.get('amount')
				const amountAsXNO = amountAsRaw
					? await Tools.convert(amountAsRaw, 'raw', 'nano').toString()
					: null
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
		const search = this.toAccountID || ''
		const addressBook = this.addressBookService.addressBook
		const matches = addressBook
			.filter(a => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
			.slice(0, 5)
		this.addressBookResults$.next(matches)
	}

	selectBookEntry (account) {
		this.showAddressBook = false
		this.toAccountID = account
		this.searchAddressBook()
		this.validateDestination()
	}

	setSendDestinationType (newType: string) {
		this.sendDestinationType = newType
	}

	async validateDestination () {
		// The timeout is used to solve a bug where the results get hidden too fast and the click is never registered
		setTimeout(() => this.showAddressBook = false, 400)

		// Remove spaces from the account id
		this.toAccountID = this.toAccountID.replace(/ /g, '')
		this.addressBookMatch = (
			this.addressBookService.getAccountName(this.toAccountID)
			|| this.getAccountLabel(this.toAccountID, null)
		)
		if (!this.addressBookMatch && this.toAccountID === environment.donationAddress) {
			this.addressBookMatch = 'Gnault Donations'
		}

		// const accountInfo = await this.walletService.walletApi.accountInfo(this.toAccountID)
		this.toAccountStatus = null
		if (this.util.account.isValidAccount(this.toAccountID)) {
			const accountInfo = await this.nodeApi.accountInfo(this.toAccountID)
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

	getAccountLabel (accountID, defaultLabel) {
		const walletAccount = this.walletService.accounts.find(a => a.id === accountID)
		if (walletAccount == null) {
			return defaultLabel
		}
		return (this.translocoService.translate('general.account') + ' #' + walletAccount.index)
	}

	validateAmount () {
		if (this.amount > 0n) {
			this.amountStatus = 1
			return true
		} else {
			this.amountStatus = 0
			return false
		}
	}

	getDestinationID () {
		if (this.sendDestinationType === 'external-address') {
			return this.toAccountID
		}
		// 'own-address'
		const walletAccount = this.walletService.accounts.find(a => a.id === this.toOwnAccountID)
		if (!walletAccount) {
			// Unable to find receiving account in wallet
			return ''
		}
		if (this.toOwnAccountID === this.fromAccountID) {
			// Sending to the same address is only allowed via 'external-address'
			return ''
		}
		return this.toOwnAccountID
	}

	async sendTransaction () {
		const destinationID = this.getDestinationID()
		const isValid = this.util.account.isValidAccount(destinationID)
		if (!isValid) {
			return this.notificationService.sendWarning(`To account address is not valid`)
		}
		if (!this.fromAccountID || !destinationID) {
			return this.notificationService.sendWarning(`From and to account are required`)
		}
		if (!this.validateAmount()) {
			return this.notificationService.sendWarning(`Invalid XNO amount`)
		}
		this.preparingTransaction = true

		const from = await this.nodeApi.accountInfo(this.fromAccountID)
		const to = await this.nodeApi.accountInfo(destinationID)

		this.preparingTransaction = false

		if (!from) {
			return this.notificationService.sendError(`From account not found`)
		}

		const bigBalanceFrom = BigInt(from.balance ?? 0n)
		const bigBalanceTo = BigInt(to.balance ?? 0n)

		this.fromAccount = from
		this.toAccount = to

		if (this.amount < 0) {
			return this.notificationService.sendWarning(`Amount is invalid`)
		}
		if (bigBalanceFrom - this.amount < 0n) {
			return this.notificationService.sendError(`From account does not have enough XNO`)
		}
		this.fromAddressBook = (
			this.addressBookService.getAccountName(this.fromAccountID)
			|| this.getAccountLabel(this.fromAccountID, 'Account')
		)
		this.toAddressBook = (
			this.addressBookService.getAccountName(destinationID)
			|| this.getAccountLabel(destinationID, null)
		)

		// Start precomputing the work...
		this.workPool.addWorkToCache(this.fromAccount.frontier, 1)
		this.activePanel = 'confirm'
	}

	async confirmTransaction () {
		const wallet = this.walletService.wallet
		const walletAccount = this.walletService.accounts.find(a => a.id === this.fromAccountID)
		if (!walletAccount) {
			throw new Error(`Unable to find sending account in wallet`)
		}
		if (this.walletService.isLocked) {
			const wasUnlocked = await this.walletService.requestUnlock()
			if (wasUnlocked === false) {
				return
			}
		}
		this.confirmingTransaction = true
		try {
			const destinationID = this.getDestinationID()
			const newHash = await this.nanoBlock.generateSend(wallet, walletAccount, destinationID,
				this.amount, this.walletService.isLedger)
			if (newHash) {
				this.notificationService.removeNotification('success-send')
				this.notificationService.sendSuccess(`Successfully sent ${this.amountNano} XNO!`, { identifier: 'success-send' })
				this.activePanel = 'send'
				this.amount = 0n
				this.toAccountID = ''
				this.toOwnAccountID = ''
				this.toAccountStatus = null
				this.fromAddressBook = ''
				this.toAddressBook = ''
				this.addressBookMatch = ''
			} else if (!this.walletService.isLedger) {
				this.notificationService.sendError(`There was an error sending your transaction, please try again.`)
			}
		} catch (err) {
			this.notificationService.sendError(`There was an error sending your transaction: ${err.message}`)
		}
		this.confirmingTransaction = false
	}

	async setMaxAmount () {
		const walletAccount = this.walletService.accounts
			.find(a => a.id === this.fromAccountID)
		if (!walletAccount) {
			return
		}
		this.amount = walletAccount.balance
		this.syncFiatPrice()
	}

	resetAmount () {
		this.amount = 0n
	}

	// open qr reader modal
	openQR (reference, type) {
		if (this.preparingTransaction) {
			return
		}
		const qrResult = this.qrModalService.openQR(reference, type)
		qrResult.then(data => {
			if (data.reference === 'account1') {
				this.toAccountID = data.content
				this.validateDestination()
			}
		})
	}

	copied () {
		this.notificationService.removeNotification('success-copied')
		this.notificationService.sendSuccess(`Successfully copied to clipboard!`, { identifier: 'success-copied' })
	}
}

import { CommonModule, DecimalPipe, formatDate } from '@angular/common'
import { Component, computed, inject, OnDestroy, OnInit, signal, Signal, WritableSignal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, ChildActivationEnd, NavigationEnd, Router, RouterLink } from '@angular/router'
import { translate, TranslocoPipe } from '@jsverse/transloco'
import { NanoAccountIdComponent, NanoIdenticonComponent, NanoTransactionMobileComponent } from 'app/components/elements'
import { AmountSplitPipe, CurrencySymbolPipe, FiatPipe, RaiPipe } from 'app/pipes'
import {
	AddressBookService,
	ApiService,
	AppSettingsService,
	NanoBlockService,
	NinjaService,
	NotificationsService,
	PriceService,
	QrModalService,
	RepresentativeService,
	UtilService,
	WalletService,
} from 'app/services'
import { Account, Block, Tools } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import * as QRCode from 'qrcode'
import { BehaviorSubject } from 'rxjs'

@Component({
	selector: 'app-account-details',
	templateUrl: './account-details.component.html',
	styleUrls: ['./account-details.component.css'],
	imports: [
		AmountSplitPipe,
		ClipboardModule,
		CommonModule,
		CurrencySymbolPipe,
		DecimalPipe,
		FiatPipe,
		FormsModule,
		NanoAccountIdComponent,
		NanoIdenticonComponent,
		NanoTransactionMobileComponent,
		RaiPipe,
		RouterLink,
		TranslocoPipe,
	],
})
export class AccountDetailsComponent implements OnInit, OnDestroy {
	private activatedRoute = inject(ActivatedRoute)
	private router = inject(Router)
	private svcAddressBook = inject(AddressBookService)
	private svcApi = inject(ApiService)
	private svcNanoBlock = inject(NanoBlockService)
	private svcNinja = inject(NinjaService)
	private svcNotifications = inject(NotificationsService)
	private svcRepresentative = inject(RepresentativeService)
	private svcQrModal = inject(QrModalService)

	svcAppSettings = inject(AppSettingsService)
	svcPrice = inject(PriceService)
	svcUtil = inject(UtilService)
	svcWallet = inject(WalletService)

	zeroHash = '0000000000000000000000000000000000000000000000000000000000000000'

	accountHistory: any[] = []
	receivableBlocks = []
	pageSize = 25
	maxPageSize = 200

	repLabel: any = ''
	repVotingWeight: any = ''
	repDonationAddress: any = ''

	addressBookEntry: any = null
	account: WritableSignal<Account> = signal(null)
	address: string

	walletAccount = null

	timeoutIdAllowingManualRefresh: any = null
	timeoutIdAllowingInstantAutoRefresh: any = null
	timeoutIdQueuedAutoRefresh: any = null
	qrModal: any = null
	mobileAccountMenuModal: any = null
	mobileTransactionMenuModal: any = null
	mobileTransactionData: any = null

	showFullDetailsOnSmallViewports = false
	loadingAccountDetails = false
	loadingIncomingTxList = false
	loadingTxList = false
	showAdvancedOptions = false
	showEditAddressBook = false
	addressBookModel = ''
	representativeModel = ''
	representativeResults$ = new BehaviorSubject([])
	showRepresentatives = false
	representativeListMatch = ''
	isNaN = isNaN

	qrCodeImage = null

	routerSub = null
	priceSub = null
	lastPrice = null

	initialLoadDone = false
	manualRefreshAllowed = true
	instantAutoRefreshAllowed = true
	shouldQueueAutoRefresh = false
	autoRefreshReasonBlockUpdate = null
	dateStringToday = ''
	dateStringYesterday = ''

	// Remote signing
	addressBookResults$ = new BehaviorSubject([])
	showAddressBook = false
	addressBookMatch = ''

	amount = null
	amountRaw: bigint = 0n
	amountFiat: number | null = null
	rawAmount: bigint = 0n
	fromAccount: any = {}
	toAccount: any = false
	toAccountID = ''
	toAddressBook = ''
	toAccountStatus = null
	amountStatus = null
	repStatus = null
	qrString = null
	qrCodeImageBlock = null
	qrCodeImageBlockReceive = null
	blockHash = null
	blockHashReceive = null
	remoteVisible = false
	blockTypes: string[] = ['Send Nano', 'Change Representative']
	blockTypeSelected: string = this.blockTypes[0]
	representativeList = []
	representativesOverview = []
	// End remote signing

	get isBalanceUpdating () {
		return this.svcWallet.isBalanceUpdating
	}
	get isConfigured () {
		return this.svcWallet.isConfigured()
	}

	accountColor: Signal<number> = computed((): number => {
		const account = this.account()
		const pk = BigInt(`0x${account?.publicKey ?? 0}`)
		const mod = pk % 360n
		return Number(mod)
	})

	constructor () {
		const route = this.router
		// to detect when the account changes if the view is already active
		route.events.subscribe((val) => {
			if (val instanceof NavigationEnd) {
				this.clearRemoteVars() // reset the modal content for remote signing
			}
		})
	}

	async ngOnInit () {
		const params = this.activatedRoute.snapshot.queryParams
		if ('sign' in params) {
			this.remoteVisible = params.sign === '1'
			this.showAdvancedOptions = params.sign === '1'
		}

		this.showFullDetailsOnSmallViewports = params.compact !== '1'

		this.routerSub = this.router.events.subscribe((event) => {
			if (event instanceof ChildActivationEnd) {
				this.loadAccountDetails() // Reload the state when navigating to itself from the transactions page
				this.showFullDetailsOnSmallViewports = this.activatedRoute.snapshot.queryParams.compact !== '1'
				this.mobileTransactionMenuModal.hide()
			}
		})
		this.priceSub = this.svcPrice.lastPrice$.subscribe((event) => {
			this.lastPrice = this.svcPrice.lastPrice
		})

		this.svcWallet.isReceivableBlocksUpdated$.subscribe(async (receivableBlockUpdate) => {
			this.onReceivableBlockUpdate(receivableBlockUpdate)
		})

		const UIkit = window['UIkit']
		const qrModal = UIkit.modal('#qr-code-modal')
		this.qrModal = qrModal

		const mobileAccountMenuModal = UIkit.modal('#mobile-account-menu-modal')
		this.mobileAccountMenuModal = mobileAccountMenuModal

		const mobileTransactionMenuModal = UIkit.modal('#mobile-transaction-menu-modal')
		this.mobileTransactionMenuModal = mobileTransactionMenuModal

		await this.loadAccountDetails()
		this.initialLoadDone = true
		this.svcAddressBook.loadAddressBook()

		this.populateRepresentativeList()

		this.svcRepresentative.walletReps$.subscribe(async (reps) => {
			if (reps[0] === null) {
				// initial state from new BehaviorSubject([null])
				return
			}

			this.representativesOverview = reps
			this.updateRepresentativeInfo()
		})
	}

	async populateRepresentativeList () {
		// add trusted/regular local reps to the list
		const localReps = this.svcRepresentative.getSortedRepresentatives()
		this.representativeList.push(...localReps.filter((rep) => !rep.warn))

		if (this.svcAppSettings.settings.serverAPI) {
			const verifiedReps = await this.svcNinja.recommendedRandomized()

			// add random recommended reps to the list
			for (const representative of verifiedReps) {
				const temprep = {
					id: representative.account,
					name: representative.alias,
				}

				this.representativeList.push(temprep)
			}
		}

		// add untrusted local reps to the list
		this.representativeList.push(...localReps.filter((rep) => rep.warn))
	}

	clearAccountVars () {
		this.accountHistory = []
		this.receivableBlocks = []
		this.address = ''
		this.addressBookEntry = null
		this.addressBookModel = ''
		this.showEditAddressBook = false
		this.walletAccount = null
		this.account.set(null)
		this.qrCodeImage = null
	}

	clearRemoteVars () {
		this.amount = null
		this.amountRaw = 0n
		this.amountFiat = null
		this.rawAmount = 0n
		this.fromAccount = {}
		this.toAccount = false
		this.toAccountID = ''
		this.toAddressBook = ''
		this.toAccountStatus = null
		this.repStatus = null
		this.qrString = null
		this.qrCodeImageBlock = null
		this.qrCodeImageBlockReceive = null
		this.blockHash = null
		this.blockHashReceive = null
		this.blockTypeSelected = this.blockTypes[0]
		this.representativeModel = ''
		this.representativeListMatch = ''
	}

	updateRepresentativeInfo () {
		if (this.account()) {
			const representativeFromOverview = this.representativesOverview.find(
				(rep) => rep.account === this.account().representative
			)
			if (representativeFromOverview != null) {
				this.repLabel = representativeFromOverview.label
				this.repVotingWeight = representativeFromOverview.percent
				this.repDonationAddress = representativeFromOverview.donationAddress
				return
			}
			this.repVotingWeight = 0n
			this.repDonationAddress = null
			const knownRepresentative = this.svcRepresentative.getRepresentative(this.account().representative)
			if (knownRepresentative != null) {
				this.repLabel = knownRepresentative.name
				return
			}
			this.repLabel = null
		}
	}

	onRefreshButtonClick () {
		if (!this.manualRefreshAllowed) return
		this.loadAccountDetails()
	}

	isReceivableBlockUpdateRelevant (receivableBlockUpdate) {
		if (receivableBlockUpdate.account !== this.address) {
			return false
		}

		const sourceHashToFind = receivableBlockUpdate.sourceHash

		const alreadyInReceivableBlocks = this.receivableBlocks.some((knownReceivableBlock) => {
			knownReceivableBlock.hash === sourceHashToFind
		})

		if (receivableBlockUpdate.hasBeenReceived) {
			const destinationHashToFind = receivableBlockUpdate.destinationHash

			const alreadyInAccountHistory = this.accountHistory.some((knownAccountHistoryBlock) => {
				knownAccountHistoryBlock.hash === destinationHashToFind
			})

			if (alreadyInAccountHistory && !alreadyInReceivableBlocks) {
				return false
			}
		} else if (alreadyInReceivableBlocks) {
			return false
		}

		return true
	}

	onReceivableBlockUpdate (receivableBlockUpdate) {
		if (receivableBlockUpdate === null) {
			return
		}

		const isRelevantUpdate = this.isReceivableBlockUpdateRelevant(receivableBlockUpdate)

		if (isRelevantUpdate === false) {
			return
		}

		this.loadAccountDetailsThrottled({ receivableBlockUpdate })
	}

	loadAccountDetailsThrottled (params) {
		this.autoRefreshReasonBlockUpdate = params.receivableBlockUpdate != null ? params.receivableBlockUpdate : null

		if (!this.initialLoadDone) {
			return
		}

		if (this.instantAutoRefreshAllowed) {
			this.loadAccountDetails()
			return
		}

		if (this.loadingAccountDetails) {
			// Queue refresh once the loading is done
			this.shouldQueueAutoRefresh = true
		} else {
			// Queue refresh now
			this.loadAccountDetailsDelayed(3000)
		}
	}

	enableManualRefreshDelayed (delayMS) {
		if (this.timeoutIdAllowingManualRefresh != null) {
			clearTimeout(this.timeoutIdAllowingManualRefresh)
		}

		this.timeoutIdAllowingManualRefresh = setTimeout(() => {
			this.manualRefreshAllowed = true
		}, delayMS)
	}

	enableInstantAutoRefreshDelayed (delayMS) {
		if (this.timeoutIdAllowingInstantAutoRefresh != null) {
			clearTimeout(this.timeoutIdAllowingInstantAutoRefresh)
		}

		this.timeoutIdAllowingInstantAutoRefresh = setTimeout(() => {
			this.instantAutoRefreshAllowed = true
		}, delayMS)
	}

	loadAccountDetailsDelayed (delayMS) {
		if (this.timeoutIdQueuedAutoRefresh != null) {
			clearTimeout(this.timeoutIdQueuedAutoRefresh)
		}

		this.timeoutIdQueuedAutoRefresh = setTimeout(() => {
			if (this.autoRefreshReasonBlockUpdate !== null) {
				const isUpdateStillRelevant = this.isReceivableBlockUpdateRelevant(this.autoRefreshReasonBlockUpdate)

				if (isUpdateStillRelevant === false) {
					this.enableRefreshesEventually()
					return
				}
			}

			this.loadAccountDetails()
		}, delayMS)
	}

	onAccountDetailsLoadStart () {
		this.instantAutoRefreshAllowed = false
		this.manualRefreshAllowed = false

		if (this.timeoutIdAllowingManualRefresh != null) {
			clearTimeout(this.timeoutIdAllowingManualRefresh)
		}

		if (this.timeoutIdAllowingInstantAutoRefresh != null) {
			clearTimeout(this.timeoutIdAllowingInstantAutoRefresh)
		}

		if (this.timeoutIdQueuedAutoRefresh != null) {
			clearTimeout(this.timeoutIdQueuedAutoRefresh)
		}
	}

	enableRefreshesEventually () {
		this.enableInstantAutoRefreshDelayed(3000)
		this.enableManualRefreshDelayed(5000)
	}

	onAccountDetailsLoadDone () {
		if (this.shouldQueueAutoRefresh === true) {
			this.shouldQueueAutoRefresh = false
			this.loadAccountDetailsDelayed(3000)
			return
		}

		this.enableRefreshesEventually()
	}

	async loadAccountDetails () {
		this.onAccountDetailsLoadStart()

		this.receivableBlocks = []

		this.clearAccountVars()
		this.loadingAccountDetails = true

		const address = this.activatedRoute.snapshot.params.account
		this.address = address
		this.generateReceiveQR(address)

		this.addressBookEntry = this.svcAddressBook.getAccountName(address)
		this.addressBookModel = this.addressBookEntry || ''
		this.walletAccount = this.svcWallet.getWalletAccount(address)

		const accountInfo = await this.svcApi.accountInfo(address)
		debugger

		// Navigated to a different account while account info was loading
		if (address !== this.address) {
			this.onAccountDetailsLoadDone()
			return
		}

		// No results from RPC
		if (!accountInfo) {
			this.loadingAccountDetails = false
			this.onAccountDetailsLoadDone()
			return
		}

		this.account.set(Account.load(accountInfo))

		this.updateRepresentativeInfo()

		// If there is a receivable balance, or the account is not opened yet, load receivable transactions
		if (accountInfo.receivable > 0 || accountInfo.error) {
			// Take minimum receive into account
			let receivableBalance = '0'
			let receivable

			this.receivableBlocks = []
			this.loadingIncomingTxList = true

			if (this.svcAppSettings.settings.minimumReceive) {
				const minAmount = await Tools.convert(this.svcAppSettings.settings.minimumReceive, 'nano', 'raw')
				receivable = await this.svcApi.receivableLimitSorted(address, 50, minAmount)
			} else {
				receivable = await this.svcApi.receivableSorted(address, 50)
			}

			if (address !== this.address) {
				// Navigated to a different account while incoming tx were loading
				this.onAccountDetailsLoadDone()
				return
			}

			this.loadingIncomingTxList = false

			if (receivable?.blocks) {
				for (const block in receivable.blocks) {
					if (!receivable.blocks.hasOwnProperty(block)) continue
					const transaction = receivable.blocks[block]

					this.receivableBlocks.push({
						account: transaction.source,
						amount: transaction.amount,
						local_timestamp: transaction.local_timestamp,
						local_date_string: transaction.local_timestamp
							? formatDate(transaction.local_timestamp * 1000, 'MMM d, y', 'en-US')
							: 'N/A',
						local_time_string: transaction.local_timestamp
							? formatDate(transaction.local_timestamp * 1000, 'HH:mm:ss', 'en-US')
							: '',
						addressBookName:
							this.svcAddressBook.getAccountName(transaction.source) || this.getAccountLabel(transaction.source, null),
						hash: block,
						loading: false,
						received: false,
						isReceivable: true,
					})

					receivableBalance = (BigInt(receivableBalance) + BigInt(transaction.amount)).toString()
				}
			}

			this.account().receivable = receivableBalance
		} else {
			// Unset variable that may still be set to true from old request
			this.loadingIncomingTxList = false
		}

		// If the account doesnt exist, set the receivable balance manually
		if (accountInfo.error) {
			const receivableRaw = this.receivableBlocks.reduce(
				(prev: bigint, current: any) => prev + BigInt(current.amount),
				0n
			)
			this.account().receivable = receivableRaw
		}

		await this.getAccountHistory(address)

		if (address !== this.address) {
			// Navigated to a different account while account history was loading
			this.onAccountDetailsLoadDone()
			return
		}

		this.loadingAccountDetails = false
		this.onAccountDetailsLoadDone()
	}

	getAccountLabel (accountID, defaultLabel) {
		const walletAccount = this.svcWallet.accounts.find((a) => a.address === accountID)

		if (walletAccount == null) {
			return defaultLabel
		}

		return translate('general.account') + ' #' + walletAccount.index
	}

	ngOnDestroy () {
		this.mobileAccountMenuModal.hide()
		this.mobileTransactionMenuModal.hide()
		if (this.routerSub) {
			this.routerSub.unsubscribe()
		}
		if (this.priceSub) {
			this.priceSub.unsubscribe()
		}
	}

	async generateReceiveQR (accountID) {
		const qrCode = await QRCode.toDataURL(`${accountID}`, { errorCorrectionLevel: 'M', scale: 16 })
		this.qrCodeImage = qrCode
	}

	updateTodayYesterdayDateStrings () {
		const unixTimeNow = Date.now()

		this.dateStringToday = formatDate(unixTimeNow, 'MMM d, y', 'en-US')
		this.dateStringYesterday = formatDate(unixTimeNow - 86400000, 'MMM d, y', 'en-US')
	}

	async getAccountHistory (accountID, resetPage = true) {
		if (resetPage) {
			this.accountHistory = []
			this.pageSize = 25
		}

		this.loadingTxList = true
		this.updateTodayYesterdayDateStrings()

		const history = await this.svcApi.accountHistory(accountID, this.pageSize, true)

		if (accountID !== this.address) {
			// Navigated to a different account while account history was loading
			return
		}

		const additionalBlocksInfo = []
		const accountConfirmationHeight = parseInt(this.account()?.confirmation_height, 10) || null

		if (Array.isArray(history?.history)) {
			this.accountHistory = history.history.map((h) => {
				h.local_date_string = h.local_timestamp ? formatDate(h.local_timestamp * 1000, 'MMM d, y', 'en-US') : 'N/A'
				h.local_time_string = h.local_timestamp ? formatDate(h.local_timestamp * 1000, 'HH:mm:ss', 'en-US') : ''

				if (h.type === 'state') {
					if (h.subtype === 'open' || h.subtype === 'receive') {
						// Look up block info to get sender account
						additionalBlocksInfo.push({ hash: h.hash, link: h.link })

						// Remove a receivable block if this is a receive for it
						const sourceHashToFind = h.link

						this.receivableBlocks = this.receivableBlocks.filter((knownReceivableBlock) => {
							knownReceivableBlock.hash !== sourceHashToFind
						})
					} else if (h.subtype === 'change') {
						h.link_as_account = h.representative
						h.addressBookName =
							this.svcAddressBook.getAccountName(h.link_as_account) || this.getAccountLabel(h.link_as_account, null)
					} else {
						h.link_as_account = Account.load(h.link).address
						h.addressBookName =
							this.svcAddressBook.getAccountName(h.link_as_account) || this.getAccountLabel(h.link_as_account, null)
					}
				} else {
					h.addressBookName = this.svcAddressBook.getAccountName(h.account) || this.getAccountLabel(h.account, null)
				}
				h.confirmed = parseInt(h.height, 10) <= accountConfirmationHeight
				return h
			})

			// Currently not supporting non-state rep change or state epoch blocks
			this.accountHistory = this.accountHistory.filter((h) => {
				return h.type !== 'change' && h.subtype !== 'epoch'
			})

			if (additionalBlocksInfo.length) {
				const blocksInfo = await this.svcApi.blocksInfo(additionalBlocksInfo.map((b) => b.link))

				if (accountID !== this.address) {
					// Navigated to a different account while block info was loading
					return
				}

				for (const block in blocksInfo.blocks) {
					if (!blocksInfo.blocks.hasOwnProperty(block)) continue

					const matchingBlock = additionalBlocksInfo.find((a) => a.link === block)
					if (!matchingBlock) continue
					const accountHistoryBlock = this.accountHistory.find((h) => h.hash === matchingBlock.hash)
					if (!accountHistoryBlock) continue

					const blockData = blocksInfo.blocks[block]

					accountHistoryBlock.link_as_account = blockData.block_account
					accountHistoryBlock.addressBookName =
						this.svcAddressBook.getAccountName(blockData.block_account) ||
						this.getAccountLabel(blockData.block_account, null)
				}
			}
		} else {
			this.accountHistory = []
		}

		this.loadingTxList = false
	}

	async loadMore () {
		if (this.pageSize <= this.maxPageSize) {
			this.pageSize += 25
			await this.getAccountHistory(this.address, false)
		}
	}

	async saveAddressBook () {
		// Trim and remove duplicate spaces
		this.addressBookModel = this.addressBookModel.trim().replace(/ +/g, ' ')

		if (!this.addressBookModel) {
			// Check for deleting an entry in the address book
			if (this.addressBookEntry) {
				this.svcAddressBook.deleteAddress(this.address)
				this.svcNotifications.sendSuccess(translate('address-book.successfully-deleted-address-book-entry'))
				this.addressBookEntry = null
			}

			this.showEditAddressBook = false
			return
		}

		const regexp = new RegExp('^(Account|' + translate('general.account') + ') #\\d+$', 'g')
		if (regexp.test(this.addressBookModel) === true) {
			return this.svcNotifications.sendError(
				translate('address-book.this-name-is-reserved-for-wallet-accounts-without-a-label')
			)
		}

		// Make sure no other entries are using that name
		const accountIdWithSameName = this.svcAddressBook.getAccountIdByName(this.addressBookModel)

		if (accountIdWithSameName !== null && accountIdWithSameName !== this.address) {
			return this.svcNotifications.sendError(
				translate('address-book.this-name-is-already-in-use-please-use-a-unique-name')
			)
		}

		try {
			const currentBalanceTracking = this.svcAddressBook.getBalanceTrackingById(this.address)
			const currentTransactionTracking = this.svcAddressBook.getTransactionTrackingById(this.address)
			await this.svcAddressBook.saveAddress(
				this.address,
				this.addressBookModel,
				currentBalanceTracking,
				currentTransactionTracking
			)
		} catch (err) {
			this.svcNotifications.sendError(translate('address-book.unable-to-save-entry', { message: err.message }))
			return
		}

		this.svcNotifications.sendSuccess(translate('address-book.address-book-entry-saved-successfully'))

		this.addressBookEntry = this.addressBookModel
		this.showEditAddressBook = false
	}

	searchRepresentatives () {
		if (this.representativeModel !== '' && !this.svcUtil.account.isValidAccount(this.representativeModel))
			this.repStatus = 0
		else this.repStatus = null

		this.showRepresentatives = true
		const search = this.representativeModel || ''

		const matches = this.representativeList
			.filter((a) => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
			// remove duplicate accounts
			.filter((item, pos, self) => this.svcUtil.array.findWithAttr(self, 'id', item.id) === pos)
			.slice(0, 5)

		this.representativeResults$.next(matches)
	}

	selectRepresentative (rep) {
		this.showRepresentatives = false
		this.representativeModel = rep
		this.searchRepresentatives()
		this.validateRepresentative()
	}

	async validateRepresentative () {
		setTimeout(() => (this.showRepresentatives = false), 400)
		this.representativeModel = this.representativeModel.replace(/ /g, '')

		if (this.representativeModel === '') {
			this.representativeListMatch = ''
			return
		}

		const rep = this.svcRepresentative.getRepresentative(this.representativeModel)
		const ninjaRep = await this.svcNinja.getAccount(this.representativeModel)

		if (rep) {
			this.representativeListMatch = rep.name
		} else if (ninjaRep) {
			this.representativeListMatch = ninjaRep.alias
		} else {
			this.representativeListMatch = ''
		}
	}

	copied () {
		this.svcNotifications.removeNotification('success-copied')
		this.svcNotifications.sendSuccess(translate('general.successfully-copied-to-clipboard'), {
			identifier: 'success-copied',
		})
	}

	// Remote signing methods
	// An update to the Nano amount, sync the fiat value
	syncFiatPrice () {
		if (!this.validateAmount()) return
		const rawAmount = BigInt(this.amount ?? 0) + this.amountRaw
		if (rawAmount <= 0n) {
			this.amountFiat = 0
			return
		}
		const precision = this.svcAppSettings.settings.displayCurrency === 'BTC' ? 6 : 2
		const fiatAmount = (parseFloat(Tools.convert(rawAmount, 'raw', 'nano')) * this.svcPrice.lastPrice).toFixed(
			precision
		)
		this.amountFiat = parseFloat(fiatAmount)
	}

	// An update to the fiat amount, sync the nano value based on currently selected denomination
	async syncNanoPrice () {
		if (!this.amountFiat) {
			this.amount = ''
			return
		}
		if (!this.svcUtil.string.isNumeric(this.amountFiat)) return
		const fx = (this.amountFiat / this.svcPrice.lastPrice).toString()
		const nanoPrice: string = await Tools.convert(fx, 'mnano', 'nano')
		this.amount = Number(nanoPrice).toPrecision(3)
	}

	searchAddressBook () {
		this.showAddressBook = true
		const search = this.toAccountID || ''
		const addressBook = this.svcAddressBook.addressBook

		const matches = addressBook.filter((a) => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1).slice(0, 5)

		this.addressBookResults$.next(matches)
	}

	selectBookEntry (account) {
		this.showAddressBook = false
		this.toAccountID = account
		this.searchAddressBook()
		this.validateDestination()
	}

	async validateDestination () {
		// The timeout is used to solve a bug where the results get hidden too fast and the click is never registered
		setTimeout(() => (this.showAddressBook = false), 400)

		// Remove spaces from the account id
		this.toAccountID = this.toAccountID.replace(/ /g, '')

		this.addressBookMatch =
			this.svcAddressBook.getAccountName(this.toAccountID) || this.getAccountLabel(this.toAccountID, null)

		// const accountInfo = await this.walletService.walletApi.accountInfo(this.toAccountID)
		this.toAccountStatus = null
		if (this.svcUtil.account.isValidAccount(this.toAccountID)) {
			const accountInfo = await this.svcApi.accountInfo(this.toAccountID)
			if (accountInfo.error) {
				if (accountInfo.error === 'Account not found') {
					this.toAccountStatus = 1
				}
			}
			if (accountInfo && accountInfo.frontier) {
				this.toAccountStatus = 2
			}
		} else {
			this.toAccountStatus = 0
		}
	}

	validateAmount () {
		if (this.svcUtil.account.isValidNanoAmount(this.amount)) {
			this.amountStatus = 1
			return true
		} else {
			this.amountStatus = 0
			return false
		}
	}

	async setMaxAmount () {
		this.amountRaw = BigInt(this.account()?.balance || 0n)
		this.amount = parseFloat(Tools.convert(this.account()?.balance, 'raw', 'nano')).toFixed(6)
		this.syncFiatPrice()
	}

	showMobileMenuForTransaction (transaction) {
		this.svcNotifications.removeNotification('success-copied')

		this.mobileTransactionData = transaction
		this.mobileTransactionMenuModal.show()
	}

	onReceiveFundsPress (receivableTransaction) {
		if (receivableTransaction.loading || receivableTransaction.received) {
			return
		}

		this.receiveReceivableBlock(receivableTransaction)
	}

	async receiveReceivableBlock (receivableBlock) {
		const sourceBlock = receivableBlock.hash

		if (this.svcWallet.isLocked()) {
			try {
				await this.svcWallet.requestUnlock()
			} catch (err) {
				console.error(err)
				this.svcNotifications.sendError('Failed to unlock and receive', { identifier: 'receive-unlock-fail' })
			}
		}

		receivableBlock.loading = true

		let createdReceiveBlockHash = null
		let hasShownErrorNotification = false

		try {
			createdReceiveBlockHash = await this.svcNanoBlock.generateReceive(
				this.walletAccount,
				sourceBlock,
				this.svcWallet.isLedger
			)
		} catch (err) {
			this.svcNotifications.sendError('Error receiving transaction: ' + err.message)
			hasShownErrorNotification = true
		}

		if (createdReceiveBlockHash != null) {
			receivableBlock.received = true
			this.mobileTransactionMenuModal.hide()
			this.svcNotifications.removeNotification('success-receive')
			this.svcNotifications.sendSuccess(`Successfully received nano!`, { identifier: 'success-receive' })
			// clear the list of receivable blocks. Updated again with reloadBalances()
			this.svcWallet.clearReceivableBlocks()
		} else {
			if (hasShownErrorNotification === false) {
				if (!this.svcWallet.isLedger) {
					this.svcNotifications.sendError(`Error receiving transaction, please try again`, { length: 10000 })
				}
			}
		}

		receivableBlock.loading = false

		await this.svcWallet.reloadBalances()

		this.loadAccountDetailsThrottled({})
	}

	async generateSend () {
		if (!this.address || !this.toAccountID) {
			return this.svcNotifications.sendWarning(`From and to account are required`)
		}
		const isValid = this.svcUtil.account.isValidAccount(this.toAccountID)
		if (!isValid) return this.svcNotifications.sendWarning(`To account address is not valid`)
		if (!this.validateAmount()) return this.svcNotifications.sendWarning(`Invalid XNO Amount`)

		this.qrCodeImageBlock = null

		const from = await this.svcApi.accountInfo(this.address)
		const to = await this.svcApi.accountInfo(this.toAccountID)
		if (!from) return this.svcNotifications.sendError(`From account not found`)

		const bigBalanceFrom = BigInt(from.balance || 0)

		this.fromAccount = from
		this.toAccount = to

		const rawAmount = BigInt(await Tools.convert(this.amount, 'nano', 'raw'))
		this.rawAmount = rawAmount + this.amountRaw

		if (this.amount < 0 || rawAmount < 0n) return this.svcNotifications.sendWarning(`Amount is invalid`)
		if (bigBalanceFrom - rawAmount < 0n) return this.svcNotifications.sendError(`From account does not have enough XNO`)

		// Determine a proper raw amount to show in the UI, if a decimal was entered
		this.amountRaw = this.rawAmount

		// Determine fiat value of the amount
		this.amountFiat = parseFloat(Tools.convert(rawAmount, 'raw', 'nano')) * this.svcPrice.lastPrice

		const defaultRepresentative =
			this.svcAppSettings.settings.defaultRepresentative || this.svcNanoBlock.getRandomRepresentative()
		const representative = from.representative || defaultRepresentative
		const block = new Block(this.address, from.balance, from.frontier, representative).send(
			Account.load(this.toAccountID).publicKey,
			this.rawAmount
		)
		this.blockHash = block.hash
		console.log('Created block', block)
		console.log('Block hash: ' + this.blockHash)

		// Previous block info
		const previousBlockInfo = await this.svcApi.blockInfo(block.previous)
		if (!('contents' in previousBlockInfo)) return this.svcNotifications.sendError(`Previous block not found`)
		const jsonBlock = JSON.parse(previousBlockInfo.contents)
		const blockDataPrevious = {
			account: jsonBlock.account.replace('xrb_', 'nano_').toLowerCase(),
			previous: jsonBlock.previous,
			representative: jsonBlock.representative,
			balance: jsonBlock.balance,
			link: jsonBlock.link,
			signature: jsonBlock.signature,
		}

		// Nano signing standard
		this.qrString = `nanosign:{"block":${block.toJSON()},"previous":${JSON.stringify(blockDataPrevious)}}`
		const qrCode = await QRCode.toDataURL(this.qrString, { errorCorrectionLevel: 'L', scale: 16 })
		this.qrCodeImageBlock = qrCode
	}

	async generateReceive (receivableHash) {
		this.qrCodeImageBlockReceive = null
		this.qrString = null
		this.blockHashReceive = null

		const UIkit = window['UIkit']
		const modal = UIkit.modal('#receive-modal')
		modal.show()

		const toAcct = await this.svcApi.accountInfo(this.address)

		const openEquiv = !toAcct || !toAcct.frontier // if open block

		const previousBlock = toAcct.frontier || this.zeroHash // set to zeroes if open block
		const defaultRepresentative =
			this.svcAppSettings.settings.defaultRepresentative || this.svcNanoBlock.getRandomRepresentative()
		const representative = toAcct.representative || defaultRepresentative

		const srcBlockInfo = await this.svcApi.blocksInfo([receivableHash])
		const srcAmount = BigInt(srcBlockInfo.blocks[receivableHash].amount)
		const newBalance = openEquiv ? srcAmount : BigInt(toAcct.balance) + srcAmount
		const newBalanceDecimal = newBalance.toString(10)

		const block = new Block(this.address, toAcct.balance, previousBlock, representative).receive(
			receivableHash,
			srcAmount
		)

		this.blockHashReceive = block.hash
		console.log('Created block', block)
		console.log('Block hash: ' + this.blockHashReceive)

		// Previous block info
		let blockDataPrevious = null
		if (!openEquiv) {
			const previousBlockInfo = await this.svcApi.blockInfo(block.previous)
			if (!('contents' in previousBlockInfo)) return this.svcNotifications.sendError(`Previous block not found`)
			const jsonBlock = JSON.parse(previousBlockInfo.contents)
			blockDataPrevious = {
				account: jsonBlock.account.replace('xrb_', 'nano_').toLowerCase(),
				previous: jsonBlock.previous,
				representative: jsonBlock.representative,
				balance: jsonBlock.balance,
				link: jsonBlock.link,
				signature: jsonBlock.signature,
			}
		}

		let qrData
		if (blockDataPrevious) {
			qrData = {
				block: block.toJSON(),
				previous: blockDataPrevious,
			}
		} else {
			qrData = {
				block: block.toJSON(),
			}
		}

		// Nano signing standard
		this.qrString = 'nanosign:' + JSON.stringify(qrData)

		const qrCode = await QRCode.toDataURL(this.qrString, { errorCorrectionLevel: 'L', scale: 16 })
		this.qrCodeImageBlockReceive = qrCode
	}

	async generateChange () {
		if (!this.svcUtil.account.isValidAccount(this.representativeModel)) {
			return this.svcNotifications.sendError(`Not a valid representative account`)
		}
		this.qrCodeImageBlock = null
		this.blockHash = null
		this.qrString = null

		const account = await this.svcApi.accountInfo(this.address)

		if (!account || !('frontier' in account)) return this.svcNotifications.sendError(`Account must be opened first!`)

		const balance = BigInt(account.balance)
		const balanceDecimal = balance.toString(10)

		const block = new Block(this.address, balanceDecimal, account.frontier).change(this.representativeModel)
		this.blockHash = block.hash

		console.log('Created block', block)
		console.log('Block hash: ' + this.blockHash)

		// Previous block info
		const previousBlockInfo = await this.svcApi.blockInfo(block.previous)
		if (!('contents' in previousBlockInfo)) return this.svcNotifications.sendError(`Previous block not found`)
		const jsonBlock = JSON.parse(previousBlockInfo.contents)
		const blockDataPrevious = {
			account: jsonBlock.account.replace('xrb_', 'nano_').toLowerCase(),
			previous: jsonBlock.previous,
			representative: jsonBlock.representative,
			balance: jsonBlock.balance,
			link: jsonBlock.link,
			signature: jsonBlock.signature,
		}

		// Nano signing standard
		this.qrString =
			'nanosign:{"block":' + JSON.stringify(block.toJSON()) + ',"previous":' + JSON.stringify(blockDataPrevious) + '}'
		const qrCode = await QRCode.toDataURL(this.qrString, { errorCorrectionLevel: 'L', scale: 16 })
		this.qrCodeImageBlock = qrCode
	}

	showRemote (state: boolean) {
		this.remoteVisible = !state
	}

	showRemoteModal () {
		const UIkit = window['UIkit']
		const modal = UIkit.modal('#block-modal')
		modal.show()
		this.clearRemoteVars()
	}

	// open qr reader modal
	openQR (reference, type) {
		const qrResult = this.svcQrModal.openQR(reference, type)
		qrResult.then(
			(data) => {
				switch (data.reference) {
					case 'account1':
						this.toAccountID = data.content
						this.validateDestination()
						break
					case 'rep1':
						this.representativeModel = data.content
						this.validateRepresentative()
						break
				}
			},
			() => { }
		)
	}

	resetRaw () {
		this.amountRaw = 0n
	}

	// End remote signing methods
}

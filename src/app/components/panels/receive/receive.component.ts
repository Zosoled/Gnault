import { CommonModule } from '@angular/common'
import { Component, OnDestroy, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ChildActivationEnd, Router, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import {
	NanoAccountIdComponent,
	NanoIdenticonComponent,
	NanoTransactionMobileComponent
} from 'app/components/elements'
import {
	AmountSplitPipe,
	CurrencySymbolPipe,
	RaiPipe,
	SqueezePipe
} from 'app/pipes'
import {
	AddressBookService,
	AppSettingsService,
	NanoBlockService,
	NotificationsService,
	PriceService,
	UtilService,
	WalletService,
	WebsocketService
} from 'app/services'
import { Account, Tools } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import * as QRCode from 'qrcode'

@Component({
	selector: 'app-receive',
	templateUrl: './receive.component.html',
	styleUrls: ['./receive.component.css'],
	imports: [
		AmountSplitPipe,
		ClipboardModule,
		CommonModule,
		CurrencySymbolPipe,
		FormsModule,
		NanoAccountIdComponent,
		NanoIdenticonComponent,
		NanoTransactionMobileComponent,
		RaiPipe,
		RouterLink,
		SqueezePipe,
		TranslocoDirective,
		TranslocoPipe
	]
})

export class ReceiveComponent implements OnInit, OnDestroy {
	private router = inject(Router)
	private svcAddressBook = inject(AddressBookService)
	private svcAppSettings = inject(AppSettingsService)
	private svcNanoBlock = inject(NanoBlockService)
	private svcNotifications = inject(NotificationsService)
	private svcTransloco = inject(TranslocoService)
	private svcWallet = inject(WalletService)
	private svcWebsocket = inject(WebsocketService)

	svcPrice = inject(PriceService)
	svcUtil = inject(UtilService)

	nano = 1000000000000000000000000
	accounts = this.svcWallet.accounts
	timeoutIdClearingRecentlyCopiedState: any = null
	mobileTransactionMenuModal: any = null
	merchantModeModal: any = null
	mobileTransactionData: any = null

	selectedAccountAddressBookName = ''
	receivableAccountModel = '0'
	receivableBlocks = []
	receivableBlocksForSelectedAccount = []
	qrCodeUri = null
	qrCodeImage = null
	qrAccount = ''
	qrAmount: bigint = null
	recentlyCopiedAccountAddress = false
	recentlyCopiedPaymentUri = false
	walletAccount: Account = null
	selAccountInit = false
	loadingIncomingTxList = false
	amountNano = ''
	amountFiat = ''
	validNano = true
	validFiat = true
	qrSuccessClass = ''

	inMerchantMode = false
	inMerchantModeQR = false
	inMerchantModePaymentComplete = false
	merchantModeRawRequestedQR: bigint = null
	merchantModeRawRequestedTotal: bigint = null
	merchantModeRawReceivedTotal: bigint = null
	merchantModeRawReceivedTotalHiddenRaw: bigint = null
	merchantModeSeenBlockHashes = {}
	merchantModePrompts = []
	merchantModeTransactionHashes = []

	routerSub = null

	get displayCurrency () {
		return this.svcAppSettings.settings.displayCurrency.toUpperCase()
	}
	get identiconsStyle () {
		return this.svcAppSettings.settings.identiconsStyle
	}
	get minimumReceive () {
		return this.svcAppSettings.settings.minimumReceive
	}

	async ngOnInit () {
		const UIkit = window['UIkit']

		const mobileTransactionMenuModal = UIkit.modal('#mobile-transaction-menu-modal')
		this.mobileTransactionMenuModal = mobileTransactionMenuModal

		const merchantModeModal = UIkit.modal('#merchant-mode-modal')
		this.merchantModeModal = merchantModeModal

		this.routerSub = this.router.events.subscribe(event => {
			if (event instanceof ChildActivationEnd) {
				this.mobileTransactionMenuModal.hide()
				this.merchantModeModal.hide()
			}
		})

		// Update selected account if changed in the sidebar
		this.svcWallet.selectedAccount$.subscribe(async acc => {
			if (this.selAccountInit) {
				this.receivableAccountModel = acc?.address ?? '0'
				this.onSelectedAccountChange(this.receivableAccountModel)
			}
			this.selAccountInit = true
		})

		this.svcWallet.isReceivableBlocksUpdated$.subscribe(async receivableBlockUpdate => {
			if (receivableBlockUpdate === null) {
				return
			}
			this.updateReceivableBlocks()
		})

		await this.updateReceivableBlocks()

		if (this.svcWallet.selectedAccount !== null) {
			// Set the account selected in the sidebar as default
			this.receivableAccountModel = this.svcWallet.selectedAccount().address
			this.onSelectedAccountChange(this.receivableAccountModel)
		} else if (this.accounts.length === 1) {
			// Auto-select account if it is the only account in the wallet
			this.receivableAccountModel = this.accounts[0].address
			this.onSelectedAccountChange(this.receivableAccountModel)
		}

		// Listen as new transactions come in. Ignore the latest transaction that is already present on page load.
		const latest = this.svcWebsocket.newTransactions$.getValue()
		this.svcWebsocket.newTransactions$.subscribe(async (transaction) => {
			if (transaction && latest !== transaction) {
				const rawAmount = BigInt(transaction.amount)
				if (transaction.block.link_as_account === this.qrAccount && rawAmount > (this.qrAmount || 0n)) {
					this.showQrConfirmation()
					setTimeout(() => this.resetAmount(), 500)
				}
				if ((this.inMerchantModeQR === true) && (transaction.block.link_as_account === this.qrAccount)) {
					this.onMerchantModeReceiveTransaction(transaction)
				}
			}
		})
	}

	ngOnDestroy () {
		this.mobileTransactionMenuModal.hide()
		this.merchantModeModal.hide()
		if (this.routerSub) {
			this.routerSub.unsubscribe()
		}
	}

	async updateReceivableBlocks () {
		this.receivableBlocks =
			this.svcWallet.receivableBlocks
				.map(
					(receivableBlock) =>
						Object.assign(
							{},
							receivableBlock,
							{
								account: receivableBlock.source,
								destination: receivableBlock.account,
								source: null,
								addressBookName: (
									this.svcAddressBook.getAccountName(receivableBlock.source)
									|| this.getAccountLabel(receivableBlock.source, null)
								),
								destinationAddressBookName: (
									this.svcAddressBook.getAccountName(receivableBlock.account)
									|| this.getAccountLabel(receivableBlock.account, this.svcTransloco.translate('general.account'))
								),
								isReceivable: true,
								local_time_string: '',
							}
						)
				)
				.sort((a, b) => a.destinationAddressBookName.localeCompare(b.destinationAddressBookName)
				)

		this.filterReceivableBlocksForDestinationAccount(this.receivableAccountModel)
	}

	filterReceivableBlocksForDestinationAccount (selectedAccountID) {
		if (selectedAccountID === '0') {
			// Blocks for all accounts
			this.receivableBlocksForSelectedAccount = [...this.receivableBlocks]
			return
		}

		// Blocks for selected account
		this.receivableBlocksForSelectedAccount = this.receivableBlocks
			.filter(block => (block.destination === selectedAccountID))

		if (this.inMerchantModeQR === true) {
			this.receivableBlocksForSelectedAccount.forEach(receivableBlock => {
				this.onMerchantModeReceiveTransaction(receivableBlock)
			})
		}
	}

	showMobileMenuForTransaction (transaction) {
		this.svcNotifications.removeNotification('success-copied')

		this.mobileTransactionData = transaction
		this.mobileTransactionMenuModal.show()
	}

	getAccountLabel (accountID, defaultLabel) {
		const walletAccount = this.svcWallet.accounts.find(a => a.address === accountID)
		if (walletAccount == null) {
			return defaultLabel
		}
		return (this.svcTransloco.translate('general.account') + ' #' + walletAccount.index)
	}

	async getReceivable () {
		// clear the list of receivable blocks. Updated again with reloadBalances()
		this.receivableBlocks = []
		this.receivableBlocksForSelectedAccount = []
		this.loadingIncomingTxList = true
		await this.svcWallet.reloadBalances()
		this.loadingIncomingTxList = false
	}

	async nanoAmountChange () {
		if (!this.validateNanoAmount() || Number(this.amountNano) === 0) {
			this.amountFiat = ''
			this.changeQRAmount()
			return
		}
		const precision = this.svcAppSettings.settings.displayCurrency === 'BTC' ? 6 : 2
		const rawAmount = Tools.convert(this.amountNano || 0, 'mnano', 'raw')
		const fiatAmount = parseFloat(Tools.convert(rawAmount, 'raw', 'mnano')) * this.svcPrice.lastPrice

		this.amountFiat = fiatAmount.toFixed(precision)
		this.changeQRAmount(rawAmount)
		this.validateFiatAmount()
	}

	async fiatAmountChange () {
		if (!this.validateFiatAmount() || Number(this.amountFiat) === 0) {
			this.amountNano = ''
			this.changeQRAmount()
			return
		}
		const amount = parseFloat(this.amountFiat) / this.svcPrice.lastPrice
		const raw = Tools.convert(amount, 'mnano', 'raw')
		const nanoRounded = parseFloat(this.svcUtil.nano.rawToMnano(raw)).toFixed(6)
		const rawRounded = this.svcUtil.nano.nanoToRaw(nanoRounded)

		this.amountNano = nanoRounded
		this.changeQRAmount(rawRounded)
		this.validateNanoAmount()
	}

	validateNanoAmount () {
		if (!this.amountNano) {
			this.validNano = true
			return true
		}
		this.validNano = this.amountNano !== '-' && (this.svcUtil.account.isValidNanoAmount(this.amountNano) || Number(this.amountNano) === 0)
		return this.validNano
	}

	validateFiatAmount () {
		if (!this.amountFiat) {
			this.validFiat = true
			return true
		}
		this.validFiat = this.svcUtil.string.isNumeric(this.amountFiat) && Number(this.amountFiat) >= 0
		return this.validFiat
	}

	onSelectedAccountChange (accountID) {
		this.selectedAccountAddressBookName = (
			this.svcAddressBook.getAccountName(accountID)
			|| this.getAccountLabel(accountID, this.svcTransloco.translate('general.account'))
		)

		this.changeQRAccount(accountID)
		this.filterReceivableBlocksForDestinationAccount(accountID)
	}

	async changeQRAccount (account) {
		this.walletAccount = this.svcWallet.accounts.find(a => a.address === account) || null
		this.qrAccount = ''
		let qrCode = null
		if (account.length > 1) {
			this.qrAccount = account
			this.qrCodeImage = null
			const amount = this.qrAmount > 0n
				? `?amount=${this.qrAmount.toString()}`
				: ''
			this.qrCodeUri = `nano:${account}${amount}`
			qrCode = await QRCode.toDataURL(this.qrCodeUri, { scale: 7 })
		}
		this.qrCodeImage = qrCode
	}

	async changeQRAmount (raw?: bigint | string) {
		this.qrAmount = null
		let qrCode = null
		if (raw && this.svcUtil.account.isValidAmount(raw)) {
			this.qrAmount = BigInt(raw)
		}
		if (this.qrAccount.length > 1) {
			this.qrCodeImage = null
			const amount = this.qrAmount > 0n
				? `?amount=${this.qrAmount.toString()}`
				: ''
			this.qrCodeUri = `nano:${this.qrAccount}${amount}`
			qrCode = await QRCode.toDataURL(this.qrCodeUri, { scale: 7 })
			this.qrCodeImage = qrCode
		}
	}

	showQrConfirmation () {
		this.qrSuccessClass = 'in'
		setTimeout(() => { this.qrSuccessClass = 'out' }, 7000)
		setTimeout(() => { this.qrSuccessClass = '' }, 12000)
	}

	resetAmount () {
		this.amountNano = ''
		this.amountFiat = ''
		this.changeQRAmount()
	}

	onReceiveFundsPress (receivableTransaction) {
		if (receivableTransaction.loading || receivableTransaction.received) {
			return
		}

		this.receiveReceivableBlock(receivableTransaction)
	}

	async receiveReceivableBlock (receivableBlock) {
		const sourceBlock = receivableBlock.hash

		const walletAccount = this.svcWallet.accounts.find(a => a.address === receivableBlock.destination)
		if (!walletAccount) {
			throw new Error(this.svcTransloco.translate('receive.unable-to-find-receiving-account'))
		}

		if (this.svcWallet.isLocked) {
			const wasUnlocked = await this.svcWallet.requestUnlock()

			if (wasUnlocked === false) {
				return
			}
		}
		receivableBlock.loading = true

		let createdReceiveBlockHash = null
		let hasShownErrorNotification = false

		try {
			createdReceiveBlockHash = await this.svcNanoBlock.generateReceive(walletAccount, sourceBlock, this.svcWallet.isLedger)
		} catch (err) {
			this.svcNotifications.sendError('Error receiving transaction: ' + err.message)
			hasShownErrorNotification = true
		}

		if (createdReceiveBlockHash != null) {
			receivableBlock.received = true
			this.mobileTransactionMenuModal.hide()
			this.svcNotifications.removeNotification('success-receive')
			this.svcNotifications.sendSuccess(this.svcTransloco.translate('receive.successfully-received-nano'), { identifier: 'success-receive' })
			// receivable has been processed, can be removed from the list
			// list also updated with reloadBalances but not if called too fast
			this.svcWallet.removeReceivableBlock(receivableBlock.hash)
		} else {
			if (hasShownErrorNotification === false && !this.svcWallet.isLedger) {
				this.svcNotifications.sendError(this.svcTransloco.translate('receive.there-was-a-problem-receiving-the-transaction-try-manually'), { length: 10000 })
			}
		}

		receivableBlock.loading = false
		this.updateReceivableBlocks() // update the list
	}

	copied () {
		this.svcNotifications.removeNotification('success-copied')
		this.svcNotifications.sendSuccess(this.svcTransloco.translate('general.successfully-copied-to-clipboard'), { identifier: 'success-copied' })
	}

	copiedAccountAddress () {
		if (this.timeoutIdClearingRecentlyCopiedState != null) {
			clearTimeout(this.timeoutIdClearingRecentlyCopiedState)
		}
		this.recentlyCopiedAccountAddress = true
		this.recentlyCopiedPaymentUri = false
		this.timeoutIdClearingRecentlyCopiedState = setTimeout(() => {
			this.recentlyCopiedAccountAddress = false
		}, 2000)
	}

	copiedPaymentUri () {
		if (this.timeoutIdClearingRecentlyCopiedState != null) {
			clearTimeout(this.timeoutIdClearingRecentlyCopiedState)
		}
		this.recentlyCopiedPaymentUri = true
		this.recentlyCopiedAccountAddress = false
		this.timeoutIdClearingRecentlyCopiedState = setTimeout(() => {
			this.recentlyCopiedPaymentUri = false
		}, 2000)
	}

	unsetSelectedAccount () {
		this.receivableAccountModel = '0'
		this.onSelectedAccountChange(this.receivableAccountModel)
	}

	getRawAmountWithoutTinyRaws (rawAmountWithTinyRaws) {
		const tinyRaws = rawAmountWithTinyRaws.mod(this.nano)
		return rawAmountWithTinyRaws.minus(tinyRaws)
	}

	merchantModeResetState () {
		this.unsetSelectedAccount()
		this.resetAmount()
		this.inMerchantModeQR = false
		this.inMerchantModePaymentComplete = false
	}

	merchantModeEnable () {
		this.merchantModeResetState()
		this.inMerchantMode = true
		this.merchantModeModal.show()
	}

	merchantModeDisable () {
		this.inMerchantMode = false
		this.inMerchantModeQR = false
		this.inMerchantModePaymentComplete = false
		this.merchantModeModal.hide()
	}

	merchantModeShowQR () {
		const isRequestingAnyAmount = (this.validNano === false || Number(this.amountNano) === 0)
		if (isRequestingAnyAmount === true) {
			this.resetAmount()
		}
		this.merchantModeRawRequestedTotal = isRequestingAnyAmount
			? 0n
			: BigInt(Tools.convert(this.amountNano, 'mnano', 'raw'))
		this.merchantModeRawRequestedQR = isRequestingAnyAmount
			? 0n
			: BigInt(Tools.convert(this.amountNano, 'mnano', 'raw'))
		this.merchantModeSeenBlockHashes =
			this.receivableBlocksForSelectedAccount.reduce((seenHashes, receivableBlock) => {
				seenHashes[receivableBlock.hash] = true
				return seenHashes
			}, {})
		this.merchantModeTransactionHashes = []
		this.inMerchantModeQR = true
	}

	merchantModeHideQR () {
		this.inMerchantModeQR = false
	}

	onMerchantModeReceiveTransaction (transaction) {
		if (this.merchantModeSeenBlockHashes[transaction.hash] != null) {
			return
		}
		this.merchantModeSeenBlockHashes[transaction.hash] = true

		const receivedAmountWithTinyRaws = BigInt(transaction.amount)
		const receivedAmount = this.getRawAmountWithoutTinyRaws(receivedAmountWithTinyRaws)
		const requestedAmount = this.getRawAmountWithoutTinyRaws(this.merchantModeRawRequestedQR)

		if (receivedAmount.eq(requestedAmount)) {
			this.merchantModeTransactionHashes.push(transaction.hash)
			this.merchantModeMarkCompleteWithAmount(this.merchantModeRawRequestedTotal)
		} else {
			const transactionPrompt = {
				moreThanRequested: receivedAmount > requestedAmount,
				lessThanRequested: receivedAmount < requestedAmount,
				amountRaw: receivedAmountWithTinyRaws,
				amountHiddenRaw: receivedAmountWithTinyRaws % BigInt(this.nano),
				transactionHash: transaction.hash,
			}
			this.merchantModePrompts.push(transactionPrompt)
		}
	}

	merchantModeSubtractAmountFromPrompt (prompt, promptIdx) {
		const subtractedRawWithTinyRaws = prompt.amountRaw
		const subtractedRaw = this.getRawAmountWithoutTinyRaws(subtractedRawWithTinyRaws)
		const newAmountRaw = this.merchantModeRawRequestedQR - subtractedRaw

		this.merchantModeRawRequestedQR = newAmountRaw
		this.changeQRAmount(newAmountRaw)
		this.merchantModeTransactionHashes.push(prompt.transactionHash)
		this.merchantModePrompts.splice(promptIdx, 1)
	}

	merchantModeMarkCompleteFromPrompt (prompt) {
		this.merchantModeTransactionHashes.push(prompt.transactionHash)
		this.merchantModeMarkCompleteWithAmount(prompt.amountRaw)
	}

	merchantModeDiscardPrompt (promptIdx) {
		this.merchantModePrompts.splice(promptIdx, 1)
	}

	merchantModeMarkCompleteWithAmount (amountRaw) {
		this.merchantModeRawReceivedTotal = amountRaw
		this.merchantModeRawReceivedTotalHiddenRaw = amountRaw.mod(this.nano)
		this.inMerchantModePaymentComplete = true
		this.inMerchantModeQR = false
	}
}

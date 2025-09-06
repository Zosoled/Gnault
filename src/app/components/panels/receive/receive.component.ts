import { CommonModule } from '@angular/common'
import { Component, OnDestroy, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ChildActivationEnd, Router, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { Account, Tools } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import * as QRCode from 'qrcode'
import {
	NanoAccountIdComponent,
	NanoIdenticonComponent,
	NanoTransactionMobileComponent
} from 'app/components/elements'
import {
	AmountSplitPipe,
	CurrencySymbolPipe,
	FiatPipe,
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

@Component({
	selector: 'app-receive',
	templateUrl: './receive.component.html',
	styleUrls: ['./receive.component.css'],
	imports: [
		AmountSplitPipe,
		ClipboardModule,
		CommonModule,
		CurrencySymbolPipe,
		FiatPipe,
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
	private addressBook = inject(AddressBookService)
	private nanoBlock = inject(NanoBlockService)
	private notificationService = inject(NotificationsService)
	private route = inject(Router)
	private translocoService = inject(TranslocoService)
	private walletService = inject(WalletService)
	private websocket = inject(WebsocketService)

	price = inject(PriceService)
	settings = inject(AppSettingsService)
	util = inject(UtilService)

	nano = 1000000000000000000000000
	accounts = this.walletService.accounts
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

	async ngOnInit () {
		const UIkit = window['UIkit']

		const mobileTransactionMenuModal = UIkit.modal('#mobile-transaction-menu-modal')
		this.mobileTransactionMenuModal = mobileTransactionMenuModal

		const merchantModeModal = UIkit.modal('#merchant-mode-modal')
		this.merchantModeModal = merchantModeModal

		this.routerSub = this.route.events.subscribe(event => {
			if (event instanceof ChildActivationEnd) {
				this.mobileTransactionMenuModal.hide()
				this.merchantModeModal.hide()
			}
		})

		// Update selected account if changed in the sidebar
		this.walletService.selectedAccount$.subscribe(async acc => {
			if (this.selAccountInit) {
				this.receivableAccountModel = acc?.id ?? '0'
				this.onSelectedAccountChange(this.receivableAccountModel)
			}
			this.selAccountInit = true
		})

		this.walletService.isReceivableBlocksUpdated$.subscribe(async receivableBlockUpdate => {
			if (receivableBlockUpdate === null) {
				return
			}
			this.updateReceivableBlocks()
		})

		await this.updateReceivableBlocks()

		if (this.walletService.selectedAccount !== null) {
			// Set the account selected in the sidebar as default
			this.receivableAccountModel = this.walletService.selectedAccount.id
			this.onSelectedAccountChange(this.receivableAccountModel)
		} else if (this.accounts.length === 1) {
			// Auto-select account if it is the only account in the wallet
			this.receivableAccountModel = this.accounts[0].id
			this.onSelectedAccountChange(this.receivableAccountModel)
		}

		// Listen as new transactions come in. Ignore the latest transaction that is already present on page load.
		const latest = this.websocket.newTransactions$.getValue()
		this.websocket.newTransactions$.subscribe(async (transaction) => {
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
			this.walletService.receivableBlocks
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
									this.addressBook.getAccountName(receivableBlock.source)
									|| this.getAccountLabel(receivableBlock.source, null)
								),
								destinationAddressBookName: (
									this.addressBook.getAccountName(receivableBlock.account)
									|| this.getAccountLabel(receivableBlock.account, this.translocoService.translate('general.account'))
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
		this.notificationService.removeNotification('success-copied')

		this.mobileTransactionData = transaction
		this.mobileTransactionMenuModal.show()
	}

	getAccountLabel (accountID, defaultLabel) {
		const walletAccount = this.walletService.accounts.find(a => a.id === accountID)
		if (walletAccount == null) {
			return defaultLabel
		}
		return (this.translocoService.translate('general.account') + ' #' + walletAccount.index)
	}

	async getReceivable () {
		// clear the list of receivable blocks. Updated again with reloadBalances()
		this.receivableBlocks = []
		this.receivableBlocksForSelectedAccount = []
		this.loadingIncomingTxList = true
		await this.walletService.reloadBalances()
		this.loadingIncomingTxList = false
	}

	async nanoAmountChange () {
		if (!this.validateNanoAmount() || Number(this.amountNano) === 0) {
			this.amountFiat = ''
			this.changeQRAmount()
			return
		}
		const precision = this.settings.settings.displayCurrency === 'BTC' ? 6 : 2
		const rawAmount = Tools.convert(this.amountNano || 0, 'mnano', 'raw')
		const fiatAmount = parseFloat(Tools.convert(rawAmount, 'raw', 'mnano')) * this.price.price.lastPrice

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
		const amount = parseFloat(this.amountFiat) / this.price.price.lastPrice
		const raw = Tools.convert(amount, 'mnano', 'raw')
		const nanoRounded = parseFloat(this.util.nano.rawToMnano(raw)).toFixed(6)
		const rawRounded = this.util.nano.nanoToRaw(nanoRounded)

		this.amountNano = nanoRounded
		this.changeQRAmount(rawRounded)
		this.validateNanoAmount()
	}

	validateNanoAmount () {
		if (!this.amountNano) {
			this.validNano = true
			return true
		}
		this.validNano = this.amountNano !== '-' && (this.util.account.isValidNanoAmount(this.amountNano) || Number(this.amountNano) === 0)
		return this.validNano
	}

	validateFiatAmount () {
		if (!this.amountFiat) {
			this.validFiat = true
			return true
		}
		this.validFiat = this.util.string.isNumeric(this.amountFiat) && Number(this.amountFiat) >= 0
		return this.validFiat
	}

	onSelectedAccountChange (accountID) {
		this.selectedAccountAddressBookName = (
			this.addressBook.getAccountName(accountID)
			|| this.getAccountLabel(accountID, this.translocoService.translate('general.account'))
		)

		this.changeQRAccount(accountID)
		this.filterReceivableBlocksForDestinationAccount(accountID)
	}

	async changeQRAccount (account) {
		this.walletAccount = this.walletService.accounts.find(a => a.address === account) || null
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
		if (raw && this.util.account.isValidAmount(raw)) {
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

		const walletAccount = this.walletService.accounts.find(a => a.id === receivableBlock.destination)
		if (!walletAccount) {
			throw new Error(this.translocoService.translate('receive.unable-to-find-receiving-account'))
		}

		if (this.walletService.isLocked) {
			const wasUnlocked = await this.walletService.requestUnlock()

			if (wasUnlocked === false) {
				return
			}
		}
		receivableBlock.loading = true

		let createdReceiveBlockHash = null
		let hasShownErrorNotification = false

		try {
			createdReceiveBlockHash = await this.nanoBlock.generateReceive(walletAccount, sourceBlock, this.walletService.isLedger)
		} catch (err) {
			this.notificationService.sendError('Error receiving transaction: ' + err.message)
			hasShownErrorNotification = true
		}

		if (createdReceiveBlockHash != null) {
			receivableBlock.received = true
			this.mobileTransactionMenuModal.hide()
			this.notificationService.removeNotification('success-receive')
			this.notificationService.sendSuccess(this.translocoService.translate('receive.successfully-received-nano'), { identifier: 'success-receive' })
			// receivable has been processed, can be removed from the list
			// list also updated with reloadBalances but not if called too fast
			this.walletService.removeReceivableBlock(receivableBlock.hash)
		} else {
			if (hasShownErrorNotification === false && !this.walletService.isLedger) {
				this.notificationService.sendError(this.translocoService.translate('receive.there-was-a-problem-receiving-the-transaction-try-manually'), { length: 10000 })
			}
		}

		receivableBlock.loading = false
		this.updateReceivableBlocks() // update the list
	}

	copied () {
		this.notificationService.removeNotification('success-copied')
		this.notificationService.sendSuccess(this.translocoService.translate('general.successfully-copied-to-clipboard'), { identifier: 'success-copied' })
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

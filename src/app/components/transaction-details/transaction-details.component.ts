import { CommonModule, DatePipe, DecimalPipe } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { ActivatedRoute, ChildActivationEnd, Router, RouterLink } from '@angular/router'
import { TranslocoService } from '@jsverse/transloco'
import { ClipboardModule } from 'ngx-clipboard'
import { AmountSplitPipe, RaiPipe } from 'app/pipes'
import {
	AddressBookService,
	ApiService,
	AppSettingsService,
	NotificationService,
	WalletService
} from 'app/services'
import { NanoAccountIdComponent, NanoIdenticonComponent } from 'app/components/helpers'

@Component({
	selector: 'app-transaction-details',
	templateUrl: './transaction-details.component.html',
	styleUrls: ['./transaction-details.component.css'],
	imports: [
		AmountSplitPipe,
		ClipboardModule,
		CommonModule,
		DatePipe,
		DecimalPipe,
		NanoAccountIdComponent,
		NanoIdenticonComponent,
		RaiPipe,
		RouterLink
	]
})

export class TransactionDetailsComponent implements OnInit {
	private walletService = inject(WalletService)
	private route = inject(ActivatedRoute)
	private router = inject(Router)
	private addressBook = inject(AddressBookService)
	private api = inject(ApiService)
	private notifications = inject(NotificationService)
	private translocoService = inject(TranslocoService)

	settings = inject(AppSettingsService)

	routerSub = null
	transaction: any = {}
	hashID = ''
	blockType = ''
	loadingBlock = false
	isStateBlock = true
	isUnconfirmedBlock = false
	blockHeight = -1

	toAccountID = ''
	fromAccountID = ''
	toAddressBook = ''
	fromAddressBook = ''

	transactionJSON = ''
	showBlockData = false

	amount = 0n
	successorHash = ''

	async ngOnInit () {
		this.routerSub = this.router.events.subscribe(event => {
			if (event instanceof ChildActivationEnd) {
				// Reload the state when navigating to itself from the transactions page
				this.loadTransaction()
			}
		})
		await this.loadTransaction()
	}

	async loadTransaction () {
		const hash = this.route.snapshot.params.transaction
		let legacyFromAccount = ''

		this.toAccountID = ''
		this.fromAccountID = ''
		this.toAddressBook = ''
		this.fromAddressBook = ''
		this.transaction = {}
		this.transactionJSON = ''
		this.isUnconfirmedBlock = false
		this.blockHeight = -1
		this.showBlockData = false
		this.blockType = ''
		this.amount = 0n
		this.successorHash = ''
		this.hashID = hash

		this.loadingBlock = true
		const blockData = await this.api.blocksInfo([hash])

		if (!blockData || blockData.error || !blockData.blocks[hash]) {
			this.loadingBlock = false
			this.transaction = null
			return
		}

		const hashData = blockData.blocks[hash]
		const hashContents = JSON.parse(hashData.contents)
		hashData.contents = hashContents

		this.transactionJSON = JSON.stringify(hashData.contents, null, 4)

		this.isUnconfirmedBlock = hashData.confirmed === 'false'
		this.blockHeight = hashData.height

		const HASH_ONLY_ZEROES = '0000000000000000000000000000000000000000000000000000000000000000'

		const blockType = hashData.contents.type
		if (blockType === 'state') {
			const isOpen = (hashData.contents.previous === HASH_ONLY_ZEROES)

			if (isOpen) {
				this.blockType = 'open'
			} else {
				const prevRes = await this.api.blocksInfo([hashData.contents.previous])
				const prevData = prevRes.blocks[hashData.contents.previous]
				prevData.contents = JSON.parse(prevData.contents)
				if (!prevData.contents.balance) {
					// Previous block is not a state block.
					this.blockType = prevData.contents.type
					legacyFromAccount = prevData.source_account
				} else {
					const prevBalance = BigInt(prevData.contents.balance)
					const curBalance = BigInt(hashData.contents.balance)
					const balDifference = curBalance - prevBalance
					if (balDifference < 0n) {
						this.blockType = 'send'
					} else if (balDifference === 0n) {
						this.blockType = 'change'
					} else {
						this.blockType = 'receive'
					}
				}
			}
		} else {
			this.blockType = blockType
			this.isStateBlock = false
		}
		if (hashData.amount) {
			this.amount = BigInt(hashData.amount)
		}
		if (hashData.successor != null && hashData.successor !== HASH_ONLY_ZEROES) {
			this.successorHash = hashData.successor
		}

		this.transaction = hashData
		let fromAccount = ''
		let toAccount = ''
		switch (this.blockType) {
			case 'send':
				fromAccount = this.transaction.block_account
				toAccount = this.transaction.contents.destination || this.transaction.contents.link_as_account
				break
			case 'open':
			case 'receive':
				fromAccount = this.transaction.source_account
				toAccount = this.transaction.block_account
				break
			case 'change':
				fromAccount = this.transaction.block_account
				toAccount = this.transaction.contents.representative
				break
		}

		if (legacyFromAccount) {
			fromAccount = legacyFromAccount
		}
		this.toAccountID = toAccount
		this.fromAccountID = fromAccount
		this.fromAddressBook = (
			this.addressBook.getAccountName(fromAccount)
			|| this.getAccountLabel(fromAccount, null)
		)
		this.toAddressBook = (
			this.addressBook.getAccountName(toAccount)
			|| this.getAccountLabel(toAccount, null)
		)
		this.loadingBlock = false
	}

	getAccountLabel (accountID, defaultLabel) {
		const walletAccount = this.walletService.wallet.accounts.find(a => a.id === accountID)
		if (walletAccount == null) {
			return defaultLabel
		}
		return (this.translocoService.translate('general.account') + ' #' + walletAccount.index)
	}

	getBalanceFromHex (balance) {
		return BigInt(`0x${balance}`)
	}

	getBalanceFromDec (balance) {
		return BigInt(balance)
	}

	copied () {
		this.notifications.removeNotification('success-copied')
		this.notifications.sendSuccess(`Successfully copied to clipboard!`, { identifier: 'success-copied' })
	}
}

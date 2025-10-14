import { CommonModule, UpperCasePipe } from '@angular/common'
import { AfterViewInit, Component, OnDestroy, OnInit, effect, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService, translate } from '@jsverse/transloco'
import { NanoAddressComponent } from 'app/components/elements'
import { AmountSplitPipe, FiatPipe, RaiPipe } from 'app/pipes'
import {
	AddressBookService,
	ApiService,
	AppSettingsService,
	NotificationsService,
	PriceService,
	QrModalService,
	UtilService,
	WalletService,
} from 'app/services'
import { Tools } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import * as QRCode from 'qrcode'

export interface BalanceAccount {
	balance: bigint
	balanceFiat: number
	receivable: bigint
}

@Component({
	selector: 'app-address-book',
	templateUrl: './address-book.component.html',
	styleUrls: ['./address-book.component.css'],
	imports: [
		AmountSplitPipe,
		ClipboardModule,
		CommonModule,
		FiatPipe,
		FormsModule,
		NanoAddressComponent,
		RaiPipe,
		RouterLink,
		TranslocoDirective,
		UpperCasePipe,
	],
})
export class AddressBookComponent implements OnInit, AfterViewInit, OnDestroy {
	private router = inject(Router)
	private svcAddressBook = inject(AddressBookService)
	private svcApi = inject(ApiService)
	private svcPrice = inject(PriceService)
	private svcQrModal = inject(QrModalService)
	private svcTransloco = inject(TranslocoService)
	private svcUtil = inject(UtilService)

	svcAppSettings = inject(AppSettingsService)
	svcNotifications = inject(NotificationsService)
	svcWallet = inject(WalletService)

	activePanel = 0
	addressBook$ = this.svcAddressBook.addressBook$
	creatingNewEntry = false
	previousAddressName = ''
	newAddressAccount = ''
	newAddressName = ''
	addressBookShowQRExport = false
	addressBookShowFileExport = false
	addressBookQRExportUrl = ''
	addressBookQRExportImg = ''
	importExport = false
	newTrackBalance = false
	newTrackTransactions = false
	accounts: BalanceAccount[] = []
	totalTrackedBalance = 0n
	totalTrackedBalanceRaw = 0n
	totalTrackedBalanceFiat = 0
	totalTrackedReceivable = 0n
	get fiatPrice () { return this.svcPrice.lastPrice() }
	priceSub = null
	refreshSub = null
	showAdvancedOptions = false
	statsRefreshEnabled = true
	timeoutIdAllowingRefresh: any = null
	loadingBalances = false
	numberOfTrackedBalance = 0

	get settings () {
		return this.svcAppSettings.settings()
	}

	async ngOnInit () {
		this.svcAddressBook.loadAddressBook()
		// Detect if local wallet balance is refreshed
		effect(() => {
			if (this.svcWallet.isRefreshed()) {
				this.loadingBalances = true
				// Check if we have a local wallet account tracked and update the balances
				for (const entry of this.svcAddressBook.addressBook) {
					if (entry.trackBalance && this.accounts[entry.account]) {
						// If the account exist in the wallet, take the info from there to save on RPC calls
						const walletAccount = this.svcWallet.accounts().find((a) => a.address === entry.account)
						if (walletAccount) {
							// Subtract first so we can add back any updated amounts
							this.totalTrackedBalance -= this.accounts[entry.account].balance
							this.totalTrackedBalanceFiat -= this.accounts[entry.account].balanceFiat
							this.totalTrackedReceivable -= this.accounts[entry.account].receivable

							this.accounts[entry.account].balance = walletAccount.balance
							this.accounts[entry.account].balanceFiat = walletAccount.balanceFiat
							this.accounts[entry.account].receivable = walletAccount.receivableNano

							this.totalTrackedBalance += walletAccount.balance
							this.totalTrackedBalanceFiat += walletAccount.balanceFiat
							this.totalTrackedReceivable += this.accounts[entry.account].receivable
						}
					}
				}
				this.loadingBalances = false
			}
		})

		this.updateTrackedBalances()
	}

	ngOnDestroy () {
		if (this.priceSub) {
			this.priceSub.unsubscribe()
		}
		if (this.refreshSub) {
			this.refreshSub.unsubscribe()
		}
	}

	ngAfterViewInit () {
		// Listen for reordering events
		document.getElementById('address-book-sortable').addEventListener('moved', (e) => {
			const element = e.target as HTMLDivElement
			const elements = element.children

			const result = [].slice.call(elements)
			const datas = result.map((el) => el.dataset.account)

			this.svcAddressBook.setAddressBookOrder(datas)
			this.svcNotifications.sendSuccess(translate('address-book.updated-address-book-order'))
		})
	}

	sleep (ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	async updateTrackedBalances (refresh = false) {
		if (refresh && !this.statsRefreshEnabled) return
		this.statsRefreshEnabled = false
		if (this.timeoutIdAllowingRefresh != null) {
			clearTimeout(this.timeoutIdAllowingRefresh)
		}
		this.timeoutIdAllowingRefresh = setTimeout(() => (this.statsRefreshEnabled = true), 5000)
		this.loadingBalances = true

		// Inform html that at least one entry is tracked
		this.numberOfTrackedBalance = 0
		for (const entry of this.svcAddressBook.addressBook) {
			if (entry.trackBalance) {
				this.numberOfTrackedBalance++
			}
		}
		// No need to process if there is nothing to track
		if (this.numberOfTrackedBalance === 0) return

		this.totalTrackedBalance = 0n
		this.totalTrackedBalanceRaw = 0n
		this.totalTrackedBalanceFiat = 0
		this.totalTrackedReceivable = 0n

		// Get account balances for all account in address book not in wallet (which has tracking active)
		const accountIDsWallet = this.svcWallet.accounts().map((a) => a.address)
		const accountIDs = this.svcAddressBook.addressBook
			.filter((a) => !accountIDsWallet.includes(a.account) && a.trackBalance)
			.map((a) => a.account)
		const apiAccounts = await this.svcApi.accountsBalances(accountIDs)

		// Fetch receivable of all tracked accounts
		let receivable
		if (this.settings.minimumReceive) {
			const minAmount = this.svcUtil.nano.mnanoToRaw(this.settings.minimumReceive)
			receivable = await this.svcApi.accountsReceivableLimitSorted(accountIDs, minAmount)
		} else {
			receivable = await this.svcApi.accountsReceivableSorted(accountIDs)
		}

		// Save balances
		for (const entry of this.svcAddressBook.addressBook) {
			if (!entry.trackBalance) continue

			const balanceAccount: BalanceAccount = {
				balance: 0n,
				balanceFiat: 0,
				receivable: 0n,
			}
			// If the account exist in the wallet, take the info from there to save on RPC calls
			const walletAccount = this.svcWallet.accounts().find((a) => a.address === entry.account)
			if (walletAccount) {
				balanceAccount.balance = walletAccount.balance
				balanceAccount.balanceFiat = walletAccount.balanceFiat
				balanceAccount.receivable = walletAccount.receivable
				// Add balances from RPC data
			} else {
				balanceAccount.balance = apiAccounts.balances[entry.account].balance
				balanceAccount.balanceFiat = parseFloat(Tools.convert(balanceAccount.balance, 'raw', 'nano')) * this.fiatPrice
			}
			this.totalTrackedBalance += balanceAccount.balance
			this.totalTrackedBalanceFiat += balanceAccount.balanceFiat
			this.accounts[entry.account] = balanceAccount
		}

		// Add receivable from RPC data
		if (receivable && receivable.blocks) {
			for (const block in receivable.blocks) {
				if (!receivable.blocks.hasOwnProperty(block)) {
					continue
				}

				const targetAccount = this.accounts[block]

				if (receivable.blocks[block]) {
					let accountReceivable = 0n

					for (const hash in receivable.blocks[block]) {
						if (!receivable.blocks[block].hasOwnProperty(hash)) {
							continue
						}
						accountReceivable += receivable.blocks[block][hash].amount
					}
					if (targetAccount) {
						targetAccount.receivable = accountReceivable
						this.totalTrackedReceivable += targetAccount.receivable
					}
				}
			}
		}

		// If not already updating balances, update to get latest values from internal wallet
		if (this.svcWallet.isBalanceUpdating) {
			while (this.svcWallet.isBalanceUpdating) {
				await this.sleep(100) // Wait until update is finished
			}
		} else {
			await this.svcWallet.reloadBalances()
		}

		this.loadingBalances = false
	}

	addEntry () {
		this.previousAddressName = ''
		this.newTrackBalance = false
		this.newTrackTransactions = false
		this.creatingNewEntry = true
		this.activePanel = 1
	}

	editEntry (addressBook) {
		this.newAddressAccount = addressBook.account
		this.previousAddressName = addressBook.name
		this.newAddressName = addressBook.name
		this.newTrackBalance = addressBook.trackBalance
		this.newTrackTransactions = addressBook.trackTransactions
		this.creatingNewEntry = false
		this.activePanel = 1
		setTimeout(() => {
			document.getElementById('new-address-name').focus()
		}, 150)
	}

	async saveNewAddress () {
		if (!this.newAddressAccount || !this.newAddressName) {
			return this.svcNotifications.sendError(
				translate('address-book.account-and-name-are-required')
			)
		}

		if (this.newTrackBalance && this.numberOfTrackedBalance >= 20) {
			return this.svcNotifications.sendError(
				translate('address-book.you-can-only-track-the-balance-of-maximum-20-addresses')
			)
		}

		// Trim and remove duplicate spaces
		this.newAddressName = this.newAddressName.trim().replace(/ +/g, ' ')

		const regexp = new RegExp('^(Account|' + translate('general.account') + ') #\\d+$', 'g')
		if (regexp.test(this.newAddressName) === true) {
			return this.svcNotifications.sendError(
				translate('address-book.this-name-is-reserved-for-wallet-accounts-without-a-label')
			)
		}

		// Remove spaces and convert to nano prefix
		this.newAddressAccount = this.newAddressAccount.replace(/ /g, '').replace('xrb_', 'nano_')

		// If the name has been changed, make sure no other entries are using that name
		if (this.newAddressName !== this.previousAddressName && this.svcAddressBook.nameExists(this.newAddressName)) {
			return this.svcNotifications.sendError(
				translate('address-book.this-name-is-already-in-use-please-use-a-unique-name')
			)
		}

		// Make sure the address is valid
		const valid = this.svcUtil.account.isValidAccount(this.newAddressAccount)
		if (!valid) {
			return this.svcNotifications.sendWarning(
				translate('address-book.account-id-is-not-a-valid-account')
			)
		}

		// Store old setting
		const wasTransactionTracked = this.svcAddressBook.getTransactionTrackingById(this.newAddressAccount)

		try {
			await this.svcAddressBook.saveAddress(
				this.newAddressAccount,
				this.newAddressName,
				this.newTrackBalance,
				this.newTrackTransactions
			)
			this.svcNotifications.sendSuccess(
				translate('address-book.address-book-entry-saved-successfully')
			)
			// If this is one of our accounts, set its name and let it propagate through the app
			const walletAccount = this.svcWallet.accounts().find((a) => a.address === this.newAddressAccount)
			if (walletAccount) {
				walletAccount.addressBookName = this.newAddressName
			}

			// track account transaction (if unchanged)
			if (this.newTrackTransactions && !wasTransactionTracked) {
				this.svcWallet.trackAddress(this.newAddressAccount)
			} else if (!this.newTrackTransactions && wasTransactionTracked) {
				this.svcWallet.untrackAddress(this.newAddressAccount)
			}

			this.updateTrackedBalances()
			this.cancelNewAddress()
		} catch (err) {
			this.svcNotifications.sendError(
				translate('address-book.unable-to-save-entry', { message: err.message })
			)
		}
	}

	cancelNewAddress () {
		this.newAddressName = ''
		this.newAddressAccount = ''
		this.activePanel = 0
	}

	copied () {
		this.svcNotifications.removeNotification('success-copied')
		this.svcNotifications.sendSuccess(
			translate('address-book.account-address-copied-to-clipboard'),
			{ identifier: 'success-copied' }
		)
	}

	async deleteAddress (account) {
		try {
			this.svcAddressBook.deleteAddress(account)
			this.svcNotifications.sendSuccess(
				translate('address-book.successfully-deleted-address-book-entry')
			)
			this.svcWallet.untrackAddress(account)
			this.updateTrackedBalances()
		} catch (err) {
			this.svcNotifications.sendError(
				translate('address-book.unable-to-delete-entry', { message: err.message })
			)
		}
	}

	// open qr reader modal
	openQR (reference, type) {
		const qrResult = this.svcQrModal.openQR(reference, type)
		qrResult.then(
			(data) => {
				switch (data.reference) {
					case 'account1':
						this.newAddressAccount = data.content
						break
				}
			},
			() => { }
		)
	}

	// converts a Unicode string to a string in which
	// each 16-bit unit occupies only one byte
	toBinary (string) {
		const codeUnits = new Uint16Array(string.length)
		for (let i = 0; i < codeUnits.length; i++) {
			codeUnits[i] = string.charCodeAt(i)
		}
		return String.fromCharCode(...new Uint8Array(codeUnits.buffer))
	}

	async exportAddressBook () {
		const exportData = this.svcAddressBook.addressBook
		const base64Data = btoa(this.toBinary(JSON.stringify(exportData)))
		const exportUrl = `https://gnault.cc/import-address-book#${base64Data}`
		this.addressBookQRExportUrl = exportUrl
		this.addressBookShowFileExport = true

		if (base64Data.length <= 2260) {
			this.addressBookShowQRExport = true
			this.addressBookQRExportImg = await QRCode.toDataURL(exportUrl)
		}
	}

	exportAddressBookToFile () {
		const fileName = `Gnault-AddressBook.json`

		const exportData = this.svcAddressBook.addressBook
		this.triggerFileDownload(fileName, exportData)

		this.svcNotifications.sendSuccess(translate('address-book.address-book-export-downloaded'))
	}

	importFromFile (files) {
		if (!files.length) {
			return
		}

		const file = files[0]
		const reader = new FileReader()
		reader.onload = (event) => {
			const fileData = event.target['result'] as string
			try {
				const importData = JSON.parse(fileData)
				if (!importData.length || (!importData[0].account && !importData[0].address)) {
					return this.svcNotifications.sendError(
						translate('address-book.bad-import-data-make-sure-you-selected-a-gnault-address-book')
					)
				}

				const encoded = btoa(this.toBinary(JSON.stringify(importData)))
				this.router.navigate(['import-address-book'], { fragment: encoded })
			} catch (err) {
				this.svcNotifications.sendError(
					translate('address-book.unable-to-parse-import-data-make-sure-you-selected-the-right')
				)
			}
		}
		reader.readAsText(file)
	}

	triggerFileDownload (fileName, exportData) {
		const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' })

		// Check for iOS, which is weird with saving files
		const iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform)

		const elem = window.document.createElement('a')
		const objUrl = window.URL.createObjectURL(blob)
		if (iOS) {
			elem.href = `data:attachment/file,${JSON.stringify(exportData)}`
		} else {
			elem.href = objUrl
		}
		elem.download = fileName
		document.body.appendChild(elem)
		elem.click()
		setTimeout(function () {
			document.body.removeChild(elem)
			window.URL.revokeObjectURL(objUrl)
		}, 200)
	}
}

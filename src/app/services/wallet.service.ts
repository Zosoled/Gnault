import { Injectable, inject } from '@angular/core'
import {
	AddressBookService,
	ApiService,
	AppSettingsService,
	NanoBlockService,
	NotificationsService,
	PriceService,
	UtilService,
	WebsocketService,
	WorkPoolService,
} from 'app/services'
import { Account, Tools, Wallet, WalletType } from 'libnemo'
import { BehaviorSubject } from 'rxjs'

export type WalletKeyType = 'seed' | 'ledger' | 'privateKey' | 'expandedKey'

export interface WalletAccount {
	id: string
	frontier: string | null
	secret: any
	keyPair: any
	index: number
	balance: bigint
	receivable: bigint
	balanceFiat: number
	receivableFiat: number
	addressBookName: string | null
	receivePow: boolean
}

export interface Block {
	account: string
	hash: string
	amount: string
	source: string
}

export interface ReceivableBlockUpdate {
	account: string
	sourceHash: string
	destinationHash: string | null
	hasBeenReceived: boolean
}

export interface BaseApiAccount {
	account_version: string
	balance: string
	block_count: string
	frontier: string
	modified_timestamp: string
	open_block: string
	receivable: string
	representative: string
	representative_block: string
	weight: string
}

export interface WalletApiAccount extends BaseApiAccount {
	addressBookName?: string | null
	id?: string
	error?: string
}

const storeKey: 'Gnault-Wallet' = `Gnault-Wallet`

/**
 * Service to manage Wallet state and handle Wallet requests.
 */
@Injectable({ providedIn: 'root' })
export class WalletService {
	private svcAddressBook = inject(AddressBookService)
	private svcApi = inject(ApiService)
	private svcAppSettings = inject(AppSettingsService)
	private svcNanoBlock = inject(NanoBlockService)
	private svcNotifications = inject(NotificationsService)
	private svcPrice = inject(PriceService)
	private svcUtil = inject(UtilService)
	private svcWebsocket = inject(WebsocketService)
	private svcWorkPool = inject(WorkPoolService)

	type

	wallet?: Wallet
	balance = 0n
	receivable = 0n
	hasReceivable = false
	isBalanceUpdating = false
	isBalanceInitialized = false

	accounts: Account[] = []
	selectedAccountAddress = null
	selectedAccount = null
	selectedAccount$ = new BehaviorSubject(null)
	isLocked = false
	isLocked$ = new BehaviorSubject(false)
	passwordUpdated$ = new BehaviorSubject(false)
	isUnlockRequested$ = new BehaviorSubject(false)
	isChangePasswordRequested$ = new BehaviorSubject(false)
	receivableBlocks = []
	isReceivableBlocksUpdated$ = new BehaviorSubject(null)
	newWallet$ = new BehaviorSubject(false)
	refresh$ = new BehaviorSubject(false)

	isProcessingReceivable = false
	successfulBlocks = []
	trackedHashes = []

	constructor() {
		this.svcWebsocket.newTransactions$.subscribe(async (transaction) => {
			// Not really a new transaction
			if (!transaction) {
				return
			}
			console.log('New Transaction', transaction)
			let shouldNotify = false
			if (this.svcAppSettings.settings.minimumReceive) {
				const minAmount = this.svcUtil.nano.mnanoToRaw(this.svcAppSettings.settings.minimumReceive)
				if (BigInt(transaction.amount) > BigInt(minAmount)) {
					shouldNotify = true
				}
			} else {
				shouldNotify = true
			}

			const walletAccountIDs = this.accounts.map((a) => a.id)

			const isConfirmedIncomingTransactionForOwnWalletAccount =
				transaction.block.type === 'state' &&
				transaction.block.subtype === 'send' &&
				walletAccountIDs.includes(transaction.block.link_as_account)

			const isConfirmedSendTransactionFromOwnWalletAccount =
				transaction.block.type === 'state' &&
				transaction.block.subtype === 'send' &&
				walletAccountIDs.includes(transaction.block.account)

			const isConfirmedReceiveTransactionFromOwnWalletAccount =
				transaction.block.type === 'state' &&
				transaction.block.subtype === 'receive' &&
				walletAccountIDs.includes(transaction.block.account)

			if (isConfirmedIncomingTransactionForOwnWalletAccount === true) {
				if (shouldNotify === true) {
					if (this.isLocked && this.svcAppSettings.settings.receivableOption !== 'manual') {
						this.svcNotifications.sendWarning(`New incoming transaction - Unlock the wallet to receive`, {
							length: 10000,
							identifier: 'receivable-locked',
						})
					} else if (this.svcAppSettings.settings.receivableOption === 'manual') {
						this.svcNotifications.sendWarning(`New incoming transaction - Set to be received manually`, {
							length: 10000,
							identifier: 'receivable-locked',
						})
					}
				} else {
					console.log(
						`Found new incoming block that was below minimum receive amount: `,
						transaction.amount,
						this.svcAppSettings.settings.minimumReceive
					)
				}
				await this.processStateBlock(transaction)
			} else if (isConfirmedSendTransactionFromOwnWalletAccount === true) {
				shouldNotify = true
				await this.processStateBlock(transaction)
			} else if (isConfirmedReceiveTransactionFromOwnWalletAccount === true) {
				shouldNotify = true
			}

			// Find if the source or destination is a tracked address in the address book
			// This is a send transaction (to tracked account or from tracked account)
			if (
				(walletAccountIDs.indexOf(transaction.block.link_as_account) === -1 &&
					transaction.block.type === 'state' &&
					(transaction.block.subtype === 'send' || transaction.block.subtype === 'receive')) ||
				(transaction.block.subtype === 'change' &&
					(this.svcAddressBook.getTransactionTrackingById(transaction.block.link_as_account) ||
						this.svcAddressBook.getTransactionTrackingById(transaction.block.account)))
			) {
				if (shouldNotify || transaction.block.subtype === 'change') {
					const trackedAmount = this.svcUtil.nano.rawToMnano(transaction.amount)
					// Save hash so we can ignore duplicate messages if subscribing to both send and receive
					if (this.trackedHashes.indexOf(transaction.hash) !== -1) return // Already notified this block
					this.trackedHashes.push(transaction.hash)
					const addressLink = transaction.block.link_as_account
					const address = transaction.block.account
					const rep = transaction.block.representative
					const accountHrefLink = `<a href="/accounts/${addressLink}">${this.svcAddressBook.getAccountName(addressLink)}</a>`
					const accountHref = `<a href="/accounts/${address}">${this.svcAddressBook.getAccountName(address)}</a>`

					if (transaction.block.subtype === 'send') {
						// Incoming transaction
						if (this.svcAddressBook.getTransactionTrackingById(addressLink)) {
							this.svcNotifications.sendInfo(
								`Tracked address ${accountHrefLink} can now receive ${trackedAmount} XNO`,
								{ length: 10000 }
							)
							console.log(`Tracked incoming block to: ${address} - Ӿ${trackedAmount}`)
						}
						// Outgoing transaction
						if (this.svcAddressBook.getTransactionTrackingById(address)) {
							this.svcNotifications.sendInfo(`Tracked address ${accountHref} sent ${trackedAmount} XNO`, {
								length: 10000,
							})
							console.log(`Tracked send block from: ${address} - Ӿ${trackedAmount}`)
						}
					} else if (
						transaction.block.subtype === 'receive' &&
						this.svcAddressBook.getTransactionTrackingById(address)
					) {
						// Receive transaction
						this.svcNotifications.sendInfo(`Tracked address ${accountHref} received incoming ${trackedAmount} XNO`, {
							length: 10000,
						})
						console.log(`Tracked receive block to: ${address} - Ӿ${trackedAmount}`)
					} else if (
						transaction.block.subtype === 'change' &&
						this.svcAddressBook.getTransactionTrackingById(address)
					) {
						// Change transaction
						this.svcNotifications.sendInfo(`Tracked address ${accountHref} changed its representative to ${rep}`, {
							length: 10000,
						})
						console.log(`Tracked change block of: ${address} - Rep: ${rep}`)
					}
				} else {
					console.log(
						`Found new transaction on watch-only account that was below minimum receive amount: `,
						transaction.amount,
						this.svcAppSettings.settings.minimumReceive
					)
				}
			}

			// TODO: We don't really need to call to update balances, we should be able to balance on our own from here
			// I'm not sure about that because what happens if the websocket is disconnected and misses a transaction?
			// won't the balance be incorrect if relying only on the websocket? / Json

			const shouldReloadBalances =
				shouldNotify &&
				(isConfirmedIncomingTransactionForOwnWalletAccount ||
					isConfirmedSendTransactionFromOwnWalletAccount ||
					isConfirmedReceiveTransactionFromOwnWalletAccount)

			if (shouldReloadBalances) {
				await this.reloadBalances()
			}
		})

		this.svcAddressBook.addressBook$.subscribe((newAddressBook) => {
			this.reloadAddressBook()
		})
	}

	async processStateBlock(transaction) {
		// If we have a minimum receive, once we know the account... add the amount to wallet receivable and set receivable to true
		if (transaction.block.subtype === 'send' && transaction.block.link_as_account) {
			// This is an incoming send block, we want to perform a receive
			const walletAccount = this.accounts.find((a) => a.id === transaction.block.link_as_account)
			// Not for our wallet?
			if (!walletAccount) {
				return
			}

			const txAmount = BigInt(transaction.amount)
			let aboveMinimumReceive = true

			if (this.svcAppSettings.settings.minimumReceive) {
				const minAmount = this.svcUtil.nano.mnanoToRaw(this.svcAppSettings.settings.minimumReceive)
				aboveMinimumReceive = txAmount > BigInt(minAmount)
			}

			if (aboveMinimumReceive === true) {
				const isNewBlock = this.addReceivableBlock(walletAccount.id, transaction.hash, txAmount, transaction.account)

				if (isNewBlock === true) {
					this.receivable += txAmount
					this.hasReceivable = true
				}
			}

			await this.processReceivableBlocks()
		} else {
			// Not a send to us, which means it was a block posted by us.  We shouldnt need to do anything...
			const walletAccount = this.accounts.find((a) => a.id === transaction.block.link_as_account)
			if (!walletAccount) return // Not for our wallet?
		}
	}

	reloadAddressBook() {
		this.accounts.forEach((account) => {
			account.addressBookName = this.svcAddressBook.getAccountName(account.id)
		})
	}

	getWalletAccount(address) {
		return this.accounts.find((a) => a.address === address)
	}

	/**
	 * Retrieves wallet data from local storage and loads the last selected one.
	 *
	 * If no data is stored in local storage, tries to retrieve from IndexedDB
	 * database used by libnemo and loads the first wallet found.
	 *
	 * @returns
	 */
	async loadWallet() {
		this.resetWallet()

		const walletData = localStorage.getItem(storeKey)
		if (!walletData) {
			const wallets = await Wallet.restore()
			this.wallet = wallets[0]
			return this.wallet
		}

		const walletJson = JSON.parse(walletData)
		this.wallet = await Wallet.restore(walletJson.selectedWalletId)

		if (this.wallet.type === 'Ledger') {
			this.wallet.unlock()
		}

		debugger
		if (walletJson.accounts?.length > 0) {
			walletJson.accounts.forEach((account) => this.loadWalletAccount(account.index, account.id))
		}

		this.selectedAccountAddress = walletJson.selectedAccountAddress

		return this.wallet
	}

	// Using full list of indexes is the latest standard with back compatability with accountsIndex
	async loadImportedWallet(
		type: WalletType,
		seed: string,
		password: string,
		accountsIndex: number,
		indexes: Array<number>,
		walletType: WalletKeyType
	) {
		this.resetWallet()
		if (type === 'Ledger') {
			return
		}
		this.wallet = await Wallet.load(type, password, seed)

		if (walletType === 'seed') {
			// Old method
			if (accountsIndex > 0) {
				for (let i = 0; i < accountsIndex; i++) {
					await this.addWalletAccount(i)
				}
			} else if (indexes) {
				// New method (the promise ensures all wallets have been added before moving on)
				await Promise.all(
					indexes.map(async (i) => {
						await this.addWalletAccount(i)
					})
				)
			} else return false
		} else if (walletType === 'expandedKey') {
			this.accounts.push(await Account.load({ privateKey: seed.slice(64, 128) }, 'private'))
		} else if (walletType === 'privateKey') {
			this.accounts.push(await Account.load({ privateKey: seed.slice(0, 64) }, 'private'))
		} else {
			// invalid wallet type
			return false
		}

		await this.reloadBalances()

		if (this.wallet.accounts.length) {
			this.svcWebsocket.subscribeAccounts(this.accounts.map((a) => a.id))
		}

		return true
	}

	async generateExportData() {
		const exportData: any = {
			indexes: this.accounts.map((a) => a.index),
		}
		const backup = await Wallet.backup()
		const secret = backup.find((wallet) => wallet.id === this.wallet.id) as {
			id: string
			type: WalletType
			iv: ArrayBuffer
			salt: ArrayBuffer
			encrypted: ArrayBuffer
		}
		if (secret == null) {
			throw new Error('Failed to generate export')
		}
		Object.assign(exportData, secret)

		return exportData
	}

	generateExportUrl() {
		const exportData = this.generateExportData()
		const base64Data = Buffer.from(JSON.stringify(exportData)).toString('base64')

		return `https://gnault.cc/import-wallet#${base64Data}`
	}

	async lockWallet() {
		try {
			this.wallet.lock()

			// Remove secrets from accounts
			this.accounts.forEach((a) => {
				a.keyPair = null
				a.secret = null
			})

			this.isLocked = true
			this.isLocked$.next(true)

			await this.saveWalletExport() // Save so that a refresh gives you a locked wallet

			return true
		} catch (err) {
			return false
		}
	}

	async unlockWallet(password: string) {
		try {
			await this.wallet.unlock(password)
			this.accounts.forEach(async (a) => {
				a = await this.wallet.account(a.index)
			})

			this.isLocked = false
			this.isLocked$.next(false)

			// If there is a notification to unlock, remove it
			this.svcNotifications.removeNotification('receivable-locked')

			// Process any receivable blocks
			this.processReceivableBlocks()

			// Save so a refresh also gives you your unlocked wallet?
			await this.saveWalletExport()

			return true
		} catch (err) {
			console.warn(err)
			return false
		}
	}

	async updatePassword(password: string) {
		try {
			await this.wallet.update(password)
			this.passwordUpdated$.next(true)
			// Save so a refresh also gives you your unlocked wallet?
			await this.saveWalletExport()
			return true
		} catch (err) {
			console.warn(err)
			this.passwordUpdated$.next(false)
			return false
		}
	}

	async setWallet(password: string, wallet: Wallet) {
		this.resetWallet()
		this.wallet = wallet
		await this.wallet.unlock(password)
		password = ''
		await this.scanAccounts()
	}

	async scanAccounts() {
		const usedIndices = []

		const NAULT_ACCOUNTS_LIMIT = 20
		const ACCOUNTS_PER_API_REQUEST = 10

		const batchesCount = NAULT_ACCOUNTS_LIMIT / ACCOUNTS_PER_API_REQUEST

		// Getting accounts...
		for (let batchIdx = 0; batchIdx < batchesCount; batchIdx++) {
			const batchAccounts = await this.wallet.accounts(batchIdx, batchIdx + ACCOUNTS_PER_API_REQUEST)
			const batchAccountsArray = []
			for (let i = batchIdx; i < batchIdx + ACCOUNTS_PER_API_REQUEST; i++) {
				batchAccountsArray.push(batchAccounts[i].address)
			}

			// Checking frontiers...
			const batchResponse = await this.svcApi.accountsFrontiers(batchAccountsArray)
			if (batchResponse) {
				for (const address of Object.keys(batchResponse.frontiers)) {
					const hash = batchResponse.frontiers[address]
					if (this.svcUtil.nano.isValidHash(hash) && hash !== batchAccounts[address].publicKey) {
						usedIndices.push(batchAccounts[address].index)
					}
				}
			}
		}

		// Add accounts
		if (usedIndices.length > 0) {
			for (const index of usedIndices) {
				await this.addWalletAccount(index)
			}
		} else {
			await this.addWalletAccount(0)
		}

		// Reload balances for all accounts
		this.reloadBalances()
	}

	async createNewWallet(password: string) {
		this.resetWallet()
		this.wallet = await Wallet.create('BLAKE2b', password)
		const unlockRequest = this.wallet.unlock(password)
		password = ''
		await unlockRequest
		const { mnemonic, seed } = this.wallet
		this.addWalletAccount()
		await this.reloadBalances()
		return { mnemonic, seed }
	}

	async createLedgerWallet() {
		await this.scanAccounts()
		return this.wallet
	}

	async createWalletFromSingleKey(key: string, expanded: boolean) {
		this.resetWallet()

		const keyData = expanded ? key.slice(64, 128) : key.slice(0, 64)
		const account = await Account.load({ privateKey: keyData }, 'private')
		this.accounts.push(account)
		await this.reloadBalances()
		await this.saveWalletExport()
	}

	async createLedgerAccount(index) {
		return await this.wallet.account(index)
	}

	createKeyedAccount(index, accountBytes, accountKeyPair) {
		const accountAddress = Account.load(accountKeyPair.publicKey).address
		const addressBookName = this.svcAddressBook.getAccountName(accountAddress)

		const newAccount: WalletAccount = {
			id: accountAddress,
			frontier: null,
			secret: accountBytes,
			keyPair: accountKeyPair,
			balance: 0n,
			receivable: 0n,
			balanceFiat: 0,
			receivableFiat: 0,
			index: index,
			addressBookName,
			receivePow: false,
		}

		return newAccount
	}

	// Reset wallet to a base state, without changing reference to the main object
	resetWallet() {
		if (this.accounts?.length) {
			// Unsubscribe from old accounts
			this.svcWebsocket.unsubscribeAccounts(this.accounts.map((a) => a.id))
		}
		this.isLocked = false
		this.isLocked$.next(false)
		this.accounts = []
		this.balance = 0n
		this.receivable = 0n
		this.hasReceivable = false
		this.selectedAccountAddress = null
		this.selectedAccount = null
		this.selectedAccount$.next(null)
		this.receivableBlocks = []
	}

	get isConfigured() {
		return this.wallet != null
	}

	get isLedger() {
		return this.wallet?.type === 'Ledger'
	}

	hasReceivableTransactions() {
		return this.hasReceivable
		// if (this.appSettings.settings.minimumReceive) {
		//   return this.hasReceivable
		// } else {
		//   return this.wallet.receivableRaw > 0
		// }
	}

	reloadFiatBalances() {
		const fiatPrice = this.svcPrice.lastPrice

		this.accounts.forEach((account) => {
			account.balanceFiat = parseFloat(Tools.convert(account.balance, 'raw', 'nano')) * fiatPrice
			account.receivableFiat = parseFloat(Tools.convert(account.receivable, 'raw', 'nano')) * fiatPrice
		})
	}

	resetBalances() {
		this.balance = 0n
		this.receivable = 0n
		this.hasReceivable = false
	}

	async reloadBalances() {
		// to block two reloads to happen at the same time (websocket)
		if (this.isBalanceUpdating) return

		this.isBalanceUpdating = true
		const fiatPrice = this.svcPrice.lastPrice

		const accountIDs = this.accounts.map((a) => a.id)
		const accounts = await this.svcApi.accountsBalances(accountIDs)
		const frontiers = await this.svcApi.accountsFrontiers(accountIDs)
		// const allFrontiers = []
		// for (const account in frontiers.frontiers) {
		//   allFrontiers.push({ account, frontier: frontiers.frontiers[account] })
		// }
		// const frontierBlocks = await this.api.blocksInfo(allFrontiers.map(f => f.frontier))

		let walletBalance = 0n
		let walletReceivableInclUnconfirmed = 0n
		let walletReceivableAboveThresholdConfirmed = 0n

		if (!accounts) {
			this.resetBalances()
			this.isBalanceUpdating = false
			this.isBalanceInitialized = true
			return
		}

		this.clearReceivableBlocks()

		for (const accountID in accounts.balances) {
			if (!accounts.balances.hasOwnProperty(accountID)) continue

			const walletAccount = this.accounts.find((a) => a.id === accountID)

			if (!walletAccount) continue

			walletAccount.balanceNano = accounts.balances[accountID].balance ?? 0n
			const accountBalanceReceivableInclUnconfirmed = accounts.balances[accountID].receivable ?? 0n

			walletAccount.balanceFiat = parseFloat(Tools.convert(walletAccount.balance, 'raw', 'nano')) * fiatPrice

			const walletAccountFrontier = frontiers.frontiers?.[accountID]
			const walletAccountFrontierIsValidHash = this.svcUtil.nano.isValidHash(walletAccountFrontier)

			walletAccount.frontier = walletAccountFrontierIsValidHash === true ? walletAccountFrontier : null

			walletBalance += walletAccount.balance
			walletReceivableInclUnconfirmed += accountBalanceReceivableInclUnconfirmed
		}

		if (walletReceivableInclUnconfirmed > 0n) {
			let receivable

			if (this.svcAppSettings.settings.minimumReceive) {
				const minAmount = this.svcUtil.nano.mnanoToRaw(this.svcAppSettings.settings.minimumReceive)
				receivable = await this.svcApi.accountsReceivableLimitSorted(
					this.accounts.map((a) => a.id),
					minAmount
				)
			} else {
				receivable = await this.svcApi.accountsReceivableSorted(this.accounts.map((a) => a.id))
			}

			if (receivable && receivable.blocks) {
				for (const block in receivable.blocks) {
					if (!receivable.blocks.hasOwnProperty(block)) {
						continue
					}

					const walletAccount = this.accounts.find((a) => a.id === block)

					if (receivable.blocks[block]) {
						let accountReceivable = 0n

						for (const hash in receivable.blocks[block]) {
							if (!receivable.blocks[block].hasOwnProperty(hash)) {
								continue
							}

							const isNewBlock = this.addReceivableBlock(
								walletAccount.id,
								hash,
								receivable.blocks[block][hash].amount,
								receivable.blocks[block][hash].source
							)

							if (isNewBlock === true) {
								accountReceivable += receivable.blocks[block][hash].amount
								walletReceivableAboveThresholdConfirmed += receivable.blocks[block][hash].amount
							}
						}

						walletAccount.receivable = accountReceivable
						walletAccount.receivableFiat = parseFloat(Tools.convert(accountReceivable, 'raw', 'mnano')) * fiatPrice

						// If there is a receivable, it means we want to add to work cache as receive-threshold
						if (walletAccount.receivableNano > 0n) {
							console.log('Adding single receivable account within limit to work cache')
							// Use frontier or public key if open block
							const hash = walletAccount.frontier || walletAccount.publicKey
							// Technically should be 1/64 multiplier here but since we don't know if the receivable will be received before
							// a send or change block is made it's safer to use 1x PoW threshold to be sure the cache will work.
							// On the other hand, it may be more efficient to use 1/64 and simply let the work cache rework
							// in case a send is made instead. The typical user scenario would be to let the wallet auto receive first
							this.svcWorkPool.addWorkToCache(hash, 1 / 64)
							walletAccount.receivePow = true
						} else {
							walletAccount.receivePow = false
						}
					} else {
						walletAccount.receivable = 0n
						walletAccount.receivableFiat = 0
						walletAccount.receivePow = false
					}
				}
			}
		} else {
			// Not clearing those values to zero earlier to avoid zero values while blocks are being loaded
			for (const accountID in accounts.balances) {
				if (!accounts.balances.hasOwnProperty(accountID)) continue
				const walletAccount = this.accounts.find((a) => a.id === accountID)
				if (!walletAccount) continue
				walletAccount.receivable = 0n
				walletAccount.receivableFiat = 0
				walletAccount.receivePow = false
			}
		}

		// Make sure any frontiers are in the work pool
		// If they have no frontier, we want to use their pub key?
		const hashes = this.accounts
			.filter((account) => account.receivePow === false)
			.map((account) => account.frontier || account.publicKey)
		console.log('Adding non-receivable frontiers to work cache')
		hashes.forEach((hash) => this.svcWorkPool.addWorkToCache(hash, 1)) // use high pow here since we don't know what tx type will be next

		this.balance = walletBalance
		this.receivable = walletReceivableAboveThresholdConfirmed

		// eslint-disable-next-line
		this.hasReceivable = walletReceivableAboveThresholdConfirmed > 0n

		this.isBalanceUpdating = false
		this.isBalanceInitialized = true

		if (this.receivableBlocks.length) {
			await this.processReceivableBlocks()
		}
		this.publishBalanceRefresh()
	}

	async loadWalletAccount(accountIndex, accountID) {
		const account = await this.wallet?.account(accountIndex)
		const addressBookName = this.svcAddressBook.getAccountName(accountID)

		this.accounts.push(account)
		this.svcWebsocket.subscribeAccounts([accountID])

		return account
	}

	// Derive an account and save it locally.
	// If index is not provided, increment from greatest index currently saved
	async addWalletAccount(index?: number) {
		try {
			index ??= 0
			while (this.accounts.find((a) => a.index === index)) {
				index++
			}
			const newAccount: Account = this.isLedger
				? await this.createLedgerAccount(index)
				: await this.wallet.account(index)
			this.accounts.push(newAccount)
			this.svcWebsocket.subscribeAccounts([newAccount.id])
			await this.saveWalletExport()
			return newAccount
		} catch (err) {
			this.svcNotifications.sendWarning('Failed to load account.')
			throw err
		}
	}

	async removeWalletAccount(accountID: string) {
		const walletAccount = this.getWalletAccount(accountID)
		if (!walletAccount) throw new Error(`Account is not in wallet`)

		const walletAccountIndex = this.accounts.findIndex((a) => a.id === accountID)
		if (walletAccountIndex === -1) throw new Error(`Account is not in wallet`)

		this.accounts.splice(walletAccountIndex, 1)

		this.svcWebsocket.unsubscribeAccounts([accountID])

		// Reload the balances, save new wallet state
		await this.reloadBalances()
		await this.saveWalletExport()

		return true
	}

	async trackAddress(address: string) {
		this.svcWebsocket.subscribeAccounts([address])
		console.log('Tracking transactions on ' + address)
	}

	async untrackAddress(address: string) {
		this.svcWebsocket.unsubscribeAccounts([address])
		console.log('Stopped tracking transactions on ' + address)
	}

	addReceivableBlock(accountID, blockHash, amount, source) {
		if (this.successfulBlocks.indexOf(blockHash) !== -1) return false // Already successful with this block

		const existingHash = this.receivableBlocks.find((b) => b.hash === blockHash)

		if (existingHash) return false // Already added

		this.receivableBlocks.push({ account: accountID, hash: blockHash, amount: amount, source: source })
		this.isReceivableBlocksUpdated$.next({
			account: accountID,
			sourceHash: blockHash,
			destinationHash: null,
			hasBeenReceived: false,
		})
		this.isReceivableBlocksUpdated$.next(null)
		return true
	}

	// Remove a receivable account from the receivable list
	async removeReceivableBlock(blockHash) {
		const index = this.receivableBlocks.findIndex((b) => b.hash === blockHash)
		this.receivableBlocks.splice(index, 1)
	}

	// Clear the list of receivable blocks
	async clearReceivableBlocks() {
		this.receivableBlocks.splice(0, this.receivableBlocks.length)
	}

	sortByAmount(a, b) {
		const x = BigInt(a.amount)
		const y = BigInt(b.amount)
		return x > y ? a : b
	}

	async processReceivableBlocks() {
		if (
			this.isProcessingReceivable ||
			this.isLocked ||
			!this.receivableBlocks.length ||
			this.svcAppSettings.settings.receivableOption === 'manual'
		)
			return

		// Sort receivable by amount
		if (this.svcAppSettings.settings.receivableOption === 'amount') {
			this.receivableBlocks.sort(this.sortByAmount)
		}

		this.isProcessingReceivable = true

		const nextBlock = this.receivableBlocks[0]
		if (this.successfulBlocks.find((b) => b.hash === nextBlock.hash)) {
			return setTimeout(() => this.processReceivableBlocks(), 1500) // Block has already been processed
		}
		const walletAccount = this.getWalletAccount(nextBlock.account)
		if (!walletAccount) {
			this.isProcessingReceivable = false
			return // Dispose of the block, no matching account
		}

		const newHash = await this.svcNanoBlock.generateReceive(walletAccount, nextBlock.hash, this.isLedger)
		if (newHash) {
			if (this.successfulBlocks.length >= 15) this.successfulBlocks.shift()
			this.successfulBlocks.push(nextBlock.hash)

			const receiveAmount = parseFloat(Tools.convert(nextBlock.amount, 'raw', 'mnano'))
			this.svcNotifications.removeNotification('success-receive')
			this.svcNotifications.sendSuccess(`Successfully received ${receiveAmount.toFixed(6).toString()} XNO!`, {
				identifier: 'success-receive',
			})

			// remove after processing
			// list also updated with reloadBalances but not if called too fast
			this.removeReceivableBlock(nextBlock.hash)
			await this.reloadBalances()
			this.isReceivableBlocksUpdated$.next({
				account: nextBlock.account,
				sourceHash: nextBlock.hash,
				destinationHash: newHash,
				hasBeenReceived: true,
			})
			this.isReceivableBlocksUpdated$.next(null)
		} else {
			if (this.isLedger) {
				this.isProcessingReceivable = false
				return null // Denied to receive, stop processing
			}
			this.isProcessingReceivable = false
			return this.svcNotifications.sendError(`There was a problem receiving the transaction, try manually!`, {
				length: 10000,
			})
		}

		this.isProcessingReceivable = false

		setTimeout(() => this.processReceivableBlocks(), 1500)
	}

	/**
	 * Stores wallet data to user-specified browser storage location.
	 *
	 * If the storage location does not exist or the user does not want to save
	 * wallet data, it is removed instead.
	 */
	async saveWalletExport(): Promise<void> {
		const exportData = await this.generateWalletExport()
		const { walletStorage } = this.svcAppSettings.settings
		const storage = globalThis[walletStorage]
		storage ? storage.setItem(storeKey, JSON.stringify(exportData)) : this.removeWalletData()
	}

	removeWalletData() {
		localStorage.removeItem(storeKey)
		this.wallet.destroy()
	}

	async generateWalletExport() {
		const backup = await Wallet.backup()
		const walletData = backup.find((v) => v.id === this.wallet.id)
		const data: any = {
			...walletData,
			accounts: this.accounts.map((a) => ({ id: a.id, index: a.index })),
			selectedAccountAddress: this.selectedAccount?.address,
			locked: true,
		}
		return data
	}

	// Run an accountInfo call for each account in the wallet to get their representatives
	async getAccountsDetails(): Promise<WalletApiAccount[]> {
		return await Promise.all(
			this.accounts.map((account) =>
				this.svcApi.accountInfo(account.id).then((res) => {
					try {
						const ret = {
							...res,
							id: account.id,
							addressBookName: account.addressBookName,
						}
						return ret
					} catch {
						return null
					}
				})
			)
		)
	}

	// Subscribable event when a new wallet is created
	publishNewWallet() {
		this.newWallet$.next(true)
		this.newWallet$.next(false)
	}

	// Subscribable event when balances has been refreshed
	publishBalanceRefresh() {
		this.refresh$.next(true)
		this.refresh$.next(false)
	}

	requestUnlock() {
		this.isUnlockRequested$.next(true)
		return new Promise((resolve, reject) => {
			let subscriptionForUnlock
			let subscriptionForCancel
			const removeSubscriptions = () => {
				if (subscriptionForUnlock != null) {
					subscriptionForUnlock.unsubscribe()
				}
				if (subscriptionForCancel != null) {
					subscriptionForCancel.unsubscribe()
				}
			}
			subscriptionForUnlock = this.isLocked$.subscribe(async (isLocked) => {
				if (isLocked === false) {
					removeSubscriptions()
					resolve(true)
				}
			})
			subscriptionForCancel = this.isUnlockRequested$.subscribe(async (wasRequested) => {
				if (wasRequested === false) {
					removeSubscriptions()
					resolve(false)
				}
			})
		})
	}

	requestChangePassword() {
		this.isChangePasswordRequested$.next(true)
		return new Promise((resolve, reject) => {
			let subscriptionForUpdate
			let subscriptionForCancel

			const removeSubscriptions = () => {
				if (subscriptionForUpdate != null) {
					subscriptionForUpdate.unsubscribe()
				}
				if (subscriptionForCancel != null) {
					subscriptionForCancel.unsubscribe()
				}
			}

			subscriptionForUpdate = this.passwordUpdated$.subscribe(async (isUpdated) => {
				if (isUpdated) {
					removeSubscriptions()
					resolve(true)
				}
			})

			subscriptionForCancel = this.isChangePasswordRequested$.subscribe(async (wasRequested) => {
				if (wasRequested === false) {
					removeSubscriptions()
					resolve(false)
				}
			})
		})
	}
}

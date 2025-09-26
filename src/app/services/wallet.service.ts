import { Injectable, WritableSignal, computed, effect, inject, signal } from '@angular/core'
import {
	AddressBookService,
	ApiService,
	AppSettingsService,
	LedgerService,
	NanoBlockService,
	NotificationsService,
	PriceService,
	UtilService,
	WebsocketService,
	WorkPoolService,
} from 'app/services'
import { Account, Tools, Wallet } from 'libnemo'
import { BehaviorSubject } from 'rxjs'

export type WalletKeyType = 'seed' | 'ledger' | 'privateKey' | 'expandedKey'

export interface WalletAccount {
	address: string
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
	address?: string
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
	private svcLedger = inject(LedgerService)
	private svcNanoBlock = inject(NanoBlockService)
	private svcNotifications = inject(NotificationsService)
	private svcPrice = inject(PriceService)
	private svcUtil = inject(UtilService)
	private svcWebsocket = inject(WebsocketService)
	private svcWorkPool = inject(WorkPoolService)

	selectedWallet: WritableSignal<Wallet> = signal(null)
	wallets: Wallet[] = []
	wallets$: BehaviorSubject<Wallet[]> = new BehaviorSubject([])
	walletNames: Map<string, string> = new Map()
	balance = 0n
	receivable = 0n
	hasReceivable = false
	isBalanceUpdating = false
	isBalanceInitialized = false

	accounts: Account[] = []
	selectedAccount: WritableSignal<Account> = signal(null)
	selectedAccount$: BehaviorSubject<Account> = new BehaviorSubject(null)
	isLocked = signal(true)
	isLocked$ = new BehaviorSubject(true)
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

	get ledgerStatus () {
		return this.svcLedger.status()
	}

	constructor () {
		effect((onCleanup) => {
			const selectedWallet = this.selectedWallet()
			if (!selectedWallet) {
				return
			}
			const setLocked = () => this.isLocked.set(true)
			const setUnlocked = () => this.isLocked.set(false)
			selectedWallet.addEventListener('locked', setLocked)
			selectedWallet.addEventListener('unlocked', setUnlocked)
			onCleanup(() => {
				selectedWallet.removeEventListener('locked', setLocked)
				selectedWallet.removeEventListener('unlocked', setUnlocked)
			})
		})

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

			const walletAddresses = this.accounts.map((a) => a.address)

			const isConfirmedIncomingTransactionForOwnWalletAccount =
				transaction.block.type === 'state' &&
				transaction.block.subtype === 'send' &&
				walletAddresses.includes(transaction.block.link_as_account)

			const isConfirmedSendTransactionFromOwnWalletAccount =
				transaction.block.type === 'state' &&
				transaction.block.subtype === 'send' &&
				walletAddresses.includes(transaction.block.account)

			const isConfirmedReceiveTransactionFromOwnWalletAccount =
				transaction.block.type === 'state' &&
				transaction.block.subtype === 'receive' &&
				walletAddresses.includes(transaction.block.account)

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
				(walletAddresses.indexOf(transaction.block.link_as_account) === -1 &&
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

	async processStateBlock (transaction) {
		// If we have a minimum receive, once we know the account... add the amount to wallet receivable and set receivable to true
		if (transaction.block.subtype === 'send' && transaction.block.link_as_account) {
			// This is an incoming send block, we want to perform a receive
			const walletAccount = this.accounts.find((a) => a.address === transaction.block.link_as_account)
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
				const isNewBlock = this.addReceivableBlock(
					walletAccount.address,
					transaction.hash,
					txAmount,
					transaction.account
				)

				if (isNewBlock === true) {
					this.receivable += txAmount
					this.hasReceivable = true
				}
			}

			await this.processReceivableBlocks()
		} else {
			// Not a send to us, which means it was a block posted by us.  We shouldnt need to do anything...
			const walletAccount = this.accounts.find((a) => a.address === transaction.block.link_as_account)
			if (!walletAccount) return // Not for our wallet?
		}
	}

	reloadAddressBook () {
		this.accounts.forEach((account) => {
			account.addressBookName = this.svcAddressBook.getAccountName(account.address)
		})
	}

	getWalletAccount (address) {
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
	async loadWallet (): Promise<void> {
		this.resetWallet()

		this.wallets = await Wallet.restore()
		this.wallets$.next(this.wallets)

		const { walletStorage } = this.svcAppSettings.settings
		const storage = globalThis[walletStorage]
		const walletData = storage.getItem(storeKey)

		if (walletData) {
			const walletJson = JSON.parse(walletData)
			this.selectedWallet.set(await Wallet.restore(walletJson.selectedWalletId))
			if (this.selectedWallet().type === 'Ledger') {
				try {
					await this.selectedWallet().unlock()
				} catch { }
			}

			if (walletJson.accounts?.length > 0) {
				walletJson.accounts.forEach((a) => this.loadWalletAccount(a))
			}
		}
	}

	// Using full list of indexes is the latest standard with backward compatibility with accountsIndex
	async loadImportedWallet (
		type: string,
		password: string,
		seed: string,
		accountsIndex: number,
		indexes: Array<number>,
		walletType: WalletKeyType
	) {
		this.resetWallet()
		if (type === 'BIP-44' || type === 'BLAKE2b') {
			const wallet = await Wallet.load(type, password, seed)
			await wallet.unlock(password)
			password = ''
			this.selectedWallet.set(wallet)
			this.wallets.push(wallet)
			this.wallets$.next(this.wallets)

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

			if (this.selectedWallet().accounts.length) {
				this.svcWebsocket.subscribeAccounts(this.accounts.map((a) => a.address))
			}

			return true
		}
	}

	async generateExportData () {
		const exportData: any = {
			indexes: this.accounts.map((a) => a.index),
		}
		const backup = await Wallet.backup()
		const secret = backup.find((wallet) => wallet.id === this.selectedWallet().id) as {
			id: string
			type: string
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

	generateExportUrl () {
		const exportData = this.generateExportData()
		const base64Data = Buffer.from(JSON.stringify(exportData)).toString('base64')

		return `https://gnault.cc/import-wallet#${base64Data}`
	}

	async lockWallet (): Promise<void> {
		if (this.selectedWallet) {
			this.selectedWallet().lock()

			// Remove secrets from accounts
			this.accounts.forEach((a) => {
				a.keyPair = null
				a.secret = null
			})

			this.isLocked$.next(this.selectedWallet().isLocked)

			// Save so that a refresh gives you a locked wallet
			await this.saveWalletExport()
		}
	}

	async unlockWallet (password: string): Promise<boolean> {
		try {
			await this.selectedWallet().unlock(password)
			this.accounts.forEach(async (a) => {
				a = await this.selectedWallet().account(a.index)
			})

			this.isLocked$.next(this.selectedWallet().isLocked)

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

	async setPassword (password: string) {
		try {
			await this.selectedWallet().update(password)
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

	async setWallet (password: string, wallet: Wallet) {
		this.resetWallet()
		this.selectedWallet.set(wallet)
		await this.selectedWallet().unlock(password)
		password = ''
		await this.scanAccounts()
	}

	async scanAccounts () {
		const accounts = await this.selectedWallet().accounts(0, 20)
		const addresses: string[] = []
		for (const [_, account] of accounts) {
			addresses.push(account.address)
		}
		const usedIndexes = []
		if (addresses.length > 0) {
			const { frontiers } = await this.svcApi.accountsFrontiers(addresses)
			if (frontiers) {
				for (const address of Object.keys(frontiers)) {
					const hash = frontiers[address]
					const index = [...accounts.values()].find(a => a.address === address)
					if (this.svcUtil.nano.isValidHash(hash)) {
						usedIndexes.push(index)
					}
				}
			}
		}
		if (usedIndexes.length > 0) {
			for (const index of usedIndexes) {
				await this.addWalletAccount(index)
			}
		} else {
			await this.addWalletAccount(0)
		}
		await this.saveWalletExport()
		await this.reloadBalances()
	}

	async createNewWallet (password: string) {
		this.resetWallet()
		this.selectedWallet.set(await Wallet.create('BLAKE2b', password))
		const unlockRequest = this.selectedWallet().unlock(password)
		password = ''
		await unlockRequest
		const { mnemonic, seed } = this.selectedWallet()
		this.addWalletAccount()
		await this.reloadBalances()
		return { mnemonic, seed }
	}

	async createLedgerWallet (bluetooth: boolean) {
		this.selectedWallet.set(await Wallet.create('Ledger'))
		if (bluetooth) {
			await this.selectedWallet().config({ connection: 'ble' })
		}
		await this.selectedWallet().unlock()
		await this.addWalletAccount(0)
		await this.saveWalletExport()
		await this.reloadBalances()
	}

	async createWalletFromSingleKey (key: string, expanded: boolean) {
		this.resetWallet()

		const keyData = expanded ? key.slice(64, 128) : key.slice(0, 64)
		const account = await Account.load({ privateKey: keyData }, 'private')
		this.accounts.push(account)
		await this.reloadBalances()
		await this.saveWalletExport()
	}

	async createLedgerAccount (index) {
		return await this.selectedWallet().account(index)
	}

	createKeyedAccount (index, accountBytes, accountKeyPair) {
		const accountAddress = Account.load(accountKeyPair.publicKey).address
		const addressBookName = this.svcAddressBook.getAccountName(accountAddress)

		const newAccount: WalletAccount = {
			address: accountAddress,
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
	resetWallet () {
		if (this.accounts?.length) {
			// Unsubscribe from old accounts
			this.svcWebsocket.unsubscribeAccounts(this.accounts.map((a) => a.address))
		}
		this.isLocked$.next(true)
		this.accounts = []
		this.balance = 0n
		this.receivable = 0n
		this.hasReceivable = false
		this.selectedAccount.set(null)
		this.selectedAccount$.next(null)
		this.receivableBlocks = []
	}

	isConfigured = computed(() => this.selectedWallet() != null)
	isLedger = computed(() => this.selectedWallet()?.type === 'Ledger')

	hasReceivableTransactions () {
		return this.hasReceivable
		// if (this.appSettings.settings.minimumReceive) {
		//   return this.hasReceivable
		// } else {
		//   return this.wallet.receivableRaw > 0
		// }
	}

	resetBalances () {
		this.balance = 0n
		this.receivable = 0n
		this.hasReceivable = false
	}

	async reloadBalances () {
		// to block two reloads to happen at the same time (websocket)
		if (this.isBalanceUpdating) return

		this.isBalanceUpdating = true
		const fiatPrice = this.svcPrice.lastPrice

		const addresses = await this.accounts.map((a) => a.address)
		const accounts = await this.svcApi.accountsBalances(addresses)
		const frontiers = await this.svcApi.accountsFrontiers(addresses)
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

		for (const address in accounts.balances) {
			if (!accounts.balances.hasOwnProperty(address)) {
				continue
			}

			const walletAccount = this.accounts.find((a) => a.address === address)

			if (!walletAccount) {
				continue
			}

			walletAccount.balance = accounts.balances[address].balance ?? 0n
			const accountBalanceReceivableInclUnconfirmed = accounts.balances[address].receivable ?? 0n

			const walletAccountFrontier = frontiers.frontiers?.[address]
			const walletAccountFrontierIsValidHash = this.svcUtil.nano.isValidHash(walletAccountFrontier)

			walletAccount.frontier = walletAccountFrontierIsValidHash === true ? walletAccountFrontier : null

			walletBalance += walletAccount.balance
			walletReceivableInclUnconfirmed += accountBalanceReceivableInclUnconfirmed
		}

		if (walletReceivableInclUnconfirmed > 0n) {
			let receivable

			if (this.svcAppSettings.settings.minimumReceive) {
				const minAmount = this.svcUtil.nano.nanoToRaw(this.svcAppSettings.settings.minimumReceive)
				receivable = await this.svcApi.accountsReceivableLimitSorted(
					this.accounts.map((a) => a.address),
					minAmount
				)
			} else {
				receivable = await this.svcApi.accountsReceivableSorted(this.accounts.map((a) => a.address))
			}

			if (receivable && receivable.blocks) {
				for (const block in receivable.blocks) {
					if (!receivable.blocks.hasOwnProperty(block)) {
						continue
					}

					const walletAccount = this.accounts.find((a) => a.address === block)

					if (receivable.blocks[block]) {
						let accountReceivable = 0n

						for (const hash in receivable.blocks[block]) {
							if (!receivable.blocks[block].hasOwnProperty(hash)) {
								continue
							}

							const isNewBlock = this.addReceivableBlock(
								walletAccount.address,
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
			for (const address in accounts.balances) {
				if (!accounts.balances.hasOwnProperty(address)) continue
				const walletAccount = this.accounts.find((a) => a.address === address)
				if (!walletAccount) continue
				walletAccount.receivable = 0n
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

	async loadWalletAccount (a: any): Promise<Account> {
		const addressBookName = this.svcAddressBook.getAccountName(a.address)
		const account = Account.load({ index: a.index, publicKey: a.publicKey })
		delete a.address
		Object.assign(a, account)
		this.accounts.push(account)
		this.svcWebsocket.subscribeAccounts([account.address])
		return account
	}

	// Derive an account and save it locally.
	// If index is not provided, increment from greatest index currently saved
	async addWalletAccount (index: number = 0) {
		try {
			while (this.accounts.find((a) => a.index === index)) {
				index++
			}
			const newAccount: Account = this.isLedger
				? await this.createLedgerAccount(index)
				: await this.selectedWallet().account(index)
			if (this.accounts.some(a => a.index === index)) {
				await this.selectedWallet().refresh(this.svcAppSettings.settings.serverAPI, index)
			} else {
				this.accounts.push(newAccount)
			}
			this.svcWebsocket.subscribeAccounts([newAccount.address])
			await this.saveWalletExport()
			return newAccount
		} catch (err) {
			this.svcNotifications.sendWarning('Failed to load account.')
			throw err
		}
	}

	async removeWalletAccount (address: string) {
		const walletAccount = this.getWalletAccount(address)
		if (!walletAccount) throw new Error(`Account is not in wallet`)

		const walletAccountIndex = this.accounts.findIndex((a) => a.address === address)
		if (walletAccountIndex === -1) throw new Error(`Account is not in wallet`)

		this.accounts.splice(walletAccountIndex, 1)

		this.svcWebsocket.unsubscribeAccounts([address])

		// Reload the balances, save new wallet state
		await this.reloadBalances()
		await this.saveWalletExport()

		return true
	}

	async trackAddress (address: string) {
		this.svcWebsocket.subscribeAccounts([address])
		console.log('Tracking transactions on ' + address)
	}

	async untrackAddress (address: string) {
		this.svcWebsocket.unsubscribeAccounts([address])
		console.log('Stopped tracking transactions on ' + address)
	}

	addReceivableBlock (accountID, blockHash, amount, source) {
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
	async removeReceivableBlock (blockHash) {
		const index = this.receivableBlocks.findIndex((b) => b.hash === blockHash)
		this.receivableBlocks.splice(index, 1)
	}

	// Clear the list of receivable blocks
	async clearReceivableBlocks () {
		this.receivableBlocks.splice(0, this.receivableBlocks.length)
	}

	sortByAmount (a, b) {
		const x = BigInt(a.amount)
		const y = BigInt(b.amount)
		return x > y ? a : b
	}

	async processReceivableBlocks () {
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
	async saveWalletExport (): Promise<void> {
		const exportData = await this.generateWalletExport()
		const { walletStorage } = this.svcAppSettings.settings
		const storage = globalThis[walletStorage]
		storage ? storage.setItem(storeKey, JSON.stringify(exportData)) : this.removeWalletData()
	}

	removeWalletData () {
		localStorage.removeItem(storeKey)
		this.selectedWallet().destroy()
	}

	async generateWalletExport () {
		const backup = await Wallet.backup()
		const walletData = backup.find((v) => v.id === this.selectedWallet().id)
		const data: any = {
			...walletData,
			selectedWalletId: this.selectedWallet().id,
			accounts: this.accounts.map((a) => a.toJSON()),
			selectedAccountAddress: this.selectedAccount().address,
			locked: true,
		}
		return data
	}

	// Run an accountInfo call for each account in the wallet to get their representatives
	async getAccountsDetails (): Promise<WalletApiAccount[]> {
		return await Promise.all(
			this.accounts.map((account) =>
				this.svcApi.accountInfo(account.address).then((res) => {
					try {
						const ret = {
							...res,
							address: account.address,
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
	publishNewWallet () {
		this.newWallet$.next(true)
		this.newWallet$.next(false)
	}

	// Subscribable event when balances has been refreshed
	publishBalanceRefresh () {
		this.refresh$.next(true)
		this.refresh$.next(false)
	}

	async requestUnlock (): Promise<boolean> {
		if (this.isLedger()) {
			await this.selectedWallet().unlock()
			return this.isLocked()
		}
		this.isUnlockRequested$.next(true)
		return new Promise((resolve): void => {
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
			subscriptionForUnlock = this.isLocked$.subscribe((isLocked) => {
				if (isLocked === false) {
					removeSubscriptions()
					resolve(false)
				}
			})
			subscriptionForCancel = this.isUnlockRequested$.subscribe((wasRequested) => {
				if (wasRequested === false) {
					removeSubscriptions()
					resolve(false)
				}
			})
		})
	}

	requestChangePassword () {
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

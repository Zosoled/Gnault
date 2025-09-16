import Transport from '@ledgerhq/hw-transport'
import { ipcMain } from 'electron'
import { Wallet } from 'libnemo'
import * as rx from 'rxjs'

const STATUS_CODES = {
	SECURITY_STATUS_NOT_SATISFIED: 0x6982,
	CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
	INVALID_SIGNATURE: 0x6a81,
	CACHE_MISS: 0x6a82,
}

const LedgerStatus = {
	NOT_CONNECTED: 'not-connected',
	LOCKED: 'locked',
	READY: 'ready',
}

export interface LedgerData {
	status: string
	nano: any | null
	transport: Transport | null
}

/**
 * This class is close to a clone of the LedgerService for web, but it
 * talks to the USB device directly and relays messages over Electron IPC
 */
export class LedgerService {
	wallet: Wallet
	waitTimeout = 30000
	pollInterval = 5000
	pollingLedger = false
	queryingLedger = false
	ledgerStatus$ = new rx.Subject()
	ledgerMessage$ = new rx.Subject()
	ledger: LedgerData = {
		status: LedgerStatus.NOT_CONNECTED,
		nano: null,
		transport: null,
	}

	// Reset connection to the ledger device, update the status
	resetLedger () {
		this.wallet.lock()
		this.ledgerStatus$.next(this.wallet.isLocked)
	}

	// Try connecting to the ledger device and sending a command to it
	async loadLedger (bluetooth = false) {
		try {
			this.wallet = await Wallet.create('Ledger')
			if (bluetooth) {
				await this.wallet.config({ connection: 'ble' })
			}
		} catch (err) {
			console.error('`Error loading transport', err)
			this.setLedgerStatus(err.message ?? err)
			this.resetLedger()
			return false
		}

		let resolved = false

		setTimeout(() => {
			if (resolved || this.ledger.status === LedgerStatus.READY) return
			this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, `Ledger device not detected`)
			this.resetLedger()
			resolved = true
			return false
		}, 3000)

		// Attempt to load account 0 - which confirms the app is unlocked and ready
		try {
			const accountDetails = await this.getLedgerAccount(0)
			this.setLedgerStatus(LedgerStatus.READY, `Ledger device ready`)
			resolved = true

			if (!this.pollingLedger) {
				this.pollingLedger = true
				this.pollLedgerStatus()
			}

			return true
		} catch (err) {
			console.log(err)
			if (err.statusCode === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED) {
				this.setLedgerStatus(LedgerStatus.LOCKED, `Ledger device locked`)
			}
		}

		return false
	}

	async getLedgerAccount (accountIndex: number) {
		try {
			this.queryingLedger = true
			const account = await this.wallet.account(accountIndex)
			this.queryingLedger = false

			this.ledgerMessage$.next({ event: 'account-details', data: Object.assign({ accountIndex }, account) })
		} catch (err) {
			this.queryingLedger = false

			const data = {
				error: true,
				errorMessage: typeof err === 'string' ? err : err.message,
			}
			this.ledgerMessage$.next({ event: 'account-details', data: Object.assign({ accountIndex }, data) })

			if (err.statusCode === STATUS_CODES.CONDITIONS_OF_USE_NOT_SATISFIED) {
				// This means they simply denied it...

				return // We won't reset the ledger status in this instance
			}

			console.error(data.errorMessage)
			this.resetLedger() // Apparently ledger not working?
			throw err
		}
	}

	async cacheBlock (accountIndex, cacheData) {
		try {
			this.queryingLedger = true
			const cacheResponse = await this.wallet.sign(accountIndex, null, cacheData)
			this.queryingLedger = false

			this.ledgerMessage$.next({ event: 'cache-block', data: Object.assign({ accountIndex }, cacheResponse) })
		} catch (err) {
			this.queryingLedger = false

			const data = {
				error: true,
				errorMessage: typeof err === 'string' ? err : err.message,
			}
			this.ledgerMessage$.next({ event: 'cache-block', data: Object.assign({ accountIndex }, data) })

			this.resetLedger() // Apparently ledger not working?
		}
	}

	async signBlock (accountIndex, blockData) {
		try {
			this.queryingLedger = true
			const signResponse = await this.wallet.sign(accountIndex, blockData)
			this.queryingLedger = false

			this.ledgerMessage$.next({ event: 'sign-block', data: Object.assign({ accountIndex }, signResponse) })
		} catch (err) {
			this.queryingLedger = false

			const data = {
				error: true,
				errorMessage: typeof err === 'string' ? err : err.message,
			}
			this.ledgerMessage$.next({ event: 'sign-block', data: Object.assign({ accountIndex }, data) })

			this.resetLedger() // Apparently ledger not working?
		}
	}

	setLedgerStatus (status, statusText = '') {
		this.ledger.status = status
		this.ledgerStatus$.next({ status: this.ledger.status, statusText })
	}

	pollLedgerStatus () {
		if (!this.pollingLedger) return
		setTimeout(async () => {
			await this.checkLedgerStatus()
			this.pollLedgerStatus()
		}, this.pollInterval)
	}

	async checkLedgerStatus () {
		if (this.ledger.status !== LedgerStatus.READY) return
		if (this.queryingLedger) return // Already querying ledger, skip this iteration

		try {
			await this.getLedgerAccount(0)
			this.setLedgerStatus(LedgerStatus.READY)
		} catch (err) {
			if (err.statusCode === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED) {
				this.setLedgerStatus(LedgerStatus.LOCKED, `Ledger device locked`)
			} else {
				this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, `Ledger Disconnected: ${err.message || err}`)
			}
			this.pollingLedger = false
		}
	}
}

let sendingWindow = null

// Create a copy of the ledger service and register listeners with the browser window
export function initialize () {
	console.log('Ledger service initializing')
	const Ledger = new LedgerService()

	// When the observable emits a new status, send it to the browser window
	Ledger.ledgerStatus$.subscribe((status) => {
		if (!sendingWindow) return
		sendingWindow.send('ledger', { event: 'ledger-status', data: status })
	})

	// When the observable emits a new message, send it to the browser window
	Ledger.ledgerMessage$.subscribe((newMessage) => {
		if (!sendingWindow) return
		sendingWindow.send('ledger', newMessage)
	})

	// Listen for new messages from the browser window and dispatch accordingly
	ipcMain.on('ledger', (event, data) => {
		console.log(`Got ledger message?!`, data)
		sendingWindow = event.sender
		if (!data || !data.event) return
		switch (data.event) {
			case 'get-ledger-status':
				Ledger.loadLedger(data.data.bluetooth)
				break
			case 'account-details':
				Ledger.getLedgerAccount(data.data.accountIndex || 0)
				break
			case 'cache-block':
				data.data.cacheData.signature = data.data.signature
				Ledger.cacheBlock(data.data.accountIndex, data.data.cacheData)
				break
			case 'sign-block':
				Ledger.signBlock(data.data.accountIndex, data.data.blockData)
				break
		}
	})
}

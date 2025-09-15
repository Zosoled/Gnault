import { Injectable, inject } from '@angular/core'
import Transport from '@ledgerhq/hw-transport'
import TransportBLE from '@ledgerhq/hw-transport-web-ble'
import TransportHID from '@ledgerhq/hw-transport-webhid'
import TransportUSB from '@ledgerhq/hw-transport-webusb'
import { ApiService, AppSettingsService, DesktopService } from 'app/services'
import { environment } from 'environments/environment'
import { Block, Ledger, Rpc } from 'libnemo'
import { Subject } from 'rxjs'

export const STATUS_CODES = {
	SECURITY_STATUS_NOT_SATISFIED: 0x6982,
	CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
	INVALID_SIGNATURE: 0x6a81,
	CACHE_MISS: 0x6a82,
}

export const LedgerStatus = {
	NOT_CONNECTED: 'not-connected',
	LOCKED: 'locked',
	READY: 'ready',
}

export interface LedgerData {
	status: string
	nano: any | null
	transport: Transport | null
}

export interface LedgerLog {
	type: string
	message?: string
	data?: any
	id: string
	date: Date
}

const zeroBlock = '0000000000000000000000000000000000000000000000000000000000000000'

@Injectable({ providedIn: 'root' })
export class LedgerService {
	private api = inject(ApiService)
	private desktop = inject(DesktopService)
	private appSettings = inject(AppSettingsService)

	waitTimeout = 30000
	walletPrefix = `44'/165'/`
	pollInterval = 5000
	pollingLedger = false

	// isDesktop = true
	isDesktop = environment.desktop
	queryingDesktopLedger = false

	supportsWebHID = false
	supportsWebUSB = false
	supportsBluetooth = false
	supportsUSB = false

	transportMode: 'USB' | 'HID' | 'Bluetooth'
	DynamicTransport: typeof TransportUSB | typeof TransportHID | typeof TransportBLE

	ledgerStatus$: Subject<string> = new Subject()
	desktopMessage$ = new Subject()

	constructor () {
		const appSettings = this.appSettings

		if (this.isDesktop) {
			this.configureDesktop()
		} else {
			this.checkBrowserSupport().then(() => {
				if (appSettings.getAppSetting('ledgerReconnect') === 'bluetooth') {
					this.enableBluetoothMode(true)
				}
			})
		}
	}

	// Scraps binding to any existing transport/nano object
	resetLedger () {
		setTimeout(async () => {
			const hidDevices = await globalThis.navigator.hid.getDevices()
			for (const device of hidDevices) {
				if (device.vendorId === Ledger.UsbVendorId) {
					device.forget()
				}
			}
			const usbDevices = await globalThis.navigator.usb.getDevices()
			for (const device of usbDevices) {
				if (device.vendorId === Ledger.UsbVendorId) {
					device.forget()
				}
			}
		})
	}

	/**
	 * Prepare the main listener for events from the desktop client.
	 * Dispatches new messages via the main Observables
	 */
	configureDesktop () {
		this.desktop.connect()
		this.desktop.on('ledger', (event, message) => {
			if (!message || !message.event) return
			switch (message.event) {
				case 'account-details':
				case 'cache-block':
				case 'sign-block':
					this.desktopMessage$.next(message)
					break
			}
		})
		this.supportsUSB = true
		this.supportsBluetooth = true
	}

	/**
	 * Check which transport protocols are supported by the browser
	 */
	async checkBrowserSupport () {
		await Promise.all([
			TransportHID.isSupported().then((supported) => (this.supportsWebHID = supported)),
			TransportUSB.isSupported().then((supported) => (this.supportsWebUSB = supported)),
			TransportBLE.isSupported().then((supported) => (this.supportsBluetooth = supported)),
		])
		this.supportsUSB = this.supportsWebHID || this.supportsWebUSB
	}

	/**
	 * Detect the optimal USB transport protocol for the current browser and OS
	 */
	detectUsbTransport () {
		if (this.supportsWebUSB) {
			// Prefer WebUSB
			this.transportMode = 'USB'
			this.DynamicTransport = TransportUSB
		} else {
			// Fallback to WebHID
			this.transportMode = 'HID'
			this.DynamicTransport = TransportHID
		}
	}

	/**
	 * Enable or disable bluetooth communication, if supported
	 * @param enabled   The bluetooth enabled state
	 */
	enableBluetoothMode (enabled: boolean) {
		if (this.supportsBluetooth && enabled) {
			this.transportMode = 'Bluetooth'
			this.DynamicTransport = TransportBLE
		} else {
			this.detectUsbTransport()
		}
	}

	/**
	 * Get the next response coming from the desktop client for a specific event/filter
	 * @param eventType
	 * @param {any} filterFn
	 * @returns {Promise<any>}
	 */
	async getDesktopResponse (eventType, filterFn?) {
		return new Promise((resolve, reject) => {
			const sub = this.desktopMessage$.subscribe(
				(response: any) => {
					// Listen to all desktop messages until one passes our filters
					if (response.event !== eventType) {
						return // Not the event we want.
					}

					if (filterFn) {
						const shouldSkip = filterFn(response.data) // This function should return boolean
						if (!shouldSkip) return // This is not the message the subscriber wants
					}

					sub.unsubscribe() // This is a message we want, safe to unsubscribe to further messages now.

					if (response.data && response.data.error === true) {
						return reject(new Error(response.data.errorMessage)) // Request failed!
					}

					resolve(response.data)
				},
				(err) => {
					console.log(`Desktop message got error!`, err)
					reject(err)
				}
			)
		})
	}

	async getLedgerAccountDesktop (accountIndex, showOnScreen) {
		if (this.queryingDesktopLedger) {
			throw new Error(`Already querying desktop device, please wait`)
		}
		this.queryingDesktopLedger = true

		this.desktop.send('ledger', { event: 'account-details', data: { accountIndex, showOnScreen } })

		try {
			const details = await this.getDesktopResponse('account-details', (a) => a.accountIndex === accountIndex)
			this.queryingDesktopLedger = false

			return details
		} catch (err) {
			this.queryingDesktopLedger = false
			throw err
		}
	}

	async updateCacheDesktop (accountIndex, cacheData, signature) {
		if (this.queryingDesktopLedger) {
			throw new Error(`Already querying desktop device, please wait`)
		}
		this.queryingDesktopLedger = true

		this.desktop.send('ledger', { event: 'cache-block', data: { accountIndex, cacheData, signature } })

		try {
			const details = await this.getDesktopResponse('cache-block', (a) => a.accountIndex === accountIndex)
			this.queryingDesktopLedger = false

			return details
		} catch (err) {
			this.queryingDesktopLedger = false
			throw new Error(`Error caching block: ${err.message}`)
		}
	}

	async signBlockDesktop (accountIndex, blockData) {
		if (this.queryingDesktopLedger) {
			throw new Error(`Already querying desktop device, please wait`)
		}
		this.queryingDesktopLedger = true

		this.desktop.send('ledger', { event: 'sign-block', data: { accountIndex, blockData } })

		try {
			const details = await this.getDesktopResponse('sign-block', (a) => a.accountIndex === accountIndex)
			this.queryingDesktopLedger = false

			return details
		} catch (err) {
			this.queryingDesktopLedger = false
			throw new Error(`Error signing block: ${err.message}`)
		}
	}

	/**
	 * Main ledger loading function. Can be called multiple times to attempt a reconnect.
	 * @param {boolean} hideNotifications
	 * @returns {Promise<any>}
	 */
	async loadLedger (hideNotifications = false) {
		try {
			const status = await Ledger.connect()
			this.ledgerStatus$.next(status)
		} catch (err) {
			this.ledgerStatus$.next(err.message)
		}
	}
	// async loadLedger(hideNotifications = false) {

	//   return new Promise(async (resolve, reject) => {

	//     // Desktop is handled completely differently.  Send a message for status instead of setting anything up
	//     if (this.isDesktop) {
	//       if (!this.desktop.send('ledger', { event: 'get-ledger-status', data: { bluetooth: this.transportMode === 'Bluetooth' } })) {
	//         reject(new Error(`Electron\'s IPC was not loaded`))
	//       }

	//       // Any response will be handled by the configureDesktop() function, which pipes responses into this observable
	//       const sub = this.ledgerStatus$.subscribe(newStatus => {
	//         if (newStatus.status === LedgerStatus.READY) {
	//           resolve(true)
	//         } else if (newStatus.statusText.includes('No compatible USB Bluetooth 4.0 device found') || newStatus.statusText.includes('Could not start scanning')) {
	//           this.supportsBluetooth = false
	//           reject(newStatus.statusText)
	//         } else {
	//           reject(new Error(newStatus.statusText || `Unable to load desktop Ledger device`))
	//         }
	//         sub.unsubscribe()
	//       }, reject)
	//       return
	//     }

	//     if (!this.ledger.transport) {

	//       // If in USB mode, detect best transport option
	//       if (this.transportMode !== 'Bluetooth') {
	//         this.detectUsbTransport()
	//         this.appSettings.setAppSetting('ledgerReconnect', 'usb')
	//       } else {
	//         this.appSettings.setAppSetting('ledgerReconnect', 'bluetooth')
	//       }

	//       try {
	//         await this.loadTransport()
	//       } catch (err) {
	//         if (err.name !== 'TransportOpenUserCancelled') {
	//           console.log(`Error loading ${this.transportMode} transport `, err)
	//           this.ledger.status = LedgerStatus.NOT_CONNECTED
	//           this.ledgerStatus$.next({ status: this.ledger.status, statusText: `Unable to load Ledger transport: ${err.message || err}` })
	//           if (!hideNotifications) {
	//             this.notifications.sendWarning(`Ledger connection failed. Make sure your Ledger is unlocked.  Restart the nano app on your Ledger if the error persists`)
	//           }
	//         }
	//         this.resetLedger()
	//         resolve(false)
	//       }
	//     }

	//     if (!this.ledger.transport || !this.ledger.nano) {
	//       return resolve(false)
	//     }

	//     let resolved = false

	//     // Set up a timeout when things are not ready
	//     setTimeout(() => {
	//       if (resolved) return
	//       console.log(`Timeout expired, sending not connected`)
	//       this.ledger.status = LedgerStatus.NOT_CONNECTED
	//       this.ledgerStatus$.next({ status: this.ledger.status, statusText: `Unable to detect Nano Ledger application (Timeout)` })
	//       if (!hideNotifications) {
	//         this.notifications.sendWarning(`Unable to connect to the Ledger device.  Make sure it is unlocked and the nano application is open`)
	//       }
	//       resolved = true
	//       return resolve(false)
	//     }, 10000)

	//     // Try to load the app config
	//     try {
	//       const ledgerConfig = await this.ledger.nano.getAppConfiguration()
	//       resolved = true

	//       if (!ledgerConfig) return resolve(false)
	//     } catch (err) {
	//       console.log(`App config error: `, err)
	//       this.ledger.status = LedgerStatus.NOT_CONNECTED
	//       this.ledgerStatus$.next({ status: this.ledger.status, statusText: `Unable to load Nano App configuration: ${err.message || err}` })
	//       if (err.statusText === 'HALTED') {
	//         this.resetLedger()
	//       }
	//       if (!hideNotifications && !resolved) {
	//         this.notifications.sendWarning(`Unable to connect to the Ledger device.  Make sure your Ledger is unlocked.  Restart the nano app on your Ledger if the error persists`)
	//       }
	//       resolved = true
	//       return resolve(false)
	//     }

	//     // Attempt to load account 0 - which confirms the app is unlocked and ready
	//     try {
	//       const accountDetails = await this.getLedgerAccount(0)
	//       this.ledger.status = LedgerStatus.READY
	//       this.ledgerStatus$.next({ status: this.ledger.status, statusText: `Nano Ledger application connected` })

	//       if (!this.pollingLedger) {
	//         this.pollingLedger = true
	//         this.pollLedgerStatus()
	//       }
	//     } catch (err) {
	//       console.log(`Error on account details: `, err)
	//       if (err.statusCode === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED) {
	//         this.ledger.status = LedgerStatus.LOCKED
	//         if (!hideNotifications) {
	//           this.notifications.sendWarning(`Ledger device locked.  Unlock and open the nano application`)
	//         }
	//       }
	//     }

	//     resolve(true)
	//   }).catch(err => {
	//     console.log(`error when loading ledger `, err)
	//     if (!hideNotifications) {
	//       const errmsg = typeof err === 'string'
	//         ? err
	//         : err.message
	//       this.notifications.sendWarning(`Error loading Ledger device: ${errmsg}`, { length: 6000 })
	//     }

	//     return null
	//   })

	// }

	async updateCache (accountIndex, blockHash) {
		if (Ledger.status !== 'CONNECTED') {
			await this.loadLedger() // Make sure ledger is ready
		}
		if (!this.isDesktop) {
			return await Ledger.updateCache(accountIndex, blockHash, new Rpc(this.appSettings.settings.serverAPI))
		}
		const blockResponse = await this.api.blocksInfo([blockHash])
		const blockData = blockResponse.blocks[blockHash]
		if (!blockData) throw new Error(`Unable to load block data`)
		blockData.contents = JSON.parse(blockData.contents)
		const { account, balance, representative, previous, link, signature } = blockData.contents

		const cacheData = new Block(account, balance, previous, representative)
			.change(link)
			.sign(signature)

		if (this.isDesktop) {
			return await this.updateCacheDesktop(accountIndex, cacheData, blockData.contents.signature)
		} else {
			return await Ledger.updateCache(accountIndex, cacheData)
		}
	}

	async updateCacheOffline (accountIndex, blockData) {
		if (Ledger.status !== 'CONNECTED') {
			await this.loadLedger()
		}

		const { balance, representative, previous, link, signature } = blockData

		const cacheData = new Block(zeroBlock, balance, previous, representative)
			.change(link)
			.sign(signature)

		if (this.isDesktop) {
			return await this.updateCacheDesktop(accountIndex, cacheData, blockData.signature)
		} else {
			return await Ledger.updateCache(accountIndex, cacheData)
		}
	}

	async signBlock (accountIndex: number, blockData: any) {
		if (Ledger.status !== 'CONNECTED') {
			await this.loadLedger()
		}
		const { previousBlock, representative, balance, recipient, sourceBlock } = blockData
		const block = new Block(zeroBlock, balance, previousBlock, representative)
		if (sourceBlock) {
			block.receive(sourceBlock, 0)
		} else if (recipient) {
			block.send(recipient, 0)
		} else {
			block.change(representative)
		}
		if (this.isDesktop) {
			return await this.signBlockDesktop(accountIndex, blockData)
		} else {
			return await Ledger.sign(accountIndex, block)
		}
	}

	async getLedgerAccount (accountIndex: number, showOnScreen = false) {
		if (this.isDesktop) {
			return await this.getLedgerAccountDesktop(accountIndex, showOnScreen)
		} else {
			return await Ledger.account(accountIndex, showOnScreen)
		}
	}

	pollLedgerStatus () {
		if (!this.pollingLedger) return
		setTimeout(async () => {
			if (!this.pollingLedger) return
			await this.checkLedgerStatus()
			this.pollLedgerStatus()
		}, this.pollInterval)
	}

	async checkLedgerStatus () {
		if (Ledger.status !== 'CONNECTED') {
			return
		}
		const status = await Ledger.connect()
		this.ledgerStatus$.next(status)
	}
}

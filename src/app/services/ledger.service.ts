import { Injectable, inject } from '@angular/core'
import { default as Transport } from '@ledgerhq/hw-transport'
import { default as TransportBLE } from '@ledgerhq/hw-transport-web-ble'
import { default as TransportHID } from '@ledgerhq/hw-transport-webhid'
import { default as TransportUSB } from '@ledgerhq/hw-transport-webusb'
import { AppSettingsService, DesktopService } from 'app/services'
import { environment } from 'environments/environment'
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
		if (this.isDesktop) {
			this.configureDesktop()
		}
	}

	/**
	 * Prepare the main listener for events from the desktop client.
	 * Dispatches new messages via the main Observables
	 */
	configureDesktop () {
		this.desktop.on('ledger', (event, message) => {
			switch (message?.event) {
				case 'account-details':
				case 'cache-block':
				case 'sign-block':
					this.desktopMessage$.next(message)
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

	async signBlockDesktop (accountIndex, blockData): Promise<string> {
		if (this.queryingDesktopLedger) {
			throw new Error(`Already querying desktop device, please wait`)
		}
		this.queryingDesktopLedger = true

		this.desktop.send('ledger', { event: 'sign-block', data: { accountIndex, blockData } })

		try {
			const details = await this.getDesktopResponse('sign-block', (a) => a.accountIndex === accountIndex)
			this.queryingDesktopLedger = false

			return details as string
		} catch (err) {
			this.queryingDesktopLedger = false
			throw new Error(`Error signing block: ${err.message}`)
		}
	}
}

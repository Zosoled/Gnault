import { Injectable, WritableSignal, inject, signal } from '@angular/core'
import { TranslocoService, getBrowserCultureLang, getBrowserLang } from '@jsverse/transloco'

export type WalletStore = 'localStorage' | 'none'
export type PoWSource = 'client' | 'custom' | 'server'
export type LedgerConnectionType = 'usb' | 'bluetooth'

interface AppSettings {
	language: string
	denomination: string
	walletStorage: string
	displayCurrency: string
	defaultRepresentative: string | null
	lockOnClose: number
	lockInactivityMinutes: number
	powSource: PoWSource
	customWorkServer: string
	receivableOption: string
	serverName: string
	serverAPI: string | null
	serverWS: string | null
	serverAuth: string | null
	minimumReceive: string | null
	walletVersion: number | null
	theme: string
	identiconsStyle: string
}

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
	private svcTransloco = inject(TranslocoService)

	private storeKey: 'Gnault-AppSettings' = 'Gnault-AppSettings'

	settings: WritableSignal<AppSettings> = signal({
		language: null,
		denomination: 'nano',
		walletStorage: 'localStorage',
		displayCurrency: 'USD',
		defaultRepresentative: null,
		lockOnClose: 1,
		lockInactivityMinutes: 30,
		powSource: 'server',
		customWorkServer: '',
		receivableOption: 'amount',
		serverName: 'random',
		serverAPI: null,
		serverWS: null,
		serverAuth: null,
		minimumReceive: '0.000001',
		walletVersion: 1,
		theme: 'dark',
		identiconsStyle: 'nanoidenticons',
	})
	serverOptions = [
		{
			name: 'Random',
			value: 'random',
			api: null,
			ws: null,
			auth: null,
			shouldRandom: false,
		},
		{
			name: 'Rainstorm City',
			value: 'rainstorm',
			api: 'https://rainstorm.city/api',
			ws: 'wss://rainstorm.city/websocket',
			auth: null,
			shouldRandom: true,
		},
		{
			name: 'NanOslo',
			value: 'nanoslo',
			api: 'https://nanoslo.0x.no/proxy',
			ws: 'wss://nanoslo.0x.no/websocket',
			auth: null,
			shouldRandom: false, // BLOCKED 2025-09-25 as not currently working
		},
		{
			name: 'SomeNano',
			value: 'somenano',
			api: 'https://node.somenano.com/proxy',
			ws: 'wss://node.somenano.com/websocket',
			auth: null,
			shouldRandom: true,
		},
		{
			name: 'SpyNano (New Node - Use with caution)',
			value: 'spynano',
			api: 'https://node.spynano.org/proxy',
			ws: 'wss://node.spynano.org/websocket',
			auth: null,
			shouldRandom: false,
		},
		{
			name: 'Custom',
			value: 'custom',
			api: null,
			ws: null,
			auth: null,
			shouldRandom: false,
		},
		{
			name: 'Offline Mode',
			value: 'offline',
			api: null,
			ws: null,
			auth: null,
			shouldRandom: false,
		},
	]

	// Simplified list for comparison in other classes
	knownApiEndpoints = this.serverOptions.reduce(
		(acc, server) => {
			if (!server.api) return acc
			acc.push(server.api.replace(/https?:\/\//g, ''))
			return acc
		},
		['node.somenano.com']
	)

	loadAppSettings () {
		const settings: AppSettings = JSON.parse(localStorage.getItem(this.storeKey) ?? '{}')
		if (settings.language == null) {
			const browserCultureLang = getBrowserCultureLang()
			const browserLang = getBrowserLang()
			const availableLangs = this.svcTransloco.getAvailableLangs()
			if (availableLangs.some((lang) => lang['id'] === browserCultureLang)) {
				settings.language = browserCultureLang
			} else if (availableLangs.some((lang) => lang['id'] === browserLang)) {
				settings.language = browserLang
			} else {
				settings.language = this.svcTransloco.getDefaultLang()
			}
			console.log('No language configured, setting to: ' + settings.language)
			console.log('Browser culture language: ' + browserCultureLang)
			console.log('Browser language: ' + browserLang)
		}
		this.settings.set(Object.assign(this.settings(), settings))
		this.loadServerSettings()
	}

	loadServerSettings () {
		const settings = this.settings()
		const matchingServerOption = this.serverOptions.find(({ value }) => value === settings.serverName)
		if (settings.serverName === 'random' || !matchingServerOption) {
			const availableServers = this.serverOptions.filter((server) => server.shouldRandom)
			const randomServerOption = availableServers[Math.floor(Math.random() * availableServers.length)]
			console.log('SETTINGS: Random', randomServerOption)

			settings.serverAPI = randomServerOption.api
			settings.serverWS = randomServerOption.ws
			settings.serverName = 'random'
		} else if (settings.serverName === 'custom') {
			console.log('SETTINGS: Custom')
		} else if (settings.serverName === 'offline') {
			console.log('SETTINGS: Offline Mode')
			settings.serverName = matchingServerOption.value
			settings.serverAPI = matchingServerOption.api
			settings.serverWS = matchingServerOption.ws
		} else {
			console.log('SETTINGS: Found', matchingServerOption)
			settings.serverName = matchingServerOption.value
			settings.serverAPI = matchingServerOption.api
			settings.serverWS = matchingServerOption.ws
		}
		this.settings.set(Object.assign(this.settings(), settings))
	}

	saveAppSettings () {
		localStorage.setItem(this.storeKey, JSON.stringify(this.settings()))
	}

	getAppSetting (key) {
		return this.settings()[key] || null
	}

	setAppSetting (key, value) {
		this.settings.update(current => ({ ...current, [key]: value }))
		this.saveAppSettings()
	}

	setAppSettings (settingsObject) {
		for (const key in settingsObject) {
			if (!settingsObject.hasOwnProperty(key)) continue
			this.setAppSetting(key, settingsObject[key])
		}
		this.saveAppSettings()
	}

	clearAppSettings () {
		localStorage.removeItem(this.storeKey)
		this.settings.set({
			language: 'en',
			denomination: 'nano',
			walletStorage: 'localStorage',
			displayCurrency: 'USD',
			defaultRepresentative: null,
			lockOnClose: 1,
			lockInactivityMinutes: 30,
			powSource: 'server',
			customWorkServer: '',
			receivableOption: 'amount',
			serverName: 'random',
			serverAPI: null,
			serverWS: null,
			serverAuth: null,
			minimumReceive: '0.000001',
			walletVersion: 1,
			theme: 'dark',
			identiconsStyle: 'nanoidenticons',
		})
	}
}

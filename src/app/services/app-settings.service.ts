import { Injectable, WritableSignal, inject, signal } from '@angular/core'
import { TranslocoService, getBrowserCultureLang, getBrowserLang } from '@jsverse/transloco'

export type WalletStore = 'localStorage' | 'none'
export type LedgerConnectionType = 'usb' | 'bluetooth'
export type NanoServer = {
	name: string
	shouldRandom: boolean
	api?: string
	ws?: string
	auth?: string
}
export type NanoServers = {
	[key: string]: NanoServer
}

interface AppSettings {
	customWorkServer: string
	defaultRepresentative: string | null
	denomination: string
	displayCurrency: string
	inactivityPeriod: number
	identiconsStyle: string
	language: string
	minimumReceive: bigint
	powSource: 'client' | 'custom' | 'server'
	receivableOption: string
	server: string
	serverAuth: string | null
	serverAPI: string | null
	serverWS: string | null
	theme: string
	walletVersion: number | null
}

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
	private svcTransloco = inject(TranslocoService)

	readonly storeKey: 'Gnault-AppSettings' = 'Gnault-AppSettings'

	settings: WritableSignal<AppSettings> = signal({
		customWorkServer: '',
		defaultRepresentative: null,
		denomination: 'nano',
		displayCurrency: 'USD',
		identiconsStyle: 'nanoidenticons',
		inactivityPeriod: 300,
		language: null,
		minimumReceive: 10n ** 24n,
		powSource: 'client',
		receivableOption: 'amount',
		server: 'random',
		serverAuth: null,
		serverAPI: null,
		serverWS: null,
		theme: 'dark',
		walletVersion: 1,
	})

	servers: NanoServers = {
		rainstorm: {
			name: 'Rainstorm City',
			shouldRandom: true,
			api: 'https://rainstorm.city/api',
			ws: 'wss://rainstorm.city/websocket',
		},
		nanoslo: {
			name: 'NanOslo',
			shouldRandom: true,
			api: 'https://nanoslo.0x.no/proxy',
			ws: 'wss://nanoslo.0x.no/websocket',
		},
		somenano: {
			name: 'SomeNano',
			shouldRandom: true,
			api: 'https://node.somenano.com/proxy',
			ws: 'wss://node.somenano.com/websocket',
		},
		spynano: {
			name: 'SpyNano (New Node - Use with caution)',
			shouldRandom: false,
			api: 'https://node.spynano.org/proxy',
			ws: 'wss://node.spynano.org/websocket',
		},
		xnopay: {
			name: 'XNOPay (New Node - Use with caution)',
			shouldRandom: false,
			api: 'https://uk1.public.xnopay.com/proxy',
			ws: 'wss://uk1.public.xnopay.com/ws',
		},
		random: {
			name: 'Random',
			shouldRandom: false,
		},
		custom: {
			name: 'Custom',
			shouldRandom: false,
		},
		offline: {
			name: 'Offline',
			shouldRandom: false,
		},
	}

	get storage (): Storage | null {
		const match = document.cookie.match(/storage=([^;]+)/)?.[1]
		if (match == null) {
			document.cookie = `storage=localStorage; max-age=31536000; path=/`
			return this.storage
		}
		if (match === 'sessionStorage') return sessionStorage
		if (match === 'localStorage') return localStorage
		return null
	}
	set storage (value: 'localStorage' | 'sessionStorage' | 'none') {
		const prevApi = this.storage
		const nextApi = globalThis[value]
		document.cookie = `storage=${value}; max-age=31536000; path=/`
		const data = Object.entries(prevApi ?? {})
		localStorage.clear()
		sessionStorage.clear()
		for (const [key, value] of data) {
			nextApi?.setItem?.(key, value)
		}
	}

	loadAppSettings () {
		const item = this.storage?.getItem(this.storeKey) ?? '{}'
		const settings = JSON.parse(item)
		settings.inactivityPeriod = Number(settings.inactivityPeriod ?? this.settings().inactivityPeriod)
		settings.minimumReceive = BigInt(settings.minimumReceive ?? this.settings().minimumReceive)
		settings.walletVersion = Number(settings.walletVersion ?? this.settings().walletVersion)
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
		const matchedServer = this.servers[settings.server]

		if (settings.server === 'random' || !matchedServer) {
			const availableServers = Object.values(this.servers).filter(({ shouldRandom: n }) => n)
			const random = Math.floor(Math.random() * availableServers.length)
			const randomServer = availableServers[random]
			console.log('SETTINGS: Random', randomServer)
			settings.serverAPI = randomServer.api
			settings.serverWS = randomServer.ws
			settings.server = 'random'

		} else if (settings.server === 'custom') {
			console.log('SETTINGS: Custom')

		} else if (settings.server === 'offline') {
			console.log('SETTINGS: Offline Mode')
			settings.serverAPI = matchedServer.api
			settings.serverWS = matchedServer.ws

		} else {
			console.log('SETTINGS: Found', matchedServer)
			settings.serverAPI = matchedServer.api
			settings.serverWS = matchedServer.ws
		}

		this.settings.set(Object.assign(this.settings(), settings))
	}

	saveAppSettings () {
		this.storage?.setItem(this.storeKey, JSON.stringify(this.settings(), (_, v) => typeof v === 'bigint' ? v.toString() : v))
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
			customWorkServer: '',
			defaultRepresentative: null,
			denomination: 'nano',
			displayCurrency: 'USD',
			inactivityPeriod: 300,
			identiconsStyle: 'nanoidenticons',
			language: 'en',
			minimumReceive: 10n ** 24n,
			powSource: 'client',
			receivableOption: 'amount',
			server: 'random',
			serverAuth: null,
			serverAPI: null,
			serverWS: null,
			theme: 'dark',
			walletVersion: 1,
		})
	}
}

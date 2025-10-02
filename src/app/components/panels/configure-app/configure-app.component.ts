import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, OnInit, Renderer2, Signal, signal, untracked, WritableSignal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { translateSignal, TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import {
	AddressBookService,
	ApiService,
	AppSettingsService,
	NinjaService,
	NodeService,
	NotificationsService,
	PowService,
	PriceService,
	QrModalService,
	RepresentativeService,
	UtilService,
	WalletService,
	WebsocketService,
	WorkPoolService,
} from 'app/services'
import { BehaviorSubject } from 'rxjs'

@Component({
	selector: 'app-configure-app',
	templateUrl: './configure-app.component.html',
	styleUrls: ['./configure-app.component.css'],
	imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslocoDirective],
})
export class ConfigureAppComponent implements OnInit {
	private renderer = inject(Renderer2)
	private svcAddressBook = inject(AddressBookService)
	private svcApi = inject(ApiService)
	private svcAppSettings = inject(AppSettingsService)
	private svcNinja = inject(NinjaService)
	private svcNode = inject(NodeService)
	private svcNotifications = inject(NotificationsService)
	private svcQrModal = inject(QrModalService)
	private svcPow = inject(PowService)
	private svcPrice = inject(PriceService)
	private svcRepresentative = inject(RepresentativeService)
	private svcTransloco = inject(TranslocoService)
	private svcUtil = inject(UtilService)
	private svcWallet = inject(WalletService)
	private svcWebsocket = inject(WebsocketService)
	private svcWorkPool = inject(WorkPoolService)

	get settings () {
		return this.svcAppSettings.settings()
	}
	get wallet () {
		return this.svcWallet.selectedWallet()
	}

	languages = computed(() => {
		return this.svcTransloco.getAvailableLangs() as [{ id: string; label: string }]
	})
	selectedLanguage = signal(this.svcAppSettings.settings().language ?? this.languages()[0].id)
	selectedLanguageChanged = effect(() => {
		this.svcTransloco.setActiveLang(this.selectedLanguage())
		this.settings.language = this.selectedLanguage()
		this.svcAppSettings.saveAppSettings()
	})

	private currenciesCustomized = [
		{
			value: 'BCH',
			name: 'BCH - Bitcoin Cash',
		},
		{
			value: 'BITS',
			name: 'BITS - Bitcoin (bits)',
		},
		{
			value: 'BNB',
			name: 'BNB - Binance Coin',
		},
		{
			value: 'BTC',
			name: 'BTC - Bitcoin',
		},
		{
			value: 'DOT',
			name: 'DOT - Polkadot',
		},
		{
			value: 'EOS',
			name: 'EOS - EOS',
		},
		{
			value: 'ETH',
			name: 'ETH - Ethereum',
		},
		{
			value: 'LINK',
			name: 'LINK - Chainlink',
		},
		{
			value: 'LTC',
			name: 'LTC - Litecoin',
		},
		{
			value: 'SATS',
			name: 'SATS - Bitcoin (satoshis)',
		},
		{
			value: 'SOL',
			name: 'SOL - Solana',
		},
		{
			value: 'VEF',
			name: 'VEF - Venezuelan Bolívar (historical)',
		},
		{
			value: 'XAG',
			name: 'XAG - Silver (Troy Ounce)',
		},
		{
			value: 'XAU',
			name: 'XAU - Gold (Troy Ounce)',
		},
		{
			value: 'XLM',
			name: 'XLM - Stellar',
		},
		{
			value: 'XRP',
			name: 'XRP - XRP',
		},
		{
			value: 'YFI',
			name: 'YFI - yearn.finance',
		},
	]
	/**
	 * Populates currency settings with up-to-date list of abbreviations and
	 * names based on user locale.
	 */
	currencies = computed(() => {
		const availableCurrencies = this.svcPrice.currencies()
		const list = [...this.currenciesCustomized]
		for (const currency of availableCurrencies) {
			if (list.every(c => c.value !== currency)) {
				const lang = this.selectedLanguage()
				const currencyName = currency.length === 3
					? new Intl.DisplayNames([lang], { type: 'currency' }).of(currency)
					: currency
				list.push({ value: currency, name: `${currency.toUpperCase()} - ${currencyName}` })
			}
		}
		return list.sort((a, b) => a.name.localeCompare(b.name))
	})
	selectedCurrency = signal(this.settings.displayCurrency ?? 'USD')
	selectedCurrencyChanged = effect(() => {
		this.settings.displayCurrency = this.selectedCurrency()
		this.svcAppSettings.saveAppSettings()
	})

	defaultTranslated = translateSignal('general.default')
	/**
	 * Displays nano in different units of measure.
	 */
	denominations = computed(() => {
		return [
			{
				value: 'nyano',
				name: 'Nyano - 10²⁴ raw',
			},
			{
				value: 'pico',
				name: 'Pico - 10²⁷ raw',
			},
			{
				value: 'nano',
				name: `Nano - 10³⁰ raw (${this.defaultTranslated()})`,
			},
			{
				value: 'knano',
				name: 'Knano - 10³³ raw',
			},
			{
				value: 'mnano',
				name: 'Mnano - 10³⁶ raw',
			},
			{
				value: 'rai',
				name: 'Rai - 10²⁴ raw',
			},
			{
				value: 'krai',
				name: 'Krai - 10²⁷ raw',
			},
			{
				value: 'mrai',
				name: 'Mrai - 10³⁰ raw',
			},
		]
	})
	selectedDenomination = signal(this.settings.denomination ?? 'nano')
	selectedDenominationChanged = effect(() => {
		this.settings.denomination = this.selectedDenomination()
		this.svcAppSettings.saveAppSettings()
	})

	/**
	 * Applies styling to the entire application.
	 */
	themes = [
		{
			value: 'dark',
			name: translateSignal('configure-app.themes.dark'),
		},
		{
			value: 'light',
			name: translateSignal('configure-app.themes.light'),
		},
	]
	selectedTheme = signal(this.settings.theme ?? 'dark')
	selectedThemeChanged = effect(() => {
		if (this.selectedTheme() === 'dark') {
			this.renderer.addClass(document.body, 'dark-mode')
			this.renderer.removeClass(document.body, 'light-mode')
		} else {
			this.renderer.addClass(document.body, 'light-mode')
			this.renderer.removeClass(document.body, 'dark-mode')
		}
		this.settings.theme = this.selectedTheme()
		this.svcAppSettings.saveAppSettings()
	})

	/**
	 * Distinguishes accounts with visually engaging icons.
	 */
	identicons = [
		{
			value: 'none',
			name: translateSignal('configure-app.identicon-options.none'),
		},
		{
			value: 'nanoidenticons',
			name: translateSignal('configure-app.identicon-options.nanoidenticons-by-keerifox'),
		},
		{
			value: 'natricon',
			name: translateSignal('configure-app.identicon-options.natricon-by-appditto'),
		},
	]
	selectedIdenticon = signal(this.settings.identiconsStyle ?? 'none')
	selectedIdenticonChanged = effect(() => {
		this.settings.identiconsStyle = this.selectedIdenticon()
		this.svcAppSettings.saveAppSettings()
	})

	inactivityPeriods = [
		{
			value: '60',
			name: translateSignal('configure-app.identicon-options.1-minute'),
		},
		{
			value: '300',
			name: translateSignal('configure-app.identicon-options.x-minutes', { minutes: 5 }),
		},
		{
			value: '900',
			name: translateSignal('configure-app.identicon-options.x-minutes', { minutes: 15 }),
		},
		{
			value: '1800',
			name: translateSignal('configure-app.identicon-options.x-minutes', { minutes: 30 }),
		},
		{
			value: '3600',
			name: translateSignal('configure-app.identicon-options.1-hour'),
		},
	]
	selectedInactivityPeriod = signal(this.settings.inactivityPeriod ?? '5')
	walletNotConfiguredTranslated = translateSignal('accounts.wallet-is-not-configured')
	selectedInactivityPeriodFirstRun = true
	selectedInactivityPeriodChanged = effect(async () => {
		const walletNotConfiguredTranslated = this.walletNotConfiguredTranslated()
		const selectedInactivityPeriod = this.selectedInactivityPeriod()
		if (this.selectedInactivityPeriodFirstRun) {
			this.selectedInactivityPeriodFirstRun = false
			return
		}
		const wallet = untracked(() => this.svcWallet.selectedWallet())
		if (!wallet) {
			this.svcNotifications.sendError(walletNotConfiguredTranslated)
			return
		}
		if (wallet.isLocked) {
			await this.svcWallet.requestUnlock()
		}
		if (!wallet.isLocked) {
			try {
				await wallet.config({ timeout: Number(selectedInactivityPeriod) })
			} catch (err) {
				console.warn(err, err.cause)
				this.svcNotifications.sendError(err?.message ?? err)
				return
			}
			this.settings.inactivityPeriod = selectedInactivityPeriod
			this.svcAppSettings.saveAppSettings()
		}
	})

	/**
	 * Saves non-sensitive appplication data in domain-specific local storage or tab-specific session storage.
	 */
	storageOptions = [
		{
			value: 'localStorage',
			name: translateSignal('configure-app.storage-options.browser-local-storage'),
		},
		{
			value: 'sessionStorage',
			name: translateSignal('configure-app.storage-options.browser-local-storage'),
		},
		{
			value: 'none',
			name: translateSignal('configure-app.storage-options.none'),
		},
	]
	selectedStorage = signal(this.settings.walletStorage ?? 'localStorage')
	selectedStorageChanged = effect(() => {
		this.settings.walletStorage = this.selectedStorage()
		this.svcAppSettings.saveAppSettings()
	})

	powSources: { name: Signal<string>; value: 'client' | 'custom' | 'server' }[] = [
		{
			value: 'server',
			name: translateSignal('configure-app.pow-options.external-selected-server'),
		},
		{
			value: 'custom',
			name: translateSignal('configure-app.pow-options.external-custom-server'),
		},
		{
			value: 'client',
			name: translateSignal('configure-app.pow-options.internal-client'),
		},
	]
	selectedPowSource = signal(this.settings.powSource ?? 'server')
	selectedPowSourceChanged = effect(() => {
		this.settings.powSource = this.selectedPowSource()
		this.svcAppSettings.saveAppSettings()
	})

	getRemotePowOptionName () {
		if (this.selectedServer === 'random' || this.selectedServer === 'offline') {
			return this.powSources[0].name()
		}
		const selectedServerOption = this.svcAppSettings.serverOptions.find((d) => d.value === this.selectedServer)
		if (!selectedServerOption) {
			return this.powSources[0].name()
		}
		return this.powSources[0].name() + ' (' + selectedServerOption.name + ')'
	}

	receivableOptions = [
		{
			value: 'amount',
			name: translateSignal('configure-app.receivable-options.automatic-largest-amount-first'),
		},
		{
			value: 'date',
			name: translateSignal('configure-app.receivable-options.automatic-oldest-transaction-first'),
		},
		{
			value: 'manual',
			name: translateSignal('configure-app.receivable-options.manual'),
		},
	]
	selectedReceivableOption = this.receivableOptions[0].value

	serverOptions = []
	selectedServer = null

	defaultRepresentative = null
	representativeResults$ = new BehaviorSubject([])
	showRepresentatives = false
	representativeListMatch = ''
	repStatus = null
	representativeList = []

	serverAPI = null
	serverAPIUpdated = null
	serverWS = null
	serverAuth = null
	minimumReceive = null

	nodeBlockCount = null
	nodeUnchecked = null
	nodeCemented = null
	nodeUncemented = null
	peersStakeReq = null
	peersStakeTotal = null
	nodeVendor = null
	nodeNetwork = null
	statsRefreshEnabled = true
	shouldRandom = null

	customWorkServer = ''

	showServerValues = () => this.selectedServer && this.selectedServer !== 'random' && this.selectedServer !== 'offline'
	showStatValues = () => this.selectedServer && this.selectedServer !== 'offline'
	showServerConfigs = () => this.selectedServer && this.selectedServer === 'custom'

	async ngOnInit () {
		await this.loadFromSettings()
		this.updateNodeStats()
		setTimeout(() => this.populateRepresentativeList(), 500)
	}

	onCheckboxInput (signal: WritableSignal<boolean>, e: Event) {
		const input = e.target as HTMLInputElement
		signal.set(input.checked)
	}

	onNumberInput (signal: WritableSignal<number>, e: Event) {
		const input = e.target as HTMLInputElement
		signal.set(input.valueAsNumber)
	}

	onSelectInput (signal: WritableSignal<string>, e: Event) {
		const input = e.target as HTMLSelectElement
		signal.set(input.value)
	}

	onTextInput (signal: WritableSignal<string>, e: Event) {
		const input = e.target as HTMLInputElement
		signal.set(input.value)
	}

	async populateRepresentativeList () {
		// add trusted/regular local reps to the list
		const localReps = this.svcRepresentative.getSortedRepresentatives()
		this.representativeList.push(...localReps.filter((rep) => !rep.warn))

		if (this.serverAPI) {
			const verifiedReps = await this.svcNinja.recommendedRandomized()

			// add random recommended reps to the list
			for (const representative of verifiedReps) {
				const temprep = {
					id: representative.account,
					name: representative.alias,
				}

				this.representativeList.push(temprep)
			}
		}

		// add untrusted local reps to the list
		this.representativeList.push(...localReps.filter((rep) => rep.warn))
	}

	async updateNodeStats (refresh = false) {
		if (
			!this.serverAPIUpdated ||
			(this.serverAPIUpdated !== this.settings.serverAPI && this.selectedServer === 'random')
		) {
			return
		}
		// refresh is not enabled
		if (refresh && !this.statsRefreshEnabled) {
			return
		}
		// Offline mode selected
		if (this.selectedServer === 'offline') {
			return
		}
		this.statsRefreshEnabled = false

		try {
			const blockCount = await this.svcApi.blockCount()
			this.nodeBlockCount = Number(blockCount.count).toLocaleString('en-US')
			this.nodeUnchecked = Number(blockCount.unchecked).toLocaleString('en-US')
			this.nodeCemented = Number(blockCount.cemented).toLocaleString('en-US')
			this.nodeUncemented = Number(blockCount.count - blockCount.cemented).toLocaleString('en-US')
		} catch {
			console.warn('Failed to get node stats: block count')
		}

		try {
			const quorumData = await this.svcApi.confirmationQuorum()
			this.peersStakeReq = Number(this.svcUtil.nano.rawToMnano(quorumData?.quorum_delta)).toLocaleString('en-US') ?? null
			this.peersStakeTotal =
				Number(this.svcUtil.nano.rawToMnano(quorumData?.peers_stake_total)).toLocaleString('en-US') ?? null
		} catch {
			console.warn('Failed to get node stats: confirmation quorum')
		}

		try {
			const version = await this.svcApi.version()
			this.nodeVendor = version.node_vendor
			this.nodeNetwork = version.network
		} catch {
			console.warn('Failed to get node stats: version')
		}

		setTimeout(() => (this.statsRefreshEnabled = true), 5000)
	}

	async loadFromSettings () {
		const matchingPowOption = this.powSources.find((d) => d.value === this.settings.powSource)
		this.selectedPowSource.set(matchingPowOption?.value ?? this.powSources[0].value)

		this.customWorkServer = this.settings.customWorkServer

		const matchingReceivableOption = this.receivableOptions.find((d) => d.value === this.settings.receivableOption)
		this.selectedReceivableOption = matchingReceivableOption?.value ?? this.receivableOptions[0].value

		this.serverOptions = this.svcAppSettings.serverOptions
		this.selectedServer = this.settings.serverName
		this.serverAPI = this.settings.serverAPI
		this.serverAPIUpdated = this.serverAPI
		this.serverWS = this.settings.serverWS
		this.serverAuth = this.settings.serverAuth

		this.minimumReceive = this.settings.minimumReceive
		this.defaultRepresentative = this.settings.defaultRepresentative
		if (this.defaultRepresentative) {
			this.validateRepresentative()
		}
	}

	async updateDisplaySettings () {
		this.svcAppSettings.setAppSetting('identiconsStyle', this.selectedIdenticon)
	}

	async updateWalletSettings () {
		const newStorage = this.selectedStorage()
		const resaveWallet = this.settings.walletStorage !== newStorage

		// ask for user confirmation before clearing the wallet cache
		if (resaveWallet && newStorage === this.storageOptions[1].value) {
			const UIkit = window['UIkit']
			const saveSeedWarning = `<br><b style="font-size: 18px;">${translateSignal('reset-wallet.before-continuing-make-sure-you-have-saved-the-nano-seed')}</b><br><br><span style="font-size: 18px;"><b>${translateSignal('reset-wallet.you-will-not-be-able-to-recover-the-funds-without-a-backup')}</b></span></p><br>`
			try {
				await UIkit.modal.confirm(
					`<p class="uk-alert uk-alert-danger"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span>
					<span style="font-size: 18px;">
					${translateSignal('configure-app.you-are-about-to-disable-storage-of-all-wallet-data-which')}
					</span><br>
					${this.svcWallet.isConfigured() ? saveSeedWarning : ''}`
				)
			} catch (err) {
				// pressing cancel, reset storage setting and interrupt
				this.selectedStorage.set(this.storageOptions[0].value)
				this.svcNotifications.sendInfo(
					translateSignal('configure-app.switched-back-to-browser-local-storage-for-the-wallet-data'),
					{ length: 10000 }
				)
				return
			}
		}

		let newPoW = this.selectedPowSource
		const receivableOption = this.selectedReceivableOption
		let minReceive = null
		if (this.svcUtil.account.isValidNanoAmount(this.minimumReceive)) {
			minReceive = this.minimumReceive
		}

		// reload receivable if threshold changes or if receive priority changes from manual to auto
		let reloadReceivable =
			this.settings.minimumReceive !== this.minimumReceive ||
			(receivableOption !== 'manual' && receivableOption !== this.settings.receivableOption)

		if (this.defaultRepresentative && this.defaultRepresentative.length) {
			const valid = this.svcUtil.account.isValidAccount(this.defaultRepresentative)
			if (!valid) {
				return this.svcNotifications.sendWarning(
					translateSignal('configure-app.default-representative-is-not-a-valid-account')
				)
			}
		}

		if (this.settings.powSource !== newPoW()) {
			// Cancel ongoing PoW if the old method was local PoW
			if (this.settings.powSource === 'client') {
				// Check if work is ongoing, and cancel it
				if (this.svcPow.cancelAllPow(false)) {
					reloadReceivable = true // force reload balance => re-work pow
				}
			}
		}

		// reset work cache so that the new PoW will be used but only if larger than before
		if (newPoW() === 'client') {
			// if user accept to reset cache
			if (await this.clearWorkCache()) {
				reloadReceivable = true // force reload balance => re-work pow
			}
		}

		const newSettings = {
			walletStore: newStorage,
			lockInactivityMinutes: Number(this.selectedInactivityPeriod),
			powSource: newPoW,
			customWorkServer: this.customWorkServer,
			receivableOption: receivableOption,
			minimumReceive: minReceive,
			defaultRepresentative: this.defaultRepresentative || null,
		}

		this.svcAppSettings.setAppSettings(newSettings)
		this.svcNotifications.sendSuccess(
			translateSignal('configure-app.app-wallet-settings-successfully-updated')
		)

		if (resaveWallet) {
			this.svcWallet.saveWalletExport() // If swapping the storage engine, resave the wallet
		}
		if (reloadReceivable) {
			this.svcWallet.reloadBalances()
		}
	}

	async updateServerSettings () {
		const newSettings = {
			serverName: this.selectedServer,
			serverAPI: null,
			serverWS: null,
			serverAuth: null,
		}

		// Custom... do some basic validation
		if (this.serverAPI != null && this.serverAPI.trim().length > 1) {
			if (this.serverAPI.startsWith('https://') || this.serverAPI.startsWith('http://')) {
				newSettings.serverAPI = this.serverAPI
			} else {
				return this.svcNotifications.sendWarning(
					translateSignal('configure-app.custom-api-server-has-an-invalid-address')
				)
			}
		}

		if (this.serverWS != null && this.serverWS.trim().length > 1) {
			if (this.serverWS.startsWith('wss://') || this.serverWS.startsWith('ws://')) {
				newSettings.serverWS = this.serverWS
			} else {
				return this.svcNotifications.sendWarning(
					translateSignal('configure-app.custom-update-server-has-an-invalid-address')
				)
			}
		}

		if (this.serverAuth != null && this.serverAuth.trim().length > 1) {
			newSettings.serverAuth = this.serverAuth
		}

		this.svcAppSettings.setAppSettings(newSettings)
		this.svcAppSettings.loadAppSettings()

		this.svcNotifications.sendSuccess(
			translateSignal('configure-app.server-settings-successfully-updated')
		)

		this.svcNode.node.status = false // Directly set node to offline since API url changed.  Status will get set by reloadBalances

		// Reload balances which triggers an api check + reconnect to websocket server
		await this.svcWallet.reloadBalances()
		this.svcWebsocket.forceReconnect()
		// this is updated after setting server to random and doing recheck of wallet balance
		this.serverAPIUpdated = this.settings.serverAPI
		this.serverAPI = this.serverAPIUpdated
		this.statsRefreshEnabled = true
		this.updateNodeStats()
	}

	searchRepresentatives () {
		if (this.defaultRepresentative && !this.svcUtil.account.isValidAccount(this.defaultRepresentative)) this.repStatus = 0
		else this.repStatus = null

		this.showRepresentatives = true
		const search = this.defaultRepresentative || ''

		const matches = this.representativeList
			.filter((a) => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
			// remove duplicate accounts
			.filter((item, pos, self) => this.svcUtil.array.findWithAttr(self, 'id', item.id) === pos)
			.slice(0, 5)

		this.representativeResults$.next(matches)
	}

	selectRepresentative (rep) {
		this.showRepresentatives = false
		this.defaultRepresentative = rep
		this.searchRepresentatives()
		this.validateRepresentative()
	}

	async validateRepresentative () {
		setTimeout(() => (this.showRepresentatives = false), 400)
		if (this.defaultRepresentative) this.defaultRepresentative = this.defaultRepresentative.replace(/ /g, '')

		if (!this.defaultRepresentative) {
			this.representativeListMatch = ''
			return
		}

		const rep = this.svcRepresentative.getRepresentative(this.defaultRepresentative)
		const ninjaRep = await this.svcNinja.getAccount(this.defaultRepresentative)

		if (rep) {
			this.representativeListMatch = rep.name
		} else if (ninjaRep) {
			this.representativeListMatch = ninjaRep.alias
		} else {
			this.representativeListMatch = ''
		}
	}

	// When changing the Server Config option, prefill values
	serverConfigChange (newServer) {
		const custom = this.serverOptions.find((c) => c.value === newServer)
		if (custom) {
			this.serverAPI = custom.api
			this.serverAPIUpdated = null
			this.serverWS = custom.ws
			this.serverAuth = custom.auth
			this.shouldRandom = custom.shouldRandom
				? translateSignal('general.yes')
				: translateSignal('general.no')
		}

		// reset server stats until updated
		this.nodeBlockCount = null
		this.nodeUnchecked = null
		this.nodeCemented = null
		this.nodeUncemented = null
		this.peersStakeReq = null
		this.peersStakeTotal = null
		this.nodeVendor = null
		this.nodeNetwork = null
		this.statsRefreshEnabled = newServer !== 'random'
	}

	async clearWorkCache () {
		const UIkit = window['UIkit']
		try {
			await UIkit.modal.confirm(
				'<p style="text-align: center;">' +
				translateSignal('configure-app.you-are-about-to-delete-all-locally-cached-proof-of-work') +
				'<br><br><b>' +
				translateSignal('configure-app.are-you-sure') +
				'</b></p>'
			)
			this.svcWorkPool.clearCache()
			this.svcNotifications.sendSuccess(
				translateSignal('configure-app.successfully-cleared-the-work-cache')
			)
			return true
		} catch (err) {
			return false
		}
	}

	async clearWalletData () {
		const UIkit = window['UIkit']
		try {
			await UIkit.modal.confirm(
				'<p class="uk-alert uk-alert-danger"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span><span style="font-size: 18px;">' +
				translateSignal('configure-app.you-are-about-to-delete-all-locally-stored-data-about-your') +
				'</span><br><br><b style="font-size: 18px;">' +
				translateSignal('reset-wallet.before-continuing-make-sure-you-have-saved-the-nano-seed') +
				'</b><br><br><span style="font-size: 18px;"><b>' +
				translateSignal('reset-wallet.you-will-not-be-able-to-recover-the-funds-without-a-backup') +
				'</b></span></p><br>'
			)
			this.svcWallet.resetWallet()
			this.svcWallet.removeWalletData()
			this.svcNotifications.sendSuccess(
				translateSignal('configure-app.successfully-deleted-all-wallet-data')
			)
		} catch (err) { }
	}

	async clearAllData () {
		const UIkit = window['UIkit']
		try {
			await UIkit.modal.confirm(
				'<p class="uk-alert uk-alert-danger"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span><span style="font-size: 18px;">' +
				translateSignal('configure-app.clear-all-data.1') +
				'</span><br><br><b style="font-size: 18px;">' +
				translateSignal('reset-wallet.before-continuing-make-sure-you-have-saved-the-nano-seed') +
				'</b><br><br><span style="font-size: 18px;"><b>' +
				translateSignal('reset-wallet.you-will-not-be-able-to-recover-the-funds-without-a-backup') +
				'</b></span></p><br>'
			)
			this.svcWallet.resetWallet()
			this.svcWallet.removeWalletData()
			this.svcWorkPool.deleteCache()
			this.svcAddressBook.clearAddressBook()
			this.svcAppSettings.clearAppSettings()
			this.svcRepresentative.resetRepresentativeList()
			this.svcApi.deleteCache()
			this.loadFromSettings()
			this.svcNotifications.sendSuccess(
				translateSignal(
					'configure-app.clear-all-data.successfully-deleted-locally-stored-data-and-reset-the'
				)
			)
			// Get a new random API server or Gnault will get stuck in offline mode
			this.updateServerSettings()
		} catch (err) { }
	}

	// open qr reader modal
	openQR (reference, type) {
		const qrResult = this.svcQrModal.openQR(reference, type)
		qrResult.then(
			(data) => {
				switch (data.reference) {
					case 'rep1':
						this.defaultRepresentative = data.content
						this.validateRepresentative()
						break
				}
			},
			() => { }
		)
	}
}

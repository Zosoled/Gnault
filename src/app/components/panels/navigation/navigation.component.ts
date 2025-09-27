import {
	Component,
	EventEmitter,
	Output,
	Renderer2,
	Signal,
	computed,
	inject
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { SwUpdate } from '@angular/service-worker'
import { TranslocoPipe } from '@jsverse/transloco'
import {
	ChangeRepWidgetComponent,
	GnaultLogoElementComponent,
	InstallWidgetComponent,
	WalletWidgetComponent
} from 'app/components'
import { NanoCardComponent } from 'app/components/elements/nano-card/nano-card.component'
import { AmountSplitPipe, CurrencySymbolPipe, FiatPipe, RaiPipe } from 'app/pipes'
import {
	AppSettingsService,
	NodeService,
	NotificationsService,
	PriceService,
	UtilService,
	WalletService
} from 'app/services'
import { environment } from 'environments/environment'
import { Wallet } from 'libnemo'

@Component({
	selector: 'app-navigation',
	templateUrl: './navigation.component.html',
	styleUrls: ['./navigation.component.css'],
	imports: [
		AmountSplitPipe,
		ChangeRepWidgetComponent,
		CurrencySymbolPipe,
		FiatPipe,
		GnaultLogoElementComponent,
		InstallWidgetComponent,
		FormsModule,
		NanoCardComponent,
		RaiPipe,
		RouterLink,
		TranslocoPipe,
		WalletWidgetComponent,
	],
})
export class NavigationComponent {
	private renderer = inject(Renderer2)
	private router = inject(Router)
	private updates = inject(SwUpdate)

	private svcAppSettings = inject(AppSettingsService)
	private svcNotification = inject(NotificationsService)
	private svcUtil = inject(UtilService)
	private svcWallet = inject(WalletService)

	svcNode = inject(NodeService)
	svcPrice = inject(PriceService)

	@Output() animatingChanged = new EventEmitter<boolean>()
	isAnimating = false
	@Output() expandedChanged = new EventEmitter<boolean>()
	isExpanded = false

	canToggleLightMode = true
	donationAccount = environment.donationAddress
	isWalletsDropdownVisible = false
	node = this.svcNode.node
	searchData = ''
	stage = environment.production ? '' : 'BETA'

	get balance () {
		return this.svcWallet.balance
	}
	get displayCurrency () {
		return this.svcAppSettings.settings.displayCurrency
	}
	get hasReceivableTransactions () {
		return this.svcWallet.hasReceivableTransactions()
	}
	get innerHeight () {
		return window.innerHeight
	}
	get innerHeightWithoutMobileBar () {
		return this.innerHeight - this.mobileBarHeight
	}
	get isBalanceInitialized () {
		return this.svcWallet.isBalanceInitialized
	}
	get isBalanceUpdating () {
		return this.svcWallet.isBalanceUpdating
	}
	get isConfigured () {
		return this.svcWallet.isConfigured()
	}
	get isLocked () {
		return this.svcWallet.isLocked()
	}
	get isProcessingReceivable () {
		return this.svcWallet.isProcessingReceivable
	}
	get lightModeEnabled () {
		return this.svcAppSettings.settings.lightModeEnabled
	}
	get mobileBarHeight () {
		return window.innerWidth < 940 ? 50 : 0
	}
	get receivable () {
		return this.svcWallet.receivable
	}
	get receivableOption () {
		return this.svcAppSettings.settings.receivableOption
	}
	get selectedAccount () {
		return this.svcWallet.selectedAccount()
	}
	get selectedWallet () {
		return this.svcWallet.selectedWallet()
	}
	get selectedWalletName () {
		return this.svcWallet.walletNames.get(this.selectedWallet?.id) ?? this.selectedWallet?.id ?? ''
	}
	get serverAPI () {
		return this.svcAppSettings.settings.serverAPI
	}
	get walletNames () {
		return this.svcWallet.walletNames
	}
	get wallets () {
		return this.svcWallet.wallets()
	}

	selectedAccountColor: Signal<number> = computed((): number => {
		const pk = BigInt(`0x${this.selectedAccount?.publicKey ?? 0}`)
		const mod = pk % 360n
		return Number(mod)
	})

	constructor () {
		this.router.events.subscribe(() => {
			this.closeNav()
		})
	}

	applySwUpdate () {
		this.updates.activateUpdate()
	}

	toggleNav () {
		this.isExpanded = !this.isExpanded
		this.onNavExpandedChange()
	}

	closeNav () {
		if (this.isExpanded) {
			this.isExpanded = false
			this.onNavExpandedChange()
		}
	}

	onNavExpandedChange () {
		this.isAnimating = true
		this.animatingChanged.emit(true)
		this.expandedChanged.emit(true)
		setTimeout(() => {
			this.isAnimating = false
			this.animatingChanged.emit(false)
		}, 350)
	}

	toggleLightMode () {
		if (this.canToggleLightMode === false) {
			return
		}

		this.canToggleLightMode = false
		setTimeout(() => {
			this.canToggleLightMode = true
		}, 300)

		this.svcAppSettings.setAppSetting('lightModeEnabled', !this.svcAppSettings.settings.lightModeEnabled)
		this.updateAppTheme()
	}

	updateAppTheme () {
		if (this.svcAppSettings.settings.lightModeEnabled) {
			this.renderer.addClass(document.body, 'light-mode')
			this.renderer.removeClass(document.body, 'dark-mode')
		} else {
			this.renderer.addClass(document.body, 'dark-mode')
			this.renderer.removeClass(document.body, 'light-mode')
		}
	}

	selectWallet (wallet: Wallet | null) {
		// note: wallet is null when user is switching to 'Total Balance'
		this.svcWallet.selectedWallet.set(wallet)
		this.svcWallet.saveWalletExport()
	}

	performSearch () {
		const searchData = this.searchData.trim()
		if (!searchData.length) return

		const isValidNanoAccount =
			(searchData.startsWith('xrb_') || searchData.startsWith('nano_')) &&
			this.svcUtil.account.isValidAccount(searchData)

		if (isValidNanoAccount === true) {
			this.router.navigate(['accounts', searchData])
			this.searchData = ''
			return
		}

		const isValidBlockHash = this.svcUtil.nano.isValidHash(searchData)

		if (isValidBlockHash === true) {
			const blockHash = searchData.toUpperCase()
			this.router.navigate(['transaction', blockHash])
			this.searchData = ''
			return
		}

		this.svcNotification.sendWarning(`Invalid nano address or block hash! Please double check your input`)
	}

	retryConnection () {
		if (!this.svcAppSettings.settings.serverAPI) {
			this.svcNotification.sendInfo(`Wallet server settings is set to offline mode. Please change server first!`)
			return
		}
		this.svcWallet.reloadBalances()
		this.svcNotification.sendInfo(`Attempting to reconnect to nano node`)
	}
}

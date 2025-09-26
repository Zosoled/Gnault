import { AfterViewInit, Component, ElementRef, Renderer2, ViewChild, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterOutlet } from '@angular/router'
import { SwUpdate } from '@angular/service-worker'
import { TranslocoService } from '@jsverse/transloco'
import {
	NavigationComponent,
	NotificationsComponent,
	SetPasswordDialogComponent,
	UnlockWalletDialogComponent
} from 'app/components'
import {
	AddressBookService,
	AppSettingsService,
	DeeplinkService,
	DesktopService,
	NodeService,
	NotificationsService,
	PriceService,
	RepresentativeService,
	UtilService,
	WalletService,
	WebsocketService,
	WorkPoolService,
} from 'app/services'
import { environment } from 'environments/environment'
import { Wallet } from 'libnemo'

@Component({
	selector: 'app',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.less'],
	imports: [
		FormsModule,
		NavigationComponent,
		NotificationsComponent,
		RouterOutlet,
		SetPasswordDialogComponent,
		UnlockWalletDialogComponent,
	],
})
export class AppComponent implements AfterViewInit {
	@ViewChild('selectButton') selectButton: ElementRef
	@ViewChild('walletsDropdown') walletsDropdown: ElementRef

	private renderer = inject(Renderer2)
	private router = inject(Router)
	private updates = inject(SwUpdate)

	private svcAddressBook = inject(AddressBookService)
	private svcDeeplink = inject(DeeplinkService)
	private svcDesktop = inject(DesktopService)
	private svcNotification = inject(NotificationsService)
	private svcRepresentative = inject(RepresentativeService)
	private svcTransloco = inject(TranslocoService)
	private svcUtil = inject(UtilService)
	private svcWallet = inject(WalletService)
	private svcWebsocket = inject(WebsocketService)
	private svcWorkPool = inject(WorkPoolService)

	stage = environment.production ? '' : 'BETA'

	svcAppSettings = inject(AppSettingsService)
	svcNode = inject(NodeService)
	svcPrice = inject(PriceService)

	nanoPrice = this.svcPrice.lastPrice
	node = this.svcNode.node

	fiatTimeout = 5 * 60 * 1000 // Update fiat prices every 5 minutes
	inactiveSeconds = 0
	isWalletRefreshed = false
	navExpanded = false
	navAnimating = false
	isWalletsDropdownVisible = false
	canToggleLightMode = true
	searchData = ''
	donationAccount = environment.donationAddress

	get balance () {
		return this.svcWallet.balance
	}
	get hasReceivableTransactions () {
		return this.svcWallet.hasReceivableTransactions()
	}
	get innerHeight () {
		return window.innerHeight
	}
	get innerHeightWithoutMobileBar () {
		return this.innerHeight - (window.innerWidth < 940 ? 50 : 0)
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
	get receivable () {
		return this.svcWallet.receivable
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
	get walletNames () {
		return this.svcWallet.walletNames
	}
	get wallets$ () {
		return this.svcWallet.wallets$
	}

	constructor () {
		this.router.events.subscribe(() => {
			this.closeNav()
		})
		this.svcWallet.refresh$.subscribe((isRefreshed) => {
			if (isRefreshed) {
				this.isWalletRefreshed = true
			}
		})
	}

	async ngAfterViewInit () {
		this.svcAppSettings.loadAppSettings()
		this.svcTransloco.setActiveLang(this.svcAppSettings.settings.language)

		this.updateAppTheme()

		this.svcAddressBook.loadAddressBook()
		this.svcWorkPool.loadWorkCache()

		await this.svcWallet.loadWallet()

		// Subscribe to any transaction tracking
		for (const entry of this.svcAddressBook.addressBook) {
			if (entry.trackTransactions) {
				this.svcWallet.trackAddress(entry.account)
			}
		}

		// Navigate to accounts page if there is wallet, but only if coming from home. On desktop app the path ends with index.html
		if (
			this.isConfigured &&
			(window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))
		) {
			if (this.svcWallet.selectedAccount()?.address) {
				this.router.navigate([`accounts/${this.svcWallet.selectedAccount().address}`], {
					queryParams: { compact: 1 },
					replaceUrl: true,
				})
			} else {
				this.router.navigate(['accounts'], { replaceUrl: true })
			}
		}

		// update selected account object with the latest balance, receivable, etc
		if (this.svcWallet.selectedAccount()?.address) {
			const currentUpdatedAccount = this.svcWallet.accounts.find((a) => a.address === this.svcWallet.selectedAccount().address)
			this.svcWallet.selectedAccount.set(currentUpdatedAccount)
		}

		await this.svcWallet.reloadBalances()

		// Workaround fix for github pages when Gnault is refreshed (or externally linked) and there is a subpath for example to the send screen.
		// This data is saved from the 404.html page
		const path = localStorage.getItem('path')

		if (path) {
			const search = localStorage.getItem('query') // ?param=value
			const fragment = localStorage.getItem('fragment') // #value
			localStorage.removeItem('path')
			localStorage.removeItem('query')
			localStorage.removeItem('fragment')

			if (search && search.length) {
				const queryParams = {}
				const urlSearch = new URLSearchParams(search)
				urlSearch.forEach(function (value, key) {
					queryParams[key] = value
				})
				this.router.navigate([path], { queryParams: queryParams, replaceUrl: true })
			} else if (fragment && fragment.length) {
				this.router.navigate([path], { fragment: fragment, replaceUrl: true })
			} else {
				this.router.navigate([path], { replaceUrl: true })
			}
		}

		this.svcWebsocket.connect()

		this.svcRepresentative.loadRepresentativeList()

		// If the wallet is locked and there is a receivable balance, show a warning to unlock the wallet
		// (if not receive priority is set to manual)
		if (
			this.svcWallet.isLocked &&
			this.svcWallet.hasReceivableTransactions() &&
			this.svcAppSettings.settings.receivableOption !== 'manual'
		) {
			this.svcNotification.sendWarning(`New incoming transaction(s) - Unlock the wallet to receive`, {
				length: 10000,
				identifier: 'receivable-locked',
			})
		} else if (
			this.svcWallet.hasReceivableTransactions() &&
			this.svcAppSettings.settings.receivableOption === 'manual'
		) {
			this.svcNotification.sendWarning(`Incoming transaction(s) found - Set to be received manually`, {
				length: 10000,
				identifier: 'receivable-locked',
			})
		}

		// When the page closes, determine if we should lock the wallet
		window.addEventListener('beforeunload', (e) => {
			if (this.svcWallet.isLocked) return // Already locked, nothing to worry about
			this.svcWallet.lockWallet()
		})
		window.addEventListener('unload', (e) => {
			if (this.svcWallet.isLocked) return // Already locked, nothing to worry about
			this.svcWallet.lockWallet()
		})

		// handle deeplinks
		this.svcDesktop.on('deeplink', (deeplink) => {
			if (!this.svcDeeplink.navigate(deeplink))
				this.svcNotification.sendWarning('This URI has an invalid address.', { length: 5000 })
		})
		this.svcDesktop.send('deeplink-ready')

		// Notify user if service worker update is available
		this.updates.versionUpdates.subscribe((event) => {
			if (event.type === 'VERSION_READY') {
				console.log(`SW update available. Current: ${event.currentVersion.hash}. New: ${event.latestVersion.hash}`)
				this.svcNotification.sendInfo(
					'An update was installed in the background and will be applied on next launch. <a href="#" (click)="applySwUpdate()">Apply immediately</a>',
					{ length: 10000 }
				)
			}
		})

		/* DEPRECATED
		// Notify user after service worker was updated
		this.updates.activated.subscribe((event) => {
			console.log(`SW update successful. Current: ${event.current.hash}`)
			this.notifications.sendSuccess('Gnault was updated successfully.')
		})
		*/

		// Check how long the wallet has been inactive, and lock it if it's been too long
		setInterval(() => {
			this.inactiveSeconds += 1
			if (!this.svcAppSettings.settings.lockInactivityMinutes) return // Do not lock on inactivity
			if (this.svcWallet.isLocked) return

			// Determine if we have been inactive for longer than our lock setting
			if (this.inactiveSeconds >= this.svcAppSettings.settings.lockInactivityMinutes * 60) {
				this.svcWallet.lockWallet()
				this.svcNotification.sendSuccess(
					`Wallet locked after ${this.svcAppSettings.settings.lockInactivityMinutes} minutes of inactivity`
				)
			}
		}, 1000)

		try {
			if (!this.svcAppSettings.settings.serverAPI) return
			await this.updateFiatPrices()
		} catch (err) {
			this.svcNotification.sendWarning(
				`There was an issue retrieving latest nano price.  Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.`,
				{ length: 0, identifier: `price-adblock` }
			)
		}
	}

	applySwUpdate () {
		this.updates.activateUpdate()
	}

	toggleNav () {
		this.navExpanded = !this.navExpanded
		this.onNavExpandedChange()
	}

	closeNav () {
		if (this.navExpanded === false) {
			return
		}

		this.navExpanded = false
		this.onNavExpandedChange()
	}

	onNavExpandedChange () {
		this.navAnimating = true
		setTimeout(() => {
			this.navAnimating = false
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

	toggleWalletsDropdown () {
		if (this.isWalletsDropdownVisible) {
			this.isWalletsDropdownVisible = false
		} else {
			this.isWalletsDropdownVisible = true
			this.walletsDropdown.nativeElement.scrollTop = 0
		}
	}

	selectWallet (wallet: Wallet | null) {
		// note: wallet is null when user is switching to 'Total Balance'
		this.svcWallet.selectedWallet.set(wallet)
		this.toggleWalletsDropdown()
		this.svcWallet.saveWalletExport()
	}

	performSearch () {
		const searchData = this.searchData.trim()
		if (!searchData.length) return

		const isValidNanoAccount =
			(searchData.startsWith('xrb_') || searchData.startsWith('nano_')) &&
			this.svcUtil.account.isValidAccount(searchData)

		if (isValidNanoAccount === true) {
			this.router.navigate(['account', searchData])
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

	updateIdleTime () {
		this.inactiveSeconds = 0 // Action has happened, reset the inactivity timer
	}

	retryConnection () {
		if (!this.svcAppSettings.settings.serverAPI) {
			this.svcNotification.sendInfo(`Wallet server settings is set to offline mode. Please change server first!`)
			return
		}
		this.svcWallet.reloadBalances()
		this.svcNotification.sendInfo(`Attempting to reconnect to nano node`)
	}

	async updateFiatPrices () {
		const displayCurrency = this.svcAppSettings.getAppSetting('displayCurrency') ?? 'usd'
		await this.svcPrice.fetchPrice(displayCurrency)
		setTimeout(() => this.updateFiatPrices(), this.fiatTimeout)
	}
}

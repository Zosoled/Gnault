import {
	Component,
	ElementRef,
	HostListener,
	Signal,
	ViewChild,
	computed,
	inject
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { AmountSplitPipe, FiatPipe, RaiPipe } from 'app/pipes'
import {
	AppSettingsService,
	NodeService,
	WalletService
} from 'app/services'
import { Wallet } from 'libnemo'

@Component({
	selector: 'app-nano-card',
	templateUrl: './nano-card.component.html',
	styleUrls: ['./nano-card.component.css'],
	imports: [
		AmountSplitPipe,
		FiatPipe,
		FormsModule,
		RaiPipe,
		RouterLink,
		TranslocoPipe,
	],
})
export class NanoCardComponent {
	private svcNode = inject(NodeService)
	private svcWallet = inject(WalletService)

	svcAppSettings = inject(AppSettingsService)

	@ViewChild('selectButton') selectButton: ElementRef
	@ViewChild('walletsDropdown') walletsDropdown: ElementRef

	isWalletsDropdownVisible = false
	node = this.svcNode.node

	get balance () {
		return this.svcWallet.balance
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
	get selectedAccount () {
		return this.svcWallet.selectedAccount()
	}
	get selectedWallet () {
		return this.svcWallet.selectedWallet()
	}
	get selectedWalletName () {
		return this.svcWallet.walletNames.get(this.selectedWallet?.id) ?? this.selectedWallet?.id ?? ''
	}
	get settings () {
		return this.svcAppSettings.settings()
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

	@HostListener('document:mousedown', ['$event']) onGlobalClick (event): void {
		if (
			this.selectButton.nativeElement.contains(event.target) === false &&
			this.walletsDropdown.nativeElement.contains(event.target) === false
		) {
			this.isWalletsDropdownVisible = false
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
}

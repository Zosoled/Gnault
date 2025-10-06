import {
	Component,
	Signal,
	computed,
	inject
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoDirective } from '@jsverse/transloco'
import { AmountSplitPipe, FiatPipe, RaiPipe } from 'app/pipes'
import {
	AppSettingsService,
	NodeService,
	WalletService
} from 'app/services'

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
		TranslocoDirective,
	],
})
export class NanoCardComponent {
	private svcAppSettings = inject(AppSettingsService)
	private svcNode = inject(NodeService)
	private svcWallet = inject(WalletService)

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
		return this.svcWallet.walletNames().get(this.selectedWallet?.id) ?? this.selectedWallet?.id ?? ''
	}
	get settings () {
		return this.svcAppSettings.settings()
	}

	selectedAccountColor: Signal<number> = computed((): number => {
		const pk = BigInt(`0x${this.selectedAccount?.publicKey ?? 0}`)
		const mod = pk % 360n
		return Number(mod)
	})
}

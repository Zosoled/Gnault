import { Component, Signal, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslocoDirective } from '@jsverse/transloco'
import { AmountSplitPipe, FiatPipe, RaiPipe } from 'app/pipes'
import { AppSettingsService, NodeService, WalletService } from 'app/services'

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

	svcWallet = inject(WalletService)

	isWalletsDropdownVisible = false
	node = this.svcNode.node
	selectedAccount = computed(() => this.svcWallet.selectedAccount())
	settings = computed(() => this.svcAppSettings.settings())

	selectedAccountColor: Signal<number> = computed((): number => {
		const pk = BigInt(`0x${this.svcWallet.selectedAccount()?.publicKey ?? 0}`)
		const mod = pk % 360n
		return Number(mod)
	})
}

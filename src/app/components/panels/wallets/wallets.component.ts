import { CommonModule } from '@angular/common'
import { Component, computed, inject, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { translate, TranslocoDirective } from '@jsverse/transloco'
import {
	NotificationsService,
	WalletService
} from 'app/services'
import { Wallet } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import { Subject, timer } from 'rxjs'
import { debounce } from 'rxjs/operators'

@Component({
	selector: 'app-wallets',
	templateUrl: './wallets.component.html',
	styleUrls: ['./wallets.component.css'],
	imports: [
		ClipboardModule,
		CommonModule,
		FormsModule,
		RouterLink,
		TranslocoDirective,
	],
})
export class WalletsComponent implements OnInit {
	private router = inject(Router)
	private svcNotifications = inject(NotificationsService)
	private svcWallet = inject(WalletService)

	// Repopulate accounts when changing wallets (debounce by 5 seconds)
	walletChanged$ = new Subject<string>()
	reloadAccountsWarning$ = this.walletChanged$.pipe(debounce(() => timer(5000)))

	namedWallets = computed(() => {
		const wallets = this.svcWallet.wallets()
		const names = this.svcWallet.walletNames()
		return wallets
			.map(wallet => ({ wallet, name: names.get(wallet.id) ?? wallet.id }))
			.sort((a, b) => a.name.localeCompare(b.name))
	})

	async ngOnInit () {
		this.reloadAccountsWarning$.subscribe((a) => {
			this.svcWallet.scanAccounts()
		})
	}

	selectWallet (wallet: Wallet) {
		if (wallet == null) {
			this.svcNotifications.sendError('Failed to select wallet.')
		}
		this.svcWallet.selectedWallet.set(wallet)
		this.svcWallet.saveWalletExport()

		this.router.navigate(['accounts'], { queryParams: { compact: 1 } })
	}

	getWalletName (id: string) {
		const names = this.namedWallets()
		const match = names.find(({ wallet }) => wallet.id === id)
		return match?.name ?? id
	}

	async editWalletName (id: string) {
		const name = this.getWalletName(id)
		const UIkit = window['UIkit']
		const response = await UIkit.modal.prompt('Edit Wallet Name', name)
		if (response) {
			this.svcWallet.walletNames.update((names) => {
				const updated = new Map(names)
				updated.set(id, response)
				return updated
			})
		}
		await this.svcWallet.saveWalletExport()
	}

	async deleteWallet (wallet: Wallet) {
		try {
			const id = wallet.id
			await wallet.destroy()
			this.svcNotifications.sendSuccess(translate('wallet.delete.success', { id })
			)
			this.walletChanged$.next(id)
		} catch (err) {
			this.svcNotifications.sendError(translate('wallet.delete.error', { error: err?.message ?? err })
			)
		}
	}
}

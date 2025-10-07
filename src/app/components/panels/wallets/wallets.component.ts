import { CommonModule } from '@angular/common'
import { Component, computed, inject, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { translate, TranslocoDirective } from '@jsverse/transloco'
import {
	NotificationsService,
	WalletService
} from 'app/services'
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
	UIkit = (window as any).UIkit

	// Repopulate accounts when changing wallets (debounce by 5 seconds)
	walletChanged$ = new Subject<string>()
	reloadAccountsWarning$ = this.walletChanged$.pipe(debounce(() => timer(5000)))
	walletIdToDelete = null

	wallets = computed(() => {
		const wallets = this.svcWallet.wallets()
		const names = this.svcWallet.walletNames()
		return wallets
			.map(wallet => ({ id: wallet.id, name: names.get(wallet.id) ?? wallet.id, type: wallet.type }))
			.sort((a, b) => a.name.localeCompare(b.name))
	})

	async ngOnInit () {
		this.reloadAccountsWarning$.subscribe((a) => {
			this.svcWallet.scanAccounts()
		})
	}

	confirmDeleteWallet (id: string) {
		try {
			this.walletIdToDelete = id
			this.UIkit.modal('#wallet-delete-warning').show()
			this.UIkit.util.on('#wallet-delete-warning', 'hide', () => {
				this.walletIdToDelete = null
			})
		} catch (err) {
			this.svcNotifications.sendError(translate('wallets.delete.error', { error: err?.message ?? err }))
		}
	}

	async deleteWallet () {
		await this.svcWallet.deleteWallet(this.walletIdToDelete)
		this.svcNotifications.sendSuccess(translate('wallets.delete.success'))
		this.walletChanged$.next(this.walletIdToDelete)
	}

	async editWalletName (id: string) {
		const match = this.wallets().find((w) => w.id === id)
		const name = match?.name ?? id
		const response = await this.UIkit.modal.prompt(translate('wallets.edit-wallet-name'), name)
		if (response) {
			this.svcWallet.walletNames.update((names) => {
				const updated = new Map(names)
				updated.set(id, response)
				return updated
			})
		}
		await this.svcWallet.saveWalletExport()
	}

	selectWallet (id: string) {
		try {
			if (id == null) {
				throw new Error('No wallet ID provided.')
			}
			this.svcWallet.setActiveWallet(id)
			this.router.navigate(['accounts'], { queryParams: { compact: 1 } })
		} catch (err) {
			this.svcNotifications.sendError('Failed to select wallet.', { error: err?.message ?? err })
		}
	}
}

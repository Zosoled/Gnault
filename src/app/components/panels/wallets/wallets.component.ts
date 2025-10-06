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
	private UIkit = window['UIkit']
	private svcNotifications = inject(NotificationsService)
	private svcWallet = inject(WalletService)

	// Repopulate accounts when changing wallets (debounce by 5 seconds)
	walletChanged$ = new Subject<string>()
	reloadAccountsWarning$ = this.walletChanged$.pipe(debounce(() => timer(5000)))

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

	deleteWallet (id: string) {
		const text = `${translate('wallets.delete.warning.1')}\n
			${translate('wallets.delete.warning.2')}`
		const buttons = {
			i18n: {
				ok: translate('wallets.delete.confirm'),
				cancel: translate('general.cancel'),
			},
		}
		this.UIkit.modal.confirm(text, buttons).catch().then(async () => {
			try {
				await this.svcWallet.deleteWallet(id)
				this.svcNotifications.sendSuccess(translate('wallets.delete.success', { id }))
				this.walletChanged$.next(id)
			} catch (err) {
				this.svcNotifications.sendError(translate('wallets.delete.error', { error: err?.message ?? err }))
			}
		})
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
}

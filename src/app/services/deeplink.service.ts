import { Injectable, inject } from '@angular/core'
import { Router } from '@angular/router'
import { RemoteSignService, UtilService, WalletService } from 'app/services'

@Injectable({ providedIn: 'root' })
export class DeeplinkService {
	private router = inject(Router)
	private svcRemoteSign = inject(RemoteSignService)
	private svcUtil = inject(UtilService)
	private svcWallet = inject(WalletService)

	navigate (deeplink: string): boolean {
		const nano_scheme = /^(nano|nanorep|nanoseed|nanokey|nanosign|nanoprocess|https):.+$/g

		if (this.svcUtil.account.isValidAccount(deeplink)) {
			// Got address, routing to send...
			this.router.navigate(['send'], { queryParams: { to: deeplink } })
		} else if (this.svcUtil.nano.isValidSeed(deeplink)) {
			// Seed
			this.handleSeed(deeplink)
		} else if (nano_scheme.test(deeplink)) {
			// This is a valid Nano scheme URI
			const url = new URL(deeplink)

			// check if deeplink contains a full URL path
			if (url.protocol === 'https:') {
				if (url.pathname === '/import-wallet' && url.hash.slice(1).length) {
					// wallet import
					this.router.navigate(['import-wallet'], {
						queryParams: { hostname: url.hostname },
						fragment: url.hash.slice(1),
					})
				} else if (url.pathname === '/import-address-book' && url.hash.slice(1).length) {
					// address book import
					this.router.navigate(['import-address-book'], {
						queryParams: { hostname: url.hostname },
						fragment: url.hash.slice(1),
					})
				}
			} else if (url.protocol === 'nano:' && this.svcUtil.account.isValidAccount(url.pathname)) {
				// Got address, routing to send...
				const amount = url.searchParams.get('amount')
				this.router.navigate(['send'], {
					queryParams: {
						to: url.pathname,
						amount: this.svcUtil.nano.rawToMnano(amount) ?? null,
					},
				})
			} else if (url.protocol === 'nanorep:' && this.svcUtil.account.isValidAccount(url.pathname)) {
				// Representative change
				this.router.navigate(['representatives'], {
					queryParams: {
						hideOverview: true,
						accounts: 'all',
						representative: url.pathname,
					},
				})
			} else if (url.protocol === 'nanoseed:' && this.svcUtil.nano.isValidSeed(url.pathname)) {
				// Seed
				this.handleSeed(url.pathname)
			} else if (url.protocol === 'nanokey:' && this.svcUtil.nano.isValidHash(url.pathname)) {
				// Private key
				this.handlePrivateKey(url.pathname)
			} else if (url.protocol === 'nanosign:') {
				this.svcRemoteSign.navigateSignBlock(url)
			} else if (url.protocol === 'nanoprocess:') {
				this.svcRemoteSign.navigateProcessBlock(url)
			}
		} else {
			return false
		}
		return true
	}

	get hasAccounts () {
		return this.svcWallet.selectedWallet().accounts.length > 0
	}

	handleSeed (seed) {
		if (this.hasAccounts) {
			// Wallet already set up, sweeping...
			this.router.navigate(['sweeper'], { state: { seed: seed } })
		} else {
			// No wallet set up, new wallet...
			this.router.navigate(['configure-wallet'], { state: { seed: seed } })
		}
	}

	handlePrivateKey (key) {
		if (this.hasAccounts) {
			// Wallet already set up, sweeping...
			this.router.navigate(['sweeper'], { state: { seed: key } })
		} else {
			// No wallet set up, new wallet...
			this.router.navigate(['configure-wallet'], { state: { key: key } })
		}
	}
}

import { Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { NotificationsService, UtilService, WalletKeyType, WalletService } from 'app/services'

@Component({
	selector: 'app-import-wallet',
	templateUrl: './import-wallet.component.html',
	styleUrls: ['./import-wallet.component.css'],
	imports: [FormsModule],
})
export class ImportWalletComponent implements OnInit {
	private route = inject(ActivatedRoute)
	private notifications = inject(NotificationsService)
	private router = inject(Router)
	private util = inject(UtilService)

	walletService = inject(WalletService)

	activePanel = 'error'
	walletPassword = ''
	validImportData = false
	importData: any = null
	hostname = ''

	ngOnInit() {
		const importData = this.route.snapshot.fragment
		const queryData = this.route.snapshot.queryParams
		if (!importData || !importData.length) {
			return this.importDataError(`No import data found. Check your link and try again.`)
		}

		if ('hostname' in queryData) this.hostname = queryData.hostname
		const decodedData = atob(importData)

		try {
			const importBlob = JSON.parse(decodedData)
			if (!importBlob || (!importBlob.seed && !importBlob.privateKey && !importBlob.expandedKey)) {
				return this.importDataError(`Bad import data. Check your link and try again.`)
			}
			this.validImportData = true
			this.importData = importBlob
			this.activePanel = 'import'
		} catch (err) {
			return this.importDataError(`Unable to decode import data. Check your link and try again.`)
		}
	}

	importDataError(message) {
		this.activePanel = 'error'
		return this.notifications.sendError(message)
	}

	async decryptWallet() {
		// Attempt to decrypt the seed value using the password
		try {
			await new Promise((resolve) => setTimeout(resolve, 500)) // brute force delay
			let walletType: WalletKeyType
			let secret = ''
			if (this.importData.seed) {
				secret = this.importData.seed
				walletType = 'seed'
			} else if (this.importData.privateKey) {
				secret = this.importData.privateKey
				walletType = 'privateKey'
			} else if (this.importData.expandedKey) {
				secret = this.importData.expandedKey
				walletType = 'expandedKey'
			}

			const { id, type, iv, salt, encrypted } = JSON.parse(secret)

			const derivationKey = await crypto.subtle.importKey(
				'raw',
				new TextEncoder().encode(this.walletPassword),
				'PBKDF2',
				false,
				['deriveKey']
			)
			const derivationAlgorithm: Pbkdf2Params = {
				name: 'PBKDF2',
				hash: 'SHA-512',
				iterations: 210000,
				salt,
			}
			const decryptionKey = await crypto.subtle.deriveKey(
				derivationAlgorithm,
				derivationKey,
				{ name: 'AES-GCM', length: 256 },
				false,
				['decrypt']
			)
			const decryptedBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, decryptionKey, encrypted)
			const decryptedSecret = new TextDecoder().decode(decryptedBytes)

			if (decryptedSecret?.length !== 64) {
				return this.notifications.sendError(`Invalid password, please try again`)
			}
			if (!this.util.nano.isValidSeed(decryptedSecret)) {
				return this.notifications.sendError(`Invalid seed format (non HEX characters)`)
			}

			this.router.navigate(['accounts']) // load accounts and watch them update in real-time
			this.notifications.sendInfo(`Loading all accounts for the wallet...`)
			const isImported = await this.walletService.loadImportedWallet(
				type,
				decryptedSecret,
				this.walletPassword,
				this.importData.accountsIndex || 0,
				this.importData.indexes || null,
				walletType
			)
			if (isImported) {
				this.notifications.sendSuccess(`Successfully imported the wallet!`, { length: 10000 })
			} else {
				return this.notifications.sendError(`Failed importing the wallet. Invalid data!`)
			}
		} catch (err) {
			return this.notifications.sendError(`Invalid password, please try again`)
		} finally {
			this.walletPassword = ''
		}
	}
}

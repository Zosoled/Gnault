import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import {
	NotificationsService,
	QrModalService,
	UtilService,
	WalletService
} from 'app/services'
import { environment } from 'environments/environment'
import { ClipboardModule } from 'ngx-clipboard'

enum panels {
	'landing',
	'mnemonicTypeSelection',
	'import',
	'password',
	'backup',
	'final',
}

// seed index
const INDEX_MAX = 4294967295

@Component({
	selector: 'app-configure-wallet',
	templateUrl: './configure-wallet.component.html',
	styleUrls: ['./configure-wallet.component.css'],
	imports: [ClipboardModule, FormsModule, RouterLink, TranslocoDirective],
})
export class ConfigureWalletComponent {
	private router = inject(Router)
	private svcNotifications = inject(NotificationsService)
	private svcQrModal = inject(QrModalService)
	private svcTransloco = inject(TranslocoService)
	private svcUtil = inject(UtilService)
	private svcWallet = inject(WalletService)

	readonly isDesktop = environment.desktop
	readonly isBluetoothSupported = this.isDesktop || typeof navigator?.bluetooth?.getDevices === 'function'
	readonly isHidSupported = this.isDesktop || typeof navigator?.hid?.getDevices === 'function'
	readonly isUsbSupported = this.isDesktop || typeof navigator?.usb?.getDevices === 'function'
	readonly isSupported = this.isBluetoothSupported || this.isHidSupported || this.isUsbSupported

	panels = panels
	activePanel = panels.landing
	get isConfigured () {
		return this.svcWallet.isConfigured()
	}
	get isLedger () {
		return this.svcWallet.isLedger()
	}
	get isLocked () {
		return this.svcWallet.isLocked()
	}
	get wallet () {
		return this.svcWallet.selectedWallet()
	}

	isNewWallet = true
	hasConfirmedBackup = false
	importSeed = ''
	isExpanded = false
	keyString = ''

	exampleMnemonicWords = ['edge', 'defense', 'waste', 'choose']
	exampleMnemonicSalt = 'some password'
	exampleSeed = '0dc285...'
	examplePrivateKey = '3be4fc...'
	exampleExpandedPrivateKey = '3be4fc2ef3f3...'
	showMoreImportOptions = false

	newWalletSeed = ''
	newWalletMnemonic = ''
	newWalletMnemonicLines = []
	newPassword = ''
	importSeedModel = ''
	importPrivateKeyModel = ''
	importExpandedKeyModel = ''
	importSeedMnemonicModel = ''
	importSeedBip39MnemonicModel = ''
	importSeedBip39MnemonicIndexModel = '0'
	importSeedBip39MnemonicPasswordModel = ''
	walletPasswordModel = ''
	walletPasswordConfirmModel = ''
	validatePassword = false
	validatePasswordConfirm = false
	validIndex = true
	indexMax = INDEX_MAX
	selectedImportOption = 'seed'

	constructor () {
		if (this.router.getCurrentNavigation().extras.state && this.router.getCurrentNavigation().extras.state.seed) {
			this.activePanel = panels.import
			this.importSeedModel = this.router.getCurrentNavigation().extras.state.seed
			this.isNewWallet = false
		} else if (this.router.getCurrentNavigation().extras.state && this.router.getCurrentNavigation().extras.state.key) {
			this.activePanel = panels.import
			this.importPrivateKeyModel = this.router.getCurrentNavigation().extras.state.key
			this.selectedImportOption = 'privateKey'
			this.isNewWallet = false
		}
	}

	async importExistingWallet () {
		this.importSeed = ''
		this.newPassword = ''

		await this.svcWallet.resetWallet()

		// load accounts and watch them update in real-time
		this.router.navigate(['accounts'])

		this.svcNotifications.sendInfo(`Starting to scan the first 20 accounts and importing them if they have been used...`, {
			length: 7000,
		})
		await this.svcWallet.scanAccounts()

		this.svcNotifications.sendSuccess(`Successfully imported wallet!`, { length: 10000 })

		// this is now called from change-rep-widget.component when new wallet
		// this.repService.detectChangeableReps()

		this.svcWallet.publishNewWallet()
	}

	async importSingleKeyWallet () {
		this.svcWallet.createWalletFromSingleKey(this.keyString, this.isExpanded)
		this.newPassword = ''
		this.router.navigate(['accounts']) // load accounts and watch them update in real-time
		this.keyString = ''

		this.svcNotifications.sendSuccess(`Successfully imported wallet from a private key!`)
		this.svcWallet.publishNewWallet()
	}

	async connectLedgerByBluetooth () {
		await this.importLedgerWallet(true)
	}

	async connectLedgerByUsb () {
		await this.importLedgerWallet(false)
	}

	async importLedgerWallet (bluetooth: boolean) {
		this.svcNotifications.sendInfo('Checking for Ledger device...', { identifier: 'ledger-status', length: 0 })
		try {
			// Create new ledger wallet
			await this.svcWallet.createLedgerWallet(bluetooth)
			// We skip the password panel
			this.router.navigate(['accounts']) // load accounts and watch them update in real-time
			this.svcWallet.publishNewWallet()
			this.svcNotifications.sendSuccess('Successfully connected to Ledger device')
		} catch (err) {
			return this.svcNotifications.sendWarning(
				`Failed to connect the Ledger device. Make sure the nano app is running on the Ledger. If the error persists: Check the <a href="https://docs.nault.cc/2020/08/04/ledger-guide.html#troubleshooting" target="_blank" rel="noopener noreferrer">troubleshooting guide</a>`,
				{ identifier: 'ledger-error', length: 0 }
			)
		} finally {
			this.svcNotifications.removeNotification('ledger-status')
			this.svcNotifications.removeNotification('ledger-error')
		}
	}

	initCreate () {
		this.isNewWallet = true
		this.activePanel = panels.password
	}

	async initImport () {
		if (this.selectedImportOption === 'mnemonic' || this.selectedImportOption === 'seed') {
			if (this.selectedImportOption === 'seed') {
				const existingSeed = this.importSeedModel.trim()
				if (existingSeed.length !== 64 || !this.svcUtil.nano.isValidSeed(existingSeed))
					return this.svcNotifications.sendError(`Seed is invalid, double check it!`)
				this.importSeed = existingSeed
			} else if (this.selectedImportOption === 'mnemonic') {
				// Clean the value by trimming it and removing newlines
				const mnemonic = this.importSeedMnemonicModel.toLowerCase().replace(/\n/g, '').trim()
				const words = mnemonic.split(' ')
				if (words.length < 20) return this.svcNotifications.sendError(`Mnemonic is too short, double check it!`)

				// Try and decode the mnemonic
				try {
					await this.svcWallet.loadImportedWallet('BLAKE2b', '', mnemonic, 0, [0], 'seed')
				} catch (err) {
					return this.svcNotifications.sendError(err?.message ?? err)
				}
			} else {
				return this.svcNotifications.sendError(`Invalid import option`)
			}
		} else if (this.selectedImportOption === 'privateKey' || this.selectedImportOption === 'expandedKey') {
			if (this.selectedImportOption === 'privateKey') {
				this.isExpanded = false
			} else if (this.selectedImportOption === 'expandedKey') {
				this.isExpanded = true
			} else {
				return this.svcNotifications.sendError(`Invalid import option`)
			}

			this.keyString = this.isExpanded ? this.importExpandedKeyModel : this.importPrivateKeyModel
			this.keyString = this.keyString.trim()
			if (this.isExpanded && this.keyString.length === 128) {
				// includes deterministic R value material which we ignore
				this.keyString = this.keyString.substring(0, 64)
				if (!this.svcUtil.nano.isValidSeed(this.keyString)) {
					return this.svcNotifications.sendError(`Private key is invalid, double check it!`)
				}
			} else if (this.keyString.length !== 64 || !this.svcUtil.nano.isValidSeed(this.keyString)) {
				return this.svcNotifications.sendError(`Private key is invalid, double check it!`)
			}
		} else if (this.selectedImportOption === 'bip39-mnemonic') {
			try {
				const index = Number(this.importSeedBip39MnemonicIndexModel)
				await this.svcWallet.loadImportedWallet('BIP-44', '', this.importSeedBip39MnemonicModel, index, [index], 'seed')
			} catch (err) {
				return this.svcNotifications.sendError(err.message)
			}
			if (!this.validIndex) {
				return this.svcNotifications.sendError(`The account index is invalid, double check it!`)
			}
		}
		this.activePanel = panels.password
	}

	async saveWalletPassword () {
		if (this.isNewWallet) {
			const { mnemonic, seed } = await this.svcWallet.createNewWallet()
			this.newWalletMnemonic = mnemonic
			this.newWalletSeed = seed
			// Split the seed up so we can show 4 per line
			const words = this.newWalletMnemonic.split(' ')
			const lines = [
				words.slice(0, 4),
				words.slice(4, 8),
				words.slice(8, 12),
				words.slice(12, 16),
				words.slice(16, 20),
				words.slice(20, 24),
			]
			this.newWalletMnemonicLines = lines
			this.activePanel = panels.backup
		} else {
			const isUpdated = await this.svcWallet.requestChangePassword()
			if (isUpdated) {
				this.activePanel = panels.final
			}
		}
	}

	confirmNewSeed () {
		if (!this.hasConfirmedBackup) {
			return this.svcNotifications.sendWarning(`Please confirm you have saved a wallet backup!`)
		}
		this.newPassword = ''
		this.newWalletSeed = ''
		this.newWalletMnemonic = ''
		this.newWalletMnemonicLines = []
		this.saveNewWallet()
		this.activePanel = panels.final
	}

	saveNewWallet () {
		this.svcWallet.saveWalletExport()
		this.svcWallet.publishNewWallet()
		this.svcNotifications.sendSuccess(`Successfully created new wallet! Do not lose the secret recovery seed/mnemonic!`)
	}

	setPanel (panel) {
		this.activePanel = panel
		if (panel === panels.landing) {
			this.isNewWallet = true
		} else if (panel === panels.import) {
			this.isNewWallet = false
		}
	}

	copiedNewWalletSeed () {
		this.svcNotifications.removeNotification('success-copied')
		this.svcNotifications.sendSuccess(
			this.svcTransloco.translate('configure-wallet.new-wallet.successfully-copied-secret-recovery-seed'),
			{ identifier: 'success-copied' }
		)
	}

	copiedNewWalletMnemonic () {
		this.svcNotifications.removeNotification('success-copied')
		this.svcNotifications.sendSuccess(
			this.svcTransloco.translate('configure-wallet.new-wallet.successfully-copied-secret-recovery-mnemonic'),
			{ identifier: 'success-copied' }
		)
	}

	importFromFile (files) {
		if (!files.length) return

		const file = files[0]
		const reader = new FileReader()
		reader.onload = (event) => {
			const fileData = event.target['result'] as string
			try {
				const importData = JSON.parse(fileData)
				if (
					(!importData.seed && !importData.privateKey && !importData.expandedKey) ||
					(!importData.hasOwnProperty('accountsIndex') && !importData.hasOwnProperty('indexes'))
				) {
					return this.svcNotifications.sendError(`Bad import data `)
				}

				const walletEncrypted = btoa(JSON.stringify(importData))
				this.router.navigate(['import-wallet'], { fragment: walletEncrypted })
			} catch (err) {
				this.svcNotifications.sendError(`Unable to parse import data, make sure you selected the right file!`)
			}
		}

		reader.readAsText(file)
	}

	// open qr reader modal
	openQR (reference, type) {
		const qrResult = this.svcQrModal.openQR(reference, type)
		qrResult.then(
			(data) => {
				switch (data.reference) {
					case 'seed1':
						this.importSeedModel = data.content
						break
					case 'mnemo1':
						this.importSeedMnemonicModel = data.content
						break
					case 'mnemo2':
						this.importSeedBip39MnemonicModel = data.content
						break
					case 'priv1':
						this.importPrivateKeyModel = data.content
						break
					case 'expanded1':
						this.importExpandedKeyModel = data.content
						break
				}
			},
			() => { }
		)
	}

	accountIndexChange (index) {
		let invalid = false
		if (this.svcUtil.string.isNumeric(index) && index % 1 === 0) {
			index = parseInt(index, 10)
			if (!this.svcUtil.nano.isValidIndex(index)) {
				invalid = true
			}
			if (index > INDEX_MAX) {
				invalid = true
			}
		} else {
			invalid = true
		}
		this.validIndex = !invalid
	}
}

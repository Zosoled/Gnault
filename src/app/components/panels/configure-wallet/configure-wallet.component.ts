import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import {
	LedgerService,
	NotificationsService,
	QrModalService,
	UtilService,
	WalletService
} from 'app/services'
import { environment } from 'environments/environment'
import { Wallet } from 'libnemo'
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
	imports: [ClipboardModule, FormsModule, RouterLink, TranslocoPipe],
})
export class ConfigureWalletComponent {
	private notifications = inject(NotificationsService)
	private qrModalService = inject(QrModalService)
	private route = inject(Router)
	private translocoService = inject(TranslocoService)
	private util = inject(UtilService)

	ledgerService = inject(LedgerService)
	walletService = inject(WalletService)

	readonly isDesktop = environment.desktop
	readonly isBluetoothSupported = this.isDesktop || typeof navigator?.bluetooth?.getDevices === 'function'
	readonly isHidSupported = this.isDesktop || typeof navigator?.hid?.getDevices === 'function'
	readonly isUsbSupported = this.isDesktop || typeof navigator?.usb?.getDevices === 'function'

	panels = panels
	activePanel = panels.landing
	wallet = this.walletService.selectedWallet
	get isConfigured () {
		return this.walletService.isConfigured
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
		if (this.route.getCurrentNavigation().extras.state && this.route.getCurrentNavigation().extras.state.seed) {
			this.activePanel = panels.import
			this.importSeedModel = this.route.getCurrentNavigation().extras.state.seed
			this.isNewWallet = false
		} else if (this.route.getCurrentNavigation().extras.state && this.route.getCurrentNavigation().extras.state.key) {
			this.activePanel = panels.import
			this.importPrivateKeyModel = this.route.getCurrentNavigation().extras.state.key
			this.selectedImportOption = 'privateKey'
			this.isNewWallet = false
		}
	}

	async importExistingWallet () {
		this.importSeed = ''
		this.newPassword = ''

		await this.walletService.resetWallet()

		// load accounts and watch them update in real-time
		this.route.navigate(['accounts'])

		this.notifications.sendInfo(`Starting to scan the first 20 accounts and importing them if they have been used...`, {
			length: 7000,
		})
		await this.walletService.scanAccounts()

		this.notifications.sendSuccess(`Successfully imported wallet!`, { length: 10000 })

		// this is now called from change-rep-widget.component when new wallet
		// this.repService.detectChangeableReps()

		this.walletService.publishNewWallet()
	}

	async importSingleKeyWallet () {
		this.walletService.createWalletFromSingleKey(this.keyString, this.isExpanded)
		this.newPassword = ''
		this.route.navigate(['accounts']) // load accounts and watch them update in real-time
		this.keyString = ''

		this.notifications.sendSuccess(`Successfully imported wallet from a private key!`)
		this.walletService.publishNewWallet()
	}

	async connectLedgerByBluetooth () {
		await this.importLedgerWallet(true)
	}

	async connectLedgerByUsb () {
		await this.importLedgerWallet(false)
	}

	async importLedgerWallet (bluetooth: boolean) {
		this.notifications.sendInfo(`Checking for Ledger device...`, { identifier: 'ledger-status', length: 0 })
		try {
			// Create new ledger wallet
			const newWallet = await this.walletService.createLedgerWallet(bluetooth)
			// We skip the password panel
			this.route.navigate(['accounts']) // load accounts and watch them update in real-time
			this.walletService.publishNewWallet()
			this.notifications.sendSuccess(`Successfully connected to Ledger device`)
		} catch (err) {
			return this.notifications.sendWarning(
				`Failed to connect the Ledger device. Make sure the nano app is running on the Ledger. If the error persists: Check the <a href="https://docs.nault.cc/2020/08/04/ledger-guide.html#troubleshooting" target="_blank" rel="noopener noreferrer">troubleshooting guide</a>`,
				{ identifier: 'ledger-error', length: 0 }
			)
		} finally {
			this.notifications.removeNotification('ledger-status')
			this.notifications.removeNotification('ledger-error')
		}
	}

	// Send a confirmation dialog to the user if they already have a wallet configured
	async confirmWalletOverwrite () {
		if (!this.isConfigured) return true

		const UIkit = window['UIkit']
		try {
			const msg = this.walletService.isLedger
				? '<p class="uk-alert uk-alert-info"><br><span class="uk-flex"><span uk-icon="icon: info; ratio: 3;" class="uk-align-center"></span></span><span style="font-size: 18px;">You are about to configure a new wallet, which will <b>disconnect your Ledger device from Gnault</b>.</span><br><br>If you need to use the Ledger wallet, simply import your device again.</p><br>'
				: '<p class="uk-alert uk-alert-danger"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span><span style="font-size: 18px;">You are about to configure a new wallet, which will <b>replace your currently configured wallet</b>.</span><br><br><b style="font-size: 18px;">' +
				this.translocoService.translate('reset-wallet.before-continuing-make-sure-you-have-saved-the-nano-seed') +
				'</b><br><br><b style="font-size: 18px;">' +
				this.translocoService.translate('reset-wallet.you-will-not-be-able-to-recover-the-funds-without-a-backup') +
				'</b></p><br>'
			await UIkit.modal.confirm(msg)
			return true
		} catch (err) {
			if (!this.walletService.isLedger) {
				this.notifications.sendInfo(
					`You can use the 'Manage Wallet' page to backup your wallet's secret recovery seed and/or mnemonic`
				)
			}
			return false
		}
	}

	async setPasswordInit () {
		// if importing from existing, the format check must be done prior the password page
		if (this.isNewWallet) {
			const req = this.walletService.createNewWallet('')
			const { mnemonic, seed } = await req
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
			const isUpdated = await this.walletService.requestChangePassword()
			if (isUpdated) {
				this.activePanel = panels.backup
			}
		} else {
			// If a wallet already exists, confirm that the seed is saved
			const confirmed = await this.confirmWalletOverwrite()
			if (!confirmed) return
			if (this.selectedImportOption === 'mnemonic' || this.selectedImportOption === 'seed') {
				if (this.selectedImportOption === 'seed') {
					const existingSeed = this.importSeedModel.trim()
					if (existingSeed.length !== 64 || !this.util.nano.isValidSeed(existingSeed))
						return this.notifications.sendError(`Seed is invalid, double check it!`)
					this.importSeed = existingSeed
				} else if (this.selectedImportOption === 'mnemonic') {
					// Clean the value by trimming it and removing newlines
					const mnemonic = this.importSeedMnemonicModel.toLowerCase().replace(/\n/g, '').trim()
					const words = mnemonic.split(' ')
					if (words.length < 20) return this.notifications.sendError(`Mnemonic is too short, double check it!`)

					// Try and decode the mnemonic
					try {
						this.walletService.loadImportedWallet('BLAKE2b', '', mnemonic, 0, [0], 'seed')
					} catch (err) {
						return this.notifications.sendError(`Unable to decode mnemonic, double check it!`)
					}
				} else {
					return this.notifications.sendError(`Invalid import option`)
				}
			} else if (this.selectedImportOption === 'privateKey' || this.selectedImportOption === 'expandedKey') {
				if (this.selectedImportOption === 'privateKey') {
					this.isExpanded = false
				} else if (this.selectedImportOption === 'expandedKey') {
					this.isExpanded = true
				} else {
					return this.notifications.sendError(`Invalid import option`)
				}

				this.keyString = this.isExpanded ? this.importExpandedKeyModel : this.importPrivateKeyModel
				this.keyString = this.keyString.trim()
				if (this.isExpanded && this.keyString.length === 128) {
					// includes deterministic R value material which we ignore
					this.keyString = this.keyString.substring(0, 64)
					if (!this.util.nano.isValidSeed(this.keyString)) {
						return this.notifications.sendError(`Private key is invalid, double check it!`)
					}
				} else if (this.keyString.length !== 64 || !this.util.nano.isValidSeed(this.keyString)) {
					return this.notifications.sendError(`Private key is invalid, double check it!`)
				}
			} else if (this.selectedImportOption === 'bip39-mnemonic') {
				// If bip39, import wallet as a single private key
				let bipWallet
				try {
					bipWallet = await Wallet.load('BIP-44', '', this.importSeedBip39MnemonicModel)
					await bipWallet.unlock('')
				} catch (err) {
					return this.notifications.sendError(err.message)
				}
				if (!this.validIndex) {
					return this.notifications.sendError(`The account index is invalid, double check it!`)
				}

				// derive private key from bip39 seed using the account index provided
				const accounts = await bipWallet.accounts(
					Number(this.importSeedBip39MnemonicIndexModel),
					Number(this.importSeedBip39MnemonicIndexModel)
				)
				this.keyString = accounts[0].privateKey
				this.isExpanded = false
			}
			const isUpdated = await this.walletService.requestChangePassword()
			if (isUpdated) {
				this.activePanel = panels.final
			}
		}
	}

	confirmNewSeed () {
		if (!this.hasConfirmedBackup) {
			return this.notifications.sendWarning(`Please confirm you have saved a wallet backup!`)
		}
		this.newPassword = ''
		this.newWalletSeed = ''
		this.newWalletMnemonic = ''
		this.newWalletMnemonicLines = []
		this.saveNewWallet()
		this.activePanel = panels.final
	}

	saveWalletPassword () {
		if (this.walletPasswordModel.length < 6) {
			return this.notifications.sendWarning(
				this.translocoService.translate(
					'configure-wallet.set-wallet-password.errors.password-must-be-at-least-x-characters-long',
					{ minCharacters: 6 }
				)
			)
		}
		if (this.walletPasswordConfirmModel !== this.walletPasswordModel) {
			return this.notifications.sendError(
				this.translocoService.translate('configure-wallet.set-wallet-password.errors.passwords-do-not-match')
			)
		}
		this.newPassword = this.walletPasswordModel
		this.walletPasswordModel = ''
		this.walletPasswordConfirmModel = ''

		if (this.isNewWallet) {
			// this.walletService.createNewWallet(this.newPassword, this.wallet.wallet)
		} else if (this.selectedImportOption === 'mnemonic' || this.selectedImportOption === 'seed') {
			this.importExistingWallet()
		} else if (
			this.selectedImportOption === 'privateKey' ||
			this.selectedImportOption === 'expandedKey' ||
			this.selectedImportOption === 'bip39-mnemonic'
		) {
			this.importSingleKeyWallet()
		}
	}

	saveNewWallet () {
		this.walletService.saveWalletExport()
		this.walletService.publishNewWallet()

		this.notifications.sendSuccess(`Successfully created new wallet! Do not lose the secret recovery seed/mnemonic!`)
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
		this.notifications.removeNotification('success-copied')
		this.notifications.sendSuccess(
			this.translocoService.translate('configure-wallet.new-wallet.successfully-copied-secret-recovery-seed'),
			{ identifier: 'success-copied' }
		)
	}

	copiedNewWalletMnemonic () {
		this.notifications.removeNotification('success-copied')
		this.notifications.sendSuccess(
			this.translocoService.translate('configure-wallet.new-wallet.successfully-copied-secret-recovery-mnemonic'),
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
					return this.notifications.sendError(`Bad import data `)
				}

				const walletEncrypted = btoa(JSON.stringify(importData))
				this.route.navigate(['import-wallet'], { fragment: walletEncrypted })
			} catch (err) {
				this.notifications.sendError(`Unable to parse import data, make sure you selected the right file!`)
			}
		}

		reader.readAsText(file)
	}

	// open qr reader modal
	openQR (reference, type) {
		const qrResult = this.qrModalService.openQR(reference, type)
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
		if (this.util.string.isNumeric(index) && index % 1 === 0) {
			index = parseInt(index, 10)
			if (!this.util.nano.isValidIndex(index)) {
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

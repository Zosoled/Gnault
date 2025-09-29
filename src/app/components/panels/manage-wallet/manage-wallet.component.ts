import { formatDate } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { AmountSplitPipe, RaiPipe, SqueezePipe } from 'app/pipes'
import { ApiService, AppSettingsService, NotificationsService, UtilService, WalletService } from 'app/services'
import { ClipboardModule } from 'ngx-clipboard'
import * as QRCode from 'qrcode'

@Component({
	selector: 'app-manage-wallet',
	templateUrl: './manage-wallet.component.html',
	styleUrls: ['./manage-wallet.component.css'],
	imports: [AmountSplitPipe, ClipboardModule, FormsModule, RaiPipe, SqueezePipe, TranslocoPipe],
})
export class ManageWalletComponent implements OnInit {
	private api = inject(ApiService)
	private svcAppSettings = inject(AppSettingsService)
	private translocoService = inject(TranslocoService)
	private util = inject(UtilService)
	private svcWallet = inject(WalletService)

	notifications = inject(NotificationsService)

	accounts = this.svcWallet.accounts
	newPassword = ''
	confirmPassword = ''
	validateNewPassword = false
	validateConfirmPassword = false

	showQRExport = false
	QRExportUrl = ''
	QRExportImg = ''

	csvExportStarted = false
	transactionHistoryLimit = 500 // if the backend server limit changes, change this too
	selAccountInit = false
	invalidCsvCount = false
	invalidCsvOffset = false
	csvAccount = this.accounts[0]?.id ?? '0'
	csvCount = this.transactionHistoryLimit.toString()
	csvOffset = ''
	beyondCsvLimit = false
	exportingCsv = false
	orderOptions = [
		{ name: 'Newest Transactions First', value: false },
		{ name: 'Oldest Transactions First', value: true },
	]
	selectedOrder = this.orderOptions[0].value
	exportEnabled = true

	get isLedger () {
		return this.svcWallet.isLedger()
	}
	get isLocked () {
		return this.svcWallet.isLocked()
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

	async ngOnInit () {
		// Update selected account if changed in the sidebar
		this.svcWallet.selectedAccount$.subscribe(async (acc) => {
			if (this.selAccountInit) {
				this.csvAccount = acc?.id ?? this.accounts[0]?.id ?? '0'
			}
			this.selAccountInit = true
		})

		// Set the account selected in the sidebar as default
		if (this.svcWallet.selectedAccount() !== null) {
			this.csvAccount = this.svcWallet.selectedAccount().address
		}
	}

	async changePassword () {
		if (this.svcWallet.isLocked()) {
			const isUnlocked = await this.svcWallet.requestUnlock()
			if (!isUnlocked) {
				return
			}
		}
		const isChanged = await this.svcWallet.requestChangePassword()
		await this.svcWallet.saveWalletExport()
		this.newPassword = ''
		this.confirmPassword = ''
		isChanged
			? this.notifications.sendSuccess('Wallet password changed.')
			: this.notifications.sendError('Failed to change wallet password.')
		this.showQRExport = false
	}

	async exportWallet () {
		if (this.svcWallet.isLocked()) {
			const wasUnlocked = await this.svcWallet.requestUnlock()
			if (wasUnlocked === false) {
				return
			}
		}
		const exportUrl = this.svcWallet.generateExportUrl()
		this.QRExportUrl = exportUrl
		this.QRExportImg = await QRCode.toDataURL(exportUrl, { errorCorrectionLevel: 'M', scale: 8 })
		this.showQRExport = true
	}

	copied () {
		this.notifications.removeNotification('success-copied')
		this.notifications.sendSuccess(`Wallet seed copied to clipboard!`, { identifier: 'success-copied' })
	}

	seedMnemonic () {
		return this.svcWallet.selectedWallet()?.mnemonic
	}

	triggerFileDownload (fileName, exportData, type) {
		let blob
		// first line, include columns for spreadsheet
		let csvFile = 'account,type,amount,hash,height,time\n'

		switch (type) {
			case 'json':
				blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' })
				break
			case 'csv':
				// comma-separated attributes for each row
				const processRow = function (row) {
					let finalVal = ''
					let j = 0
					for (const [key, value] of Object.entries(row)) {
						const innerValue = value?.toString() ?? ''
						let result = innerValue.replace(/"/g, '""')
						if (result.search(/("|,| |\n)/g) >= 0) {
							result = '"' + result + '"'
						}
						if (j > 0) {
							finalVal += ','
						}
						j++
						finalVal += result
					}
					return finalVal + '\n'
				}
				for (let i = 0; i < exportData.length; i++) {
					csvFile += processRow(exportData[i])
				}
				blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' })
				break
		}

		// Check for iOS, which is weird with saving files
		const iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform)

		const elem = window.document.createElement('a')
		const objUrl = window.URL.createObjectURL(blob)
		if (iOS) {
			switch (type) {
				case 'json':
					elem.href = `data:attachment/file,${JSON.stringify(exportData)}`
					break
				case 'csv':
					elem.href = `data:attachment/file,${csvFile}`
					break
			}
		} else {
			elem.href = objUrl
		}
		elem.download = fileName
		document.body.appendChild(elem)
		elem.click()
		setTimeout(function () {
			document.body.removeChild(elem)
			window.URL.revokeObjectURL(objUrl)
		}, 200)
	}

	async exportToFile () {
		if (this.svcWallet.isLocked()) {
			const wasUnlocked = await this.svcWallet.requestUnlock()
			if (wasUnlocked === false) {
				return
			}
		}
		const fileName = `Gnault-Wallet.json`
		const exportData = this.svcWallet.generateExportData()
		this.triggerFileDownload(fileName, exportData, 'json')
		this.notifications.sendSuccess(`Wallet export downloaded!`)
	}

	csvCountChange (count) {
		if ((this.util.string.isNumeric(count) && count % 1 === 0) || count === '') {
			// only allow beyond limit if using a custom server
			if (
				this.settings.serverName !== 'custom' &&
				(parseInt(count, 10) > this.transactionHistoryLimit || count === '' || count === '0')
			) {
				this.invalidCsvCount = true
				this.beyondCsvLimit = true
			} else {
				if (parseInt(count, 10) < 0) {
					this.invalidCsvCount = true
					this.beyondCsvLimit = false
				} else {
					this.invalidCsvCount = false
					this.beyondCsvLimit = false
				}
			}
		} else {
			this.invalidCsvCount = true
		}
	}

	csvOffsetChange (offset) {
		if ((this.util.string.isNumeric(offset) && offset % 1 === 0) || offset === '') {
			if (parseInt(offset, 10) < 0) {
				this.invalidCsvOffset = true
			} else {
				this.invalidCsvOffset = false
			}
		} else {
			this.invalidCsvOffset = true
		}
	}

	csvInit () {
		this.csvExportStarted = true
	}

	async exportToCsv () {
		// disable export for a period to reduce RPC calls
		if (!this.exportEnabled) return
		this.exportEnabled = false
		setTimeout(() => (this.exportEnabled = true), 3000)

		if (this.invalidCsvCount) {
			if (this.beyondCsvLimit) {
				return this.notifications.sendWarning(
					`To export transactions above the limit, please use a custom Gnault server`
				)
			} else {
				return this.notifications.sendWarning(`Invalid limit`)
			}
		}
		if (this.invalidCsvOffset) {
			return this.notifications.sendWarning(`Invalid offset`)
		}

		this.exportingCsv = true
		const transactionCount = parseInt(this.csvCount, 10) || 0
		const transactionOffset = parseInt(this.csvOffset, 10) || 0
		const history = await this.api.accountHistory(
			this.csvAccount,
			transactionCount,
			false,
			transactionOffset,
			this.selectedOrder
		)
		this.exportingCsv = false // reset it here in case the file download fails (don't want spinning button forever)

		// contruct the export data
		const csvData = []
		if (history && history.history && history.history.length > 0) {
			history.history.forEach((a) => {
				csvData.push({
					account: a.account,
					type: a.type,
					amount: this.util.nano.rawToMnano(a.amount),
					hash: a.hash,
					height: a.height,
					time: formatDate(a.local_timestamp * 1000, 'y-MM-d HH:mm:ss', 'en-US'),
				})
			})
		}

		if (csvData.length === 0) {
			return this.notifications.sendWarning(`No transaction history found or bad server response!`)
		}

		// download file
		const order = this.selectedOrder ? '_oldestFirst' : '_newestFirst'
		const fileName = `${this.csvAccount}_offset=${this.csvOffset || 0}${order}.csv`
		this.triggerFileDownload(fileName, csvData, 'csv')
		this.notifications.sendSuccess(`Transaction history downloaded!`)
	}
}

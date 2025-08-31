import { CommonModule } from '@angular/common'
import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { ClipboardModule } from 'ngx-clipboard'
import { NanoAccountIdComponent } from 'app/components/elements'
import {
	MusigService,
	NotificationService,
	QrModalService,
	RemoteSignService,
	UtilService
} from 'app/services'

@Component({
	selector: 'app-multisig',
	templateUrl: './multisig.component.html',
	styleUrls: ['./multisig.component.css'],
	imports: [
		ClipboardModule,
		CommonModule,
		FormsModule,
		NanoAccountIdComponent
	]
})

export class MultisigComponent implements OnInit {
	@ViewChild('accountAddFocus') _el: ElementRef

	private util = inject(UtilService)
	private router = inject(Router)
	private notificationService = inject(NotificationService)
	private remoteSignService = inject(RemoteSignService)
	private qrModalService = inject(QrModalService)
	private musigService = inject(MusigService)

	accountAdd = ''
	showAddBox = false
	storedAccounts = []
	accountAddStatus: number = null
	createdMultisig = ''
	multisigAccount = ''
	multisigAccountStatus: number = null
	unsignedBlock = ''
	unsignedStatus: number = null
	wasmErrors = ['No error', 'Internal error', 'Invalid parameter(s)', 'Invalid Participant Input']

	// if displaying more info
	showAdvancedOptions = false

	async ngOnInit () { }

	copied () {
		this.notificationService.removeNotification('success-copied')
		this.notificationService.sendSuccess(`Successfully copied to clipboard!`, { identifier: 'success-copied' })
	}

	setFocus () {
		this.showAddBox = true
		// Auto set focus to the box (but must be rendered first!)
		setTimeout(() => { this._el.nativeElement.focus() }, 200)
	}

	addAccount () {
		if (this.accountAddStatus !== 1) {
			this.notificationService.removeNotification('account-invalid')
			this.notificationService.sendWarning('Invalid nano address!', { identifier: 'account-invalid' })
			return
		}
		if (this.storedAccounts.includes(this.accountAdd.replace('xrb_', 'nano_').toLocaleLowerCase())) {
			this.notificationService.removeNotification('account-added')
			this.notificationService.sendWarning('Account already added!', { identifier: 'account-added' })
			return
		}
		this.storedAccounts.push(this.accountAdd.replace('xrb_', 'nano_').toLocaleLowerCase())
		this.accountAdd = ''
		this.accountAddStatus = null
		this.showAddBox = false
		// invalidate previous multisig to avoid mistakes
		this.createdMultisig = ''
	}

	removeSelectedAccount (account) {
		this.storedAccounts.splice(this.storedAccounts.indexOf(account), 1)
		// invalidate previous multisig to avoid mistakes
		this.createdMultisig = ''
	}

	async generateMultisig () {
		const aggregate = await this.musigService.runAggregate(this.storedAccounts, null)
		this.createdMultisig = aggregate?.multisig
	}

	reset () {
		this.accountAdd = ''
		this.storedAccounts = []
		this.accountAddStatus = null
		this.createdMultisig = ''
		this.showAddBox = false
	}

	validateAccountAdd () {
		if (this.accountAdd === '') {
			this.accountAddStatus = null
			return false
		}
		if (this.util.account.isValidAccount(this.accountAdd)) {
			this.accountAddStatus = 1
			this.addAccount()
			return true
		} else {
			this.accountAddStatus = 0
			return false
		}
	}

	validateMultisig () {
		if (this.multisigAccount === '') {
			this.multisigAccountStatus = null
			return false
		}
		if (this.util.account.isValidAccount(this.multisigAccount)) {
			this.multisigAccountStatus = 1
			return true
		} else {
			this.multisigAccountStatus = 0
			return false
		}
	}

	validateUnsigned (string) {
		if (string === '') {
			this.unsignedStatus = null
			return false
		}
		let url = null
		if (string.startsWith('nanosign:')) {
			url = new URL(string)
		}
		if (url && this.remoteSignService.checkSignBlock(url.pathname)) {
			this.unsignedStatus = 1
		} else {
			this.unsignedStatus = 0
		}
	}

	navigateAccount () {
		if (this.validateMultisig()) {
			this.router.navigate(['account', this.multisigAccount], { queryParams: { sign: 1 } })
		} else {
			this.notificationService.sendWarning('Invalid nano account!')
		}
	}

	navigateBlock (block) {
		let badScheme = false

		if (block.startsWith('nanosign:') || block.startsWith('nanoprocess:')) {
			const url = new URL(block)
			if (url.protocol === 'nanosign:') {
				this.remoteSignService.navigateSignBlock(url)
			} else if (url.protocol === 'nanoprocess:') {
				this.remoteSignService.navigateProcessBlock(url)
			} else {
				badScheme = true
			}
		} else {
			badScheme = true
		}
		if (badScheme) {
			this.notificationService.sendWarning('Not a recognized block format!', { length: 5000 })
		}
	}

	// open qr reader modal
	openQR (reference, type) {
		const qrResult = this.qrModalService.openQR(reference, type)
		qrResult.then((data) => {
			switch (data.reference) {
				case 'accountAdd':
					this.accountAdd = data.content
					this.validateAccountAdd()
					break
				case 'multisig':
					this.multisigAccount = data.content
					this.validateMultisig()
					break
			}
		}, () => { }
		)
	}
}

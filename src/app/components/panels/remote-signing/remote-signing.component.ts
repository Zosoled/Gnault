import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import {
	AddressBookService,
	NotificationsService,
	QrModalService,
	RemoteSignService,
	UtilService
} from 'app/services'
import { BehaviorSubject } from 'rxjs'

@Component({
	selector: 'app-send',
	templateUrl: './remote-signing.component.html',
	styleUrls: ['./remote-signing.component.css'],
	imports: [
		CommonModule,
		FormsModule
	]
})
export class RemoteSigningComponent implements OnInit {
	private router = inject(Router)
	private svcAddressBook = inject(AddressBookService)
	private svcNotifications = inject(NotificationsService)
	private svcQrModal = inject(QrModalService)
	private svcRemoteSign = inject(RemoteSignService)
	private svcUtil = inject(UtilService)

	toAccountID = ''
	toAccountStatus: number = null
	unsignedBlock = ''
	signedBlock = ''
	unsignedStatus: number = null
	signedStatus: number = null
	addressBookResults$ = new BehaviorSubject([])
	showAddressBook = false
	addressBookMatch = ''

	async ngOnInit () {
		this.svcAddressBook.loadAddressBook()
	}

	validateDestination () {
		// The timeout is used to solve a bug where the results get hidden too fast and the click is never registered
		setTimeout(() => this.showAddressBook = false, 400)

		if (this.toAccountID === '') {
			this.toAccountStatus = null
			return false
		}
		if (this.svcUtil.account.isValidAccount(this.toAccountID)) {
			this.toAccountStatus = 1
			return true
		} else {
			this.toAccountStatus = 0
			return false
		}
	}

	searchAddressBook () {
		this.showAddressBook = true
		const search = this.toAccountID || ''
		const addressBook = this.svcAddressBook.addressBook

		const matches = addressBook
			.filter(a => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
			.slice(0, 5)

		this.addressBookResults$.next(matches)
	}

	selectBookEntry (account) {
		this.showAddressBook = false
		this.toAccountID = account
		this.searchAddressBook()
		this.validateDestination()
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
		if (url && this.svcRemoteSign.checkSignBlock(url.pathname)) {
			this.unsignedStatus = 1
		} else {
			this.unsignedStatus = 0
		}
	}

	validateSigned (string) {
		if (string === '') {
			this.signedStatus = null
			return false
		}
		let url = null
		if (string.startsWith('nanoprocess:')) {
			url = new URL(string)
		}
		if (url && this.svcRemoteSign.checkSignBlock(url.pathname) && this.svcRemoteSign.checkProcessBlock(url.pathname)) {
			this.signedStatus = 1
		} else {
			this.signedStatus = 0
		}
	}

	start () {
		if (this.validateDestination()) {
			this.router.navigate(['account', this.toAccountID], { queryParams: { sign: 1 } })
		} else {
			this.svcNotifications.sendWarning('Invalid nano account!')
		}
	}

	navigateBlock (block) {
		let badScheme = false

		if (block.startsWith('nanosign:') || block.startsWith('nanoprocess:')) {
			const url = new URL(block)
			if (url.protocol === 'nanosign:') {
				this.svcRemoteSign.navigateSignBlock(url)
			} else if (url.protocol === 'nanoprocess:') {
				this.svcRemoteSign.navigateProcessBlock(url)
			} else {
				badScheme = true
			}
		} else {
			badScheme = true
		}
		if (badScheme) {
			this.svcNotifications.sendWarning('Not a recognized block format!', { length: 5000 })
		}
	}

	// open qr reader modal
	async openQR (reference, type): Promise<void> {
		const data = await this.svcQrModal.openQR(reference, type)
		if (data.reference === 'account1') {
			this.toAccountID = data.content
		}
	}
}

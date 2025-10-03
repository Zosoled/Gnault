import { inject, Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import { AppSettingsService } from './app-settings.service'

interface AddressBookEntry {
	account: string
	name: string
	trackBalance: boolean
	trackTransactions: boolean
}

@Injectable({ providedIn: 'root' })
export class AddressBookService {
	private svcAppSettings = inject(AppSettingsService)

	readonly storeKey: 'Gnault-AddressBook' = 'Gnault-AddressBook'

	addressBook: AddressBookEntry[] = []
	addressBook$ = new BehaviorSubject([])

	get settings () {
		return this.svcAppSettings.settings()
	}

	loadAddressBook () {
		const storage: Storage = globalThis[this.settings.storage]
		const data = storage?.getItem?.(this.storeKey)
		this.addressBook = JSON.parse(data ?? '[]')
		this.addressBook$.next(this.addressBook)
		return this.addressBook
	}

	async saveAddress (account, name, trackBalance, trackTransactions) {
		const existingName = this.addressBook.find(a => a.name.toLowerCase() === name.toLowerCase())
		if (existingName) {
			const accountIndex = this.addressBook.findIndex(a => a.name.toLowerCase() === name.toLowerCase())
			// return if the name exist and the tracking is unchanged
			if (this.addressBook[accountIndex].trackBalance === trackBalance &&
				this.addressBook[accountIndex].trackTransactions === trackTransactions) return
		}

		const existingAccount = this.addressBook.find(a => a.account.toLowerCase() === account.toLowerCase())
		if (existingAccount) {
			existingAccount.name = name
			existingAccount.trackBalance = trackBalance
			existingAccount.trackTransactions = trackTransactions
		} else {
			this.addressBook.push({ account, name, trackBalance, trackTransactions })
		}
		this.saveAddressBook()
		this.addressBook$.next(this.addressBook)
	}

	deleteAddress (account) {
		const existingAccountIndex = this.addressBook.findIndex(a => a.account.toLowerCase() === account.toLowerCase())
		if (existingAccountIndex === -1) return

		this.addressBook.splice(existingAccountIndex, 1)
		this.saveAddressBook()
		this.addressBook$.next(this.addressBook)
	}

	saveAddressBook (): void {
		localStorage.setItem(this.storeKey, JSON.stringify(this.addressBook))
	}

	clearAddressBook (): void {
		this.addressBook = []
		this.addressBook$.next(this.addressBook)
		localStorage.removeItem(this.storeKey)
	}

	setAddressBookOrder (addressList) {
		this.addressBook = addressList
			.map(address => ({
				account: address,
				name: this.getAccountName(address),
				trackBalance: this.getBalanceTrackingById(address),
				trackTransactions: this.getTransactionTrackingById(address)
			}))
			.filter(entry => entry.name !== null)

		this.saveAddressBook()
		this.addressBook$.next(this.addressBook)
	}

	getAccountName (account: string): string | null {
		if (!account || !account.length) return null
		const match = this.addressBook.find(a => a.account.toLowerCase() === account.toLowerCase())
		return match && match.name || null
	}

	getAccountIdByName (name: string): string | null {
		if (!name?.length) return null
		const match = this.addressBook.find(a => a.name.toLowerCase() === name.toLowerCase())
		return match?.account ?? null
	}

	nameExists (name: string): boolean {
		return this.addressBook.findIndex(a => a.name.toLowerCase() === name.toLowerCase()) !== -1
	}

	getBalanceTrackingById (account: string): boolean {
		if (!account || !account.length) return false
		const match = this.addressBook.find(a => a.account.toLowerCase() === account.toLowerCase())
		return match && match.trackBalance || false
	}

	getTransactionTrackingById (account: string): boolean {
		if (!account || !account.length) return false
		const match = this.addressBook.find(a => a.account.toLowerCase() === account.toLowerCase())
		return match && match.trackTransactions || false
	}

}

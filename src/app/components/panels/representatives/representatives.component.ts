import { CommonModule } from '@angular/common'
import { Component, OnInit, ViewChild, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'
import { NanoAddressComponent } from 'app/components/elements'
import { AmountSplitPipe, RaiPipe } from 'app/pipes'
import {
	AppSettingsService,
	FullRepresentativeOverview,
	NanoBlockService,
	NinjaService,
	NotificationsService,
	QrModalService,
	RepresentativeService,
	UtilService,
	WalletApiAccount,
	WalletService
} from 'app/services'
import { Account, Tools } from 'libnemo'
import { BehaviorSubject } from 'rxjs'

@Component({
	selector: 'app-representatives',
	templateUrl: './representatives.component.html',
	styleUrls: ['./representatives.component.css'],
	imports: [
		AmountSplitPipe,
		CommonModule,
		FormsModule,
		NanoAddressComponent,
		RaiPipe,
		TranslocoDirective,
	],
})
export class RepresentativesComponent implements OnInit {
	private router = inject(ActivatedRoute)
	private svcAppSettings = inject(AppSettingsService)
	private svcNanoBlock = inject(NanoBlockService)
	private svcNinja = inject(NinjaService)
	private svcNotifications = inject(NotificationsService)
	private svcQrModal = inject(QrModalService)
	private svcRepresentative = inject(RepresentativeService)
	private svcTransloco = inject(TranslocoService)
	private svcUtil = inject(UtilService)

	svcWallet = inject(WalletService)

	@ViewChild('repInput') repInput

	changeAccountID: any = null
	toRepresentativeID = ''

	representativeResults$ = new BehaviorSubject([])
	showRepresentatives = false
	representativeListMatch = ''

	representativeOverview = []
	changingRepresentatives = false

	accountsToRedelegate: Account[] = []
	repConstituentAccounts: WalletApiAccount[] = []

	recommendedReps = []
	recommendedRepsPaginated = []
	recommendedRepsLoading = false
	selectedRecommendedRep = null
	showRecommendedReps = false
	loadingRepresentatives = false

	repsPerPage = 5
	currentRepPage = 0

	hideOverview = false

	representativeList = []

	settings = computed(() => this.svcAppSettings.settings())

	async ngOnInit () {
		this.svcRepresentative.loadRepresentativeList()

		// Listen for query parameters that set defaults
		this.router.queryParams.subscribe((params) => {
			this.hideOverview = params && params.hideOverview
			this.showRecommendedReps = params && params.showRecommended

			if (params && params.accounts) {
				this.accountsToRedelegate = [] // Reset the preselected accounts
				const accounts = params.accounts.split(',')
				for (const account of accounts) {
					this.appendAccountToRedelegate(account)
				}
			}
			if (params && params.representative) {
				this.selectRepresentative(params.representative)
			}
		})

		this.loadingRepresentatives = true
		let repOverview = await this.svcRepresentative.getRepresentativesOverview()
		// Sort by weight delegated
		repOverview = repOverview.sort((a: FullRepresentativeOverview, b: FullRepresentativeOverview) => {
			return a.delegatedWeight < b.delegatedWeight ? -1 : 1
		})
		this.representativeOverview = repOverview
		repOverview.forEach((o) => this.repConstituentAccounts.push(...o.accounts))
		this.loadingRepresentatives = false

		this.populateRepresentativeList()

		await this.loadRecommendedReps()
	}

	async populateRepresentativeList () {
		// add trusted/regular local reps to the list
		const localReps = this.svcRepresentative.getSortedRepresentatives()
		this.representativeList.push(...localReps.filter((rep) => !rep.warn))

		if (this.settings().serverAPI) {
			const verifiedReps = await this.svcNinja.recommendedRandomized()

			// add random recommended reps to the list
			for (const representative of verifiedReps) {
				const temprep = {
					id: representative.account,
					name: representative.alias,
				}

				this.representativeList.push(temprep)
			}
		}

		// add untrusted local reps to the list
		this.representativeList.push(...localReps.filter((rep) => rep.warn))
	}

	getAccountLabel (account) {
		const addressBookName = account.addressBookName
		if (addressBookName != null) {
			return addressBookName
		}
		const walletAccount = this.svcWallet.accounts.find((a) => a.address === account.address)
		if (walletAccount == null) {
			return this.svcTransloco.translate('general.account')
		}
		return this.svcTransloco.translate('general.account') + ' #' + walletAccount.index
	}

	addSelectedAccounts (accounts) {
		for (const account of accounts) {
			this.appendAccountToRedelegate(account.address)
		}
		// Scroll to the representative input
		setTimeout(() => this.repInput.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
	}

	appendAccountToRedelegate (address: string | Event) {
		if (address instanceof Event) {
			address = (address.target as HTMLSelectElement).value
		}
		if (address === 'all' || this.changeAccountID === 'all') {
			this.accountsToRedelegate = [...this.svcWallet.accounts]
			return
		}

		const existingAccount = this.accountsToRedelegate.find((a) => a.address === address)
		if (existingAccount) {
			return // Already selected
		}

		const walletAccount = this.svcWallet.getWalletAccount(address)
		this.accountsToRedelegate.push(walletAccount)

		setTimeout(() => (this.changeAccountID = null), 10)
	}

	/**
	 * Remove account from selection of accounts changing reps.
	 * @param account
	 */
	removeSelectedAccount (account) {
		this.accountsToRedelegate.splice(this.accountsToRedelegate.indexOf(account), 1)
	}

	searchRepresentatives () {
		this.showRepresentatives = true
		const search = this.toRepresentativeID || ''

		const matches = this.representativeList
			.filter((a) => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
			// remove duplicate accounts
			.filter((item, pos, self) => this.svcUtil.array.findWithAttr(self, 'id', item.id) === pos)
			.slice(0, 5)

		this.representativeResults$.next(matches)
	}

	selectRepresentative (rep) {
		this.showRepresentatives = false
		this.toRepresentativeID = rep
		this.searchRepresentatives()
		this.validateRepresentative()
	}

	async validateRepresentative () {
		setTimeout(() => (this.showRepresentatives = false), 400)
		this.toRepresentativeID = this.toRepresentativeID.replace(/ /g, '')

		if (this.toRepresentativeID === '') {
			this.representativeListMatch = ''
			return
		}

		const rep = this.svcRepresentative.getRepresentative(this.toRepresentativeID)
		const ninjaRep = await this.svcNinja.getAccount(this.toRepresentativeID)

		if (rep) {
			this.representativeListMatch = rep.name
		} else if (ninjaRep) {
			this.representativeListMatch = ninjaRep.alias
		} else {
			this.representativeListMatch = ''
		}
	}

	async loadRecommendedReps () {
		this.recommendedRepsLoading = true
		try {
			const scores = (await this.svcNinja.recommended()) as any[]
			const totalSupply = 133248289

			const reps = scores.map((rep) => {
				const nanoWeight = parseFloat(Tools.convert(BigInt(rep.weight ?? 0n), 'raw', 'mnano'))
				const percent = (nanoWeight / totalSupply) * 100

				// rep.weight = nanoWeight.toString(10)
				rep.weight = this.svcUtil.nano.mnanoToRaw(nanoWeight)
				rep.percent = percent.toFixed(3)

				return rep
			})

			this.recommendedReps = reps

			this.calculatePage()
			this.recommendedRepsLoading = false
		} catch (err) {
			this.recommendedRepsLoading = null
		}
	}

	previousReps () {
		if (this.currentRepPage > 0) {
			this.currentRepPage--
			this.calculatePage()
		}
	}
	nextReps () {
		if (this.currentRepPage < this.recommendedReps.length / this.repsPerPage - 1) {
			this.currentRepPage++
		} else {
			this.currentRepPage = 0
		}
		this.calculatePage()
	}

	calculatePage () {
		this.recommendedRepsPaginated = this.recommendedReps.slice(
			this.currentRepPage * this.repsPerPage,
			this.currentRepPage * this.repsPerPage + this.repsPerPage
		)
	}

	selectRecommendedRep (rep) {
		this.selectedRecommendedRep = rep
		this.toRepresentativeID = rep.account
		this.showRecommendedReps = false
		this.representativeListMatch = rep.alias // We will save if they use this, so this is a nice little helper
	}

	/**
	 * Process a change block for each account selected for redelegation.
	 */
	async changeRepresentatives (): Promise<void> {
		// Already running
		if (this.changingRepresentatives) {
			return
		}
		if (this.svcWallet.isLocked()) {
			await this.svcWallet.requestUnlock()
			if (this.svcWallet.isLocked()) {
				return
			}
		}
		if (!this.accountsToRedelegate.length) {
			return this.svcNotifications.sendWarning('Select at least one account to change.')
		}
		this.changingRepresentatives = true

		const wallet = this.svcWallet.selectedWallet()
		const newRep = this.toRepresentativeID

		const valid = this.svcUtil.account.isValidAccount(newRep)
		if (!valid) {
			this.changingRepresentatives = false
			return this.svcNotifications.sendWarning('Invalid representative.')
		}

		const accountsToChange = this.changeAccountID === 'all'
			? this.svcWallet.accounts
			: this.accountsToRedelegate

		// Remove account if info not found or already delegating to this rep
		const accountsNeedingChange = accountsToChange
			.filter((account) => this.repConstituentAccounts
				.find(({ address, error, representative }) => address === account.address && !error && representative.toLowerCase() !== newRep.toLowerCase()))
		if (!accountsNeedingChange.length) {
			this.changingRepresentatives = false
			return this.svcNotifications.sendInfo(`None of the accounts selected need to be updated`)
		}

		for (const account of accountsNeedingChange) {
			try {
				const changed = await this.svcNanoBlock.generateChange(wallet, account, newRep, this.svcWallet.isLedger())
				if (!changed) {
					this.svcNotifications.sendError(`Error changing representative for ${account.address}, please try again`)
				}
			} catch (err) {
				this.svcNotifications.sendError(`Error changing representative for ${account.address}. ${err?.message ?? err}`)
			}
		}

		// Determine if a recommended rep was selected, if so we save an entry in the rep list
		if (
			this.selectedRecommendedRep &&
			this.selectedRecommendedRep.account &&
			this.selectedRecommendedRep.account === newRep
		) {
			this.svcRepresentative.saveRepresentative(newRep, this.selectedRecommendedRep.alias, false, false)
		}

		// Good to go!
		this.accountsToRedelegate = []
		this.toRepresentativeID = ''
		this.representativeListMatch = ''
		this.changingRepresentatives = false
		this.selectedRecommendedRep = null

		this.svcNotifications.sendSuccess('Representative updated successfully.')

		// If the overview panel is displayed, reload its data now
		if (!this.hideOverview) {
			this.loadingRepresentatives = true
			this.representativeOverview = await this.svcRepresentative.getRepresentativesOverview()
			this.loadingRepresentatives = false
		}

		// Detect if any new reps should be changed
		await this.svcRepresentative.detectChangeableReps(this.hideOverview ? null : this.representativeOverview)
	}

	// open qr reader modal
	openQR (reference, type) {
		const qrResult = this.svcQrModal.openQR(reference, type)
		qrResult.then(
			(data) => {
				switch (data.reference) {
					case 'rep1':
						this.toRepresentativeID = data.content
						this.validateRepresentative()
						break
				}
			},
			() => { }
		)
	}
}

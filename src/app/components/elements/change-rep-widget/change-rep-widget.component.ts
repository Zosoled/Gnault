import { Component, OnInit, inject } from '@angular/core'
import { Router } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { NanoBlockService, RepresentativeService, WalletService } from 'app/services'
import { Account } from 'libnemo'

@Component({
	selector: 'app-change-rep-widget',
	templateUrl: './change-rep-widget.component.html',
	styleUrls: ['./change-rep-widget.component.css'],
	imports: [TranslocoPipe],
})
export class ChangeRepWidgetComponent implements OnInit {
	private router = inject(Router)
	private svcNanoBlock = inject(NanoBlockService)
	private svcRepresentative = inject(RepresentativeService)
	private svcWallet = inject(WalletService)

	changeableRepresentatives = this.svcRepresentative.changeableReps
	displayedRepresentatives = []
	representatives = []
	showRepChangeRequired = false
	showRepHelp = false
	selectedAccount = null
	selectedAccountHasRepresentative = false
	initialLoadComplete = false

	async ngOnInit () {
		this.svcRepresentative.walletReps$.subscribe(async (reps) => {
			if (reps[0] === null) {
				// initial state from new BehaviorSubject([null])
				return
			}

			this.representatives = reps
			await this.updateChangeableRepresentatives()
			this.updateDisplayedRepresentatives()
			this.initialLoadComplete = true
		})

		this.svcWallet.selectedAccount$.subscribe((account: Account) => {
			this.selectedAccount = account
			this.updateDisplayedRepresentatives()
		})

		// Detect if a wallet is reset
		this.svcWallet.newWallet$.subscribe((shouldReload) => {
			if (shouldReload) {
				this.resetRepresentatives()
			}
		})

		// Detect if a new open block is received
		this.svcNanoBlock.newOpenBlock$.subscribe(async (shouldReload) => {
			if (shouldReload) {
				await this.svcRepresentative.getRepresentativesOverview() // calls walletReps$.next
			}
		})

		this.svcRepresentative.changeableReps$.subscribe(async (reps) => {
			// Includes both acceptable and bad reps
			// When user clicks 'Rep Change Required' action, acceptable reps will also be included
			this.changeableRepresentatives = reps

			// However 'Rep Change Required' action will only appear when there is at least one bad rep
			this.showRepChangeRequired = reps.some((rep) => rep.status.changeRequired === true)

			this.updateDisplayedRepresentatives()
		})

		this.selectedAccount = this.svcWallet.selectedAccount()
		this.updateSelectedAccountHasRep()
		// calls walletReps$.next
		await this.svcRepresentative.getRepresentativesOverview()
	}

	async resetRepresentatives () {
		console.log('Reloading representatives..')
		this.initialLoadComplete = false
		this.selectedAccount = null
		this.representatives = []
		this.changeableRepresentatives = []
		this.showRepChangeRequired = false
		this.updateDisplayedRepresentatives()
		// calls walletReps$.next
		await this.svcRepresentative.getRepresentativesOverview()
		console.log('Representatives reloaded')
	}

	async updateChangeableRepresentatives () {
		await this.svcRepresentative.detectChangeableReps(this.representatives)
	}

	updateDisplayedRepresentatives () {
		this.updateSelectedAccountHasRep()
		this.displayedRepresentatives = this.getDisplayedRepresentatives(this.representatives)
	}

	includeRepRequiringChange (displayedReps: any[]) {
		const repRequiringChange = this.changeableRepresentatives
			.sort((a, b) => b.delegatedWeight.minus(a.delegatedWeight))
			.filter((changeableRep) => {
				const isNoDisplayedRepChangeable = displayedReps.every((displayedRep) => displayedRep.id !== changeableRep.id)
				return changeableRep.status.changeRequired && isNoDisplayedRepChangeable
			})[0]

		if (!!repRequiringChange) {
			displayedReps.push(Object.assign({}, repRequiringChange))
		}
		return displayedReps
	}

	updateSelectedAccountHasRep () {
		if (this.selectedAccount == null) {
			const accounts = this.svcWallet.accounts
			this.selectedAccountHasRepresentative = accounts.some((a) => a.frontier)
		} else {
			this.selectedAccountHasRepresentative = this.selectedAccount.frontier != null
		}
	}

	getDisplayedRepresentatives (representatives: any[]) {
		if (this.representatives?.length === 0) {
			return []
		}

		if (this.selectedAccount !== null) {
			const selectedAccountRep = this.representatives.filter((rep) =>
				rep.accounts.some((a) => a.address === this.selectedAccount.address)
			)[0]

			if (selectedAccountRep == null) {
				return []
			}
			const displayedRepsAllAccounts = [Object.assign({}, selectedAccountRep)]
			return this.includeRepRequiringChange(displayedRepsAllAccounts)
		}

		// sort by ascending delegated voting weight
		const sortedRepresentatives: any[] = [...representatives].sort((a, b) => b.delegatedWeight - a.delegatedWeight)

		const displayedReps = [Object.assign({}, sortedRepresentatives[0])]
		return this.includeRepRequiringChange(displayedReps)
	}

	sleep (ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	showRepSelectionForSpecificRep (clickedRep) {
		this.showRepHelp = false
		const selectedAccountMatchesClickedRep =
			this.selectedAccount !== null && clickedRep.accounts.some((a) => a.address === this.selectedAccount.address)
		const accountsToChangeRepFor = selectedAccountMatchesClickedRep
			? this.selectedAccount.address
			: // all accounts that delegate to this rep
			this.representatives
				.filter((rep) => rep.id === clickedRep.id)
				.map((rep) => {
					rep.accounts.map((a) => a.address).join(',')
				})
				.join(',')

		this.router.navigate(['/representatives'], {
			queryParams: { hideOverview: true, accounts: accountsToChangeRepFor, showRecommended: true },
		})
	}

	showRepSelectionForAllChangeableReps () {
		const allAccounts = this.changeableRepresentatives
			.map((rep) => {
				rep.accounts.map((a) => a.address).join(',')
			})
			.join(',')
		this.router.navigate(['/representatives'], {
			queryParams: { hideOverview: true, accounts: allAccounts, showRecommended: true },
		})
	}
}

import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { Router } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { NanoBlockService, RepresentativeService, WalletService } from 'app/services'

@Component({
	selector: 'app-change-rep-widget',
	templateUrl: './change-rep-widget.component.html',
	styleUrls: ['./change-rep-widget.component.css'],
	imports: [
		CommonModule,
		TranslocoPipe
	]
})

export class ChangeRepWidgetComponent implements OnInit {
	private walletService = inject(WalletService)
	private blockService = inject(NanoBlockService)
	private repService = inject(RepresentativeService)
	private router = inject(Router)

	changeableRepresentatives = this.repService.changeableReps
	displayedRepresentatives = []
	representatives = []
	showRepChangeRequired = false
	showRepHelp = false
	selectedAccount = null
	selectedAccountHasRepresentative = false
	initialLoadComplete = false

	async ngOnInit () {
		this.repService.walletReps$.subscribe(async reps => {
			if (reps[0] === null) {
				// initial state from new BehaviorSubject([null])
				return
			}

			this.representatives = reps
			await this.updateChangeableRepresentatives()
			this.updateDisplayedRepresentatives()
			this.initialLoadComplete = true
		})

		this.walletService.selectedAccount$.subscribe(async acc => {
			this.selectedAccount = acc
			this.updateDisplayedRepresentatives()
		})

		// Detect if a wallet is reset
		this.walletService.newWallet$.subscribe(shouldReload => {
			if (shouldReload) {
				this.resetRepresentatives()
			}
		})

		// Detect if a new open block is received
		this.blockService.newOpenBlock$.subscribe(async shouldReload => {
			if (shouldReload) {
				await this.repService.getRepresentativesOverview() // calls walletReps$.next
			}
		})

		this.repService.changeableReps$.subscribe(async reps => {
			// Includes both acceptable and bad reps
			// When user clicks 'Rep Change Required' action, acceptable reps will also be included
			this.changeableRepresentatives = reps

			// However 'Rep Change Required' action will only appear when there is at least one bad rep
			this.showRepChangeRequired = reps.some(rep => (rep.status.changeRequired === true))

			this.updateDisplayedRepresentatives()
		})

		this.selectedAccount = this.walletService.selectedAccount
		this.updateSelectedAccountHasRep()
		// calls walletReps$.next
		await this.repService.getRepresentativesOverview()
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
		await this.repService.getRepresentativesOverview()
		console.log('Representatives reloaded')
	}

	async updateChangeableRepresentatives () {
		await this.repService.detectChangeableReps(this.representatives)
	}

	updateDisplayedRepresentatives () {
		this.updateSelectedAccountHasRep()
		this.displayedRepresentatives = this.getDisplayedRepresentatives(this.representatives)
	}

	includeRepRequiringChange (displayedReps: any[]) {
		const repRequiringChange = this.changeableRepresentatives
			.sort((a, b) => b.delegatedWeight.minus(a.delegatedWeight))
			.filter(changeableRep => {
				const isNoDisplayedRepChangeable = displayedReps.every(displayedRep => displayedRep.id !== changeableRep.id)
				return changeableRep.status.changeRequired && isNoDisplayedRepChangeable
			})[0]

		if (!!repRequiringChange) {
			displayedReps.push(Object.assign({}, repRequiringChange))
		}
		return displayedReps
	}

	updateSelectedAccountHasRep () {
		if (this.selectedAccount !== null) {
			if (this.selectedAccount !== null) {
				this.selectedAccountHasRepresentative = !!this.selectedAccount.frontier
				return
			}
			const accounts = this.walletService.accounts
			this.selectedAccountHasRepresentative = accounts.some(a => a.frontier)
		}
	}

	getDisplayedRepresentatives (representatives: any[]) {
		if (this.representatives.length === 0) {
			return []
		}

		if (this.selectedAccount !== null) {
			const selectedAccountRep = this.representatives
				.filter(rep => rep.accounts.some(a => a.id === this.selectedAccount.id))[0]

			if (selectedAccountRep == null) {
				return []
			}

			const displayedRepsAllAccounts = [Object.assign({}, selectedAccountRep)]

			return this.includeRepRequiringChange(displayedRepsAllAccounts)
		}

		const sortedRepresentatives: any[] = [...representatives]

		sortedRepresentatives.sort((a, b) => b.delegatedWeight.minus(a.delegatedWeight))

		const displayedReps = [Object.assign({}, sortedRepresentatives[0])]

		return this.includeRepRequiringChange(displayedReps)
	}

	sleep (ms) {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	showRepSelectionForSpecificRep (clickedRep) {
		this.showRepHelp = false
		const selectedAccountMatchesClickedRep = (
			this.selectedAccount !== null
			&& clickedRep.accounts.some(a => (a.id === this.selectedAccount.id))
		)
		const accountsToChangeRepFor = selectedAccountMatchesClickedRep
			? this.selectedAccount.id
			: // all accounts that delegate to this rep
			this.representatives
				.filter(rep => rep.id === clickedRep.id)
				.map(rep => {
					rep.accounts.map(a => a.id).join(',')
				})
				.join(',')

		this.router.navigate(['/representatives'], {
			queryParams: { hideOverview: true, accounts: accountsToChangeRepFor, showRecommended: true }
		})
	}

	showRepSelectionForAllChangeableReps () {
		const allAccounts = this.changeableRepresentatives
			.map(rep => {
				rep.accounts.map(a => a.id).join(',')
			})
			.join(',')
		this.router.navigate(['/representatives'], { queryParams: { hideOverview: true, accounts: allAccounts, showRecommended: true } })
	}
}

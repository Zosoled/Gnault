import { AfterViewInit, Component, effect, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslocoDirective } from '@jsverse/transloco'
import { FullRepresentativeOverview, NanoBlockService, RepresentativeService, WalletService } from 'app/services'

@Component({
	selector: 'app-change-rep-widget',
	templateUrl: './change-rep-widget.component.html',
	styleUrls: ['./change-rep-widget.component.css'],
	imports: [TranslocoDirective],
})
export class ChangeRepWidgetComponent implements AfterViewInit {
	private router = inject(Router)
	private svcNanoBlock = inject(NanoBlockService)
	private svcRepresentative = inject(RepresentativeService)
	private svcWallet = inject(WalletService)

	changeableRepresentatives = this.svcRepresentative.changeableReps
	displayedRepresentatives = signal<FullRepresentativeOverview[]>([])
	representatives: FullRepresentativeOverview[] = []
	showRepChangeRequired = false
	showRepHelp = null
	selectedAccountHasRepresentative = false
	initialLoadComplete = false

	constructor () {
		effect(() => {
			this.svcWallet.selectedAccount()
			this.updateDisplayedRepresentatives()
		})

		effect(() => {
			this.svcWallet.wallets()
			this.resetRepresentatives()
		})
	}

	async ngAfterViewInit () {
		this.svcRepresentative.walletReps$.subscribe(async (reps) => {
			if (reps[0] === null) {
				// initial state from new BehaviorSubject([null])
				return
			}

			this.representatives = reps.map((r) => ({
				...r,
				address: '',
				percent: 0,
				statusText: '',
				label: null,
				status: {
					online: false,
					veryHighWeight: false,
					highWeight: false,
					veryLowUptime: false,
					lowUptime: false,
					closing: false,
					markedToAvoid: false,
					markedAsNF: false,
					trusted: false,
					daysSinceLastVoted: 0,
					changeRequired: false,
					warn: false,
					known: false,
					uptime: null,
					score: null,
				},
			}))

			await this.updateChangeableRepresentatives()
			this.updateDisplayedRepresentatives()
			this.initialLoadComplete = true
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

		this.updateSelectedAccountHasRep()
		// calls walletReps$.next
		await this.svcRepresentative.getRepresentativesOverview()
	}

	async resetRepresentatives () {
		console.log('Reloading representatives..')
		this.initialLoadComplete = false
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
		this.displayedRepresentatives.set(this.getDisplayedRepresentatives(this.representatives))
	}

	includeRepRequiringChange (displayedReps: any[]) {
		const repRequiringChange = this.changeableRepresentatives
			.sort((a, b) => Number(b.delegatedWeight - a.delegatedWeight))
			.filter((changeableRep) => {
				const isNoDisplayedRepChangeable = displayedReps.every((displayedRep) => displayedRep.address !== changeableRep.address)
				return changeableRep.status.changeRequired && isNoDisplayedRepChangeable
			})[0]

		if (!!repRequiringChange) {
			displayedReps.push(Object.assign({}, repRequiringChange))
		}
		return displayedReps
	}

	updateSelectedAccountHasRep () {
		const account = this.svcWallet.selectedAccount()
		if (account == null) {
			const accounts = this.svcWallet.accounts()
			this.selectedAccountHasRepresentative = accounts.some((a) => a.frontier)
		} else {
			this.selectedAccountHasRepresentative = account.frontier != null
		}
	}

	getDisplayedRepresentatives (representatives: FullRepresentativeOverview[]) {
		if (this.representatives?.length === 0) {
			return []
		}
		const account = this.svcWallet.selectedAccount()
		if (account !== null) {
			const selectedAccountRep = this.representatives.filter((rep) =>
				rep.accounts.some((a) => a.address === account.address)
			)[0]

			if (selectedAccountRep == null) {
				return []
			}
			const displayedRepsAllAccounts = [Object.assign({}, selectedAccountRep)]
			return this.includeRepRequiringChange(displayedRepsAllAccounts)
		}

		// sort by ascending delegated voting weight
		const sortedRepresentatives = [...representatives].sort((a, b) => Number(b.delegatedWeight - a.delegatedWeight))

		const displayedReps = [Object.assign({}, sortedRepresentatives[0])]
		return this.includeRepRequiringChange(displayedReps)
	}

	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

	showRepSelectionForSpecificRep (clickedRep) {
		const account = this.svcWallet.selectedAccount()
		this.showRepHelp = false
		const selectedAccountMatchesClickedRep =
			account !== null && clickedRep.accounts.some((a) => a.address === account.address)
		const accountsToChangeRepFor = selectedAccountMatchesClickedRep
			? account.address
			: // all accounts that delegate to this rep
			this.representatives
				.filter((rep) => rep.address === clickedRep.address)
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

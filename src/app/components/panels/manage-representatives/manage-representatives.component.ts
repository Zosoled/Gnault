
import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { ClipboardModule } from 'ngx-clipboard'
import { map } from 'rxjs/operators'
import { NanoAccountIdComponent } from 'app/components/elements'
import {
	ApiService,
	NotificationsService,
	RepresentativeService,
	UtilService
} from 'app/services'

@Component({
	selector: 'app-manage-representatives',
	templateUrl: './manage-representatives.component.html',
	styleUrls: ['./manage-representatives.component.css'],
	imports: [
		ClipboardModule,
		CommonModule,
		FormsModule,
		NanoAccountIdComponent,
		RouterModule
	]
})

export class ManageRepresentativesComponent implements OnInit, AfterViewInit {
	private api = inject(ApiService)
	private notificationService = inject(NotificationsService)
	private repService = inject(RepresentativeService)
	private util = inject(UtilService)

	activePanel = 0
	creatingNewEntry = false
	previousRepName = ''
	newRepAccount = ''
	newRepName = ''
	newRepTrusted = false
	newRepWarn = false
	onlineReps = []

	// Set the online status of each representative
	representatives$ = this.repService.representatives$.pipe(map(reps => {
		return reps.map(rep => {
			rep.online = this.onlineReps.indexOf(rep.id) !== -1
			return rep
		})
	}))

	async ngOnInit () {
		this.repService.loadRepresentativeList()
		this.onlineReps = await this.getOnlineRepresentatives()
		// Forcefully repush rep list once we have online status
		this.repService.representatives$.next(this.repService.representatives)
	}

	ngAfterViewInit () { }

	addEntry () {
		this.previousRepName = ''
		this.creatingNewEntry = true
		this.activePanel = 1
	}

	editEntry (representative) {
		this.newRepAccount = representative.id
		this.previousRepName = representative.name
		this.newRepName = representative.name
		this.newRepTrusted = !!representative.trusted
		this.newRepWarn = !!representative.warn
		this.creatingNewEntry = false
		this.activePanel = 1
		setTimeout(() => {
			document.getElementById('new-address-name').focus()
		}, 150)
	}

	async saveNewRepresentative () {
		if (!this.newRepAccount || !this.newRepName) {
			return this.notificationService.sendError(`Account and name are required`)
		}

		this.newRepAccount = this.newRepAccount.replace(/ /g, '') // Remove spaces

		// If the name has been changed, make sure no other entries are using that name
		if ((this.newRepName !== this.previousRepName) && this.repService.nameExists(this.newRepName)) {
			return this.notificationService.sendError(`This name is already in use! Please use a unique name`)
		}

		// Make sure the address is valid
		const valid = this.util.account.isValidAccount(this.newRepAccount)
		if (!valid) {
			return this.notificationService.sendWarning(`Account ID is not a valid account`)
		}

		try {
			await this.repService.saveRepresentative(this.newRepAccount, this.newRepName, this.newRepTrusted, this.newRepWarn)
			this.notificationService.sendSuccess(`Representative entry saved successfully!`)

			this.cancelNewRep()
		} catch (err) {
			this.notificationService.sendError(`Unable to save entry: ${err.message}`)
		}
	}

	cancelNewRep () {
		this.newRepName = ''
		this.newRepAccount = ''
		this.newRepTrusted = false
		this.newRepWarn = false
		this.activePanel = 0
	}

	copied () {
		this.notificationService.removeNotification('success-copied')
		this.notificationService.sendSuccess(`Account address copied to clipboard!`, { identifier: 'success-copied' })
	}

	async getOnlineRepresentatives () {
		const representatives = []
		try {
			const reps = await this.api.representativesOnline()
			for (const representative in reps.representatives) {
				if (!reps.representatives.hasOwnProperty(representative)) {
					continue
				}
				representatives.push(reps.representatives[representative])
			}
		} catch (err) {
			this.notificationService.sendWarning(`Unable to determine online status of representatives`)
		}

		return representatives
	}

	async deleteRepresentative (accountID) {
		try {
			this.repService.deleteRepresentative(accountID)
			this.notificationService.sendSuccess(`Successfully deleted representative`)
		} catch (err) {
			this.notificationService.sendError(`Unable to delete representative: ${err.message}`)
		}
	}

}

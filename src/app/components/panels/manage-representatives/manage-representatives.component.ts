
import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NanoAddressComponent } from 'app/components/elements'
import {
	ApiService,
	NotificationsService,
	RepresentativeService,
	UtilService
} from 'app/services'
import { ClipboardModule } from 'ngx-clipboard'
import { map } from 'rxjs/operators'

@Component({
	selector: 'app-manage-representatives',
	templateUrl: './manage-representatives.component.html',
	styleUrls: ['./manage-representatives.component.css'],
	imports: [
		ClipboardModule,
		CommonModule,
		FormsModule,
		NanoAddressComponent,
		RouterModule
	]
})
export class ManageRepresentativesComponent implements OnInit, AfterViewInit {
	private svcApi = inject(ApiService)
	private svcNotifications = inject(NotificationsService)
	private svcRepresentative = inject(RepresentativeService)
	private svcUtil = inject(UtilService)

	activePanel = 0
	creatingNewEntry = false
	previousRepName = ''
	newRepAccount = ''
	newRepName = ''
	newRepTrusted = false
	newRepWarn = false
	onlineReps = []

	// Set the online status of each representative
	representatives$ = this.svcRepresentative.representatives$.pipe(map(reps => {
		return reps.map(rep => {
			rep.online = this.onlineReps.indexOf(rep.address) !== -1
			return rep
		})
	}))

	async ngOnInit () {
		this.svcRepresentative.loadRepresentativeList()
		this.onlineReps = await this.getOnlineRepresentatives()
		// Forcefully repush rep list once we have online status
		this.svcRepresentative.representatives$.next(this.svcRepresentative.representatives)
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
			return this.svcNotifications.sendError(`Account and name are required`)
		}

		this.newRepAccount = this.newRepAccount.replace(/ /g, '') // Remove spaces

		// If the name has been changed, make sure no other entries are using that name
		if ((this.newRepName !== this.previousRepName) && this.svcRepresentative.nameExists(this.newRepName)) {
			return this.svcNotifications.sendError(`This name is already in use! Please use a unique name`)
		}

		// Make sure the address is valid
		const valid = this.svcUtil.account.isValidAccount(this.newRepAccount)
		if (!valid) {
			return this.svcNotifications.sendWarning(`Account ID is not a valid account`)
		}

		try {
			await this.svcRepresentative.saveRepresentative(this.newRepAccount, this.newRepName, this.newRepTrusted, this.newRepWarn)
			this.svcNotifications.sendSuccess(`Representative entry saved successfully!`)

			this.cancelNewRep()
		} catch (err) {
			this.svcNotifications.sendError(`Unable to save entry: ${err.message}`)
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
		this.svcNotifications.removeNotification('success-copied')
		this.svcNotifications.sendSuccess(`Account address copied to clipboard!`, { identifier: 'success-copied' })
	}

	async getOnlineRepresentatives () {
		const representatives = []
		try {
			const reps = await this.svcApi.representativesOnline()
			for (const representative in reps.representatives) {
				if (!reps.representatives.hasOwnProperty(representative)) {
					continue
				}
				representatives.push(reps.representatives[representative])
			}
		} catch (err) {
			this.svcNotifications.sendWarning(`Unable to determine online status of representatives`)
		}

		return representatives
	}

	async deleteRepresentative (accountID) {
		try {
			this.svcRepresentative.deleteRepresentative(accountID)
			this.svcNotifications.sendSuccess(`Successfully deleted representative`)
		} catch (err) {
			this.svcNotifications.sendError(`Unable to delete representative: ${err.message}`)
		}
	}

}

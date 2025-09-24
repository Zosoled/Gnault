import { Injectable, computed, inject } from '@angular/core'
import { DesktopService } from 'app/services'
import { environment } from 'environments/environment'
import { Ledger } from 'libnemo'
import { Subject } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class LedgerService {
	private desktop = inject(DesktopService)

	desktopMessage$ = new Subject()
	status = computed(() => Ledger.status)

	constructor () {
		if (environment.desktop) {
			this.configureDesktop()
		}
	}

	/**
	 * Prepare the main listener for events from the desktop client.
	 * Dispatches new messages via the main Observables
	 */
	configureDesktop () {
		this.desktop.on('ledger', (message) => {
			switch (message?.event) {
				case 'account-details':
				case 'cache-block':
				case 'sign-block':
					this.desktopMessage$.next(message)
			}
		})
	}
}

import { Injectable, Signal } from '@angular/core'
import * as Rx from 'rxjs'

type NotificationType = 'info' | 'success' | 'warning' | 'error'

@Injectable({ providedIn: 'root' })
export class NotificationsService {
	notifications$ = new Rx.BehaviorSubject(null)
	removeNotification$ = new Rx.BehaviorSubject(null)

	// This provides an entry point for all components to send notifications.
	// It exposes an observable that the actual component uses to grab new notifications
	sendNotification (type: NotificationType, message: string, options = {}) {
		options['identifier'] ??= crypto.randomUUID()
		this.notifications$.next({ type, message, options })
	}

	removeNotification (identifier: string) {
		this.removeNotification$.next(identifier)
	}

	sendInfo (message: string | Signal<string>, options = {}) {
		message = typeof message === 'string' ? message : message()
		this.sendNotification('info', message, options)
	}

	sendSuccess (message: string | Signal<string>, options = {}) {
		message = typeof message === 'string' ? message : message()
		this.sendNotification('success', message, options)
	}

	sendWarning (message: string | Signal<string>, options = {}) {
		message = typeof message === 'string' ? message : message()
		this.sendNotification('warning', message, options)
	}

	sendError (message: string | Signal<string>, options = {}) {
		message = typeof message === 'string' ? message : message()
		this.sendNotification('error', message, options)
	}

	// Custom notification functions - these are re-used in multiple paces through the app
	sendLedgerChromeWarning () {
		this.sendWarning(
			`<b>Notice:</b> You may experience issues using a Ledger device with Google Chrome.
			If you do please use Brave/Opera browser or
			<a href="https://github.com/Zosoled/Gnault/releases" target="_blank" rel="noopener noreferrer">Gnault Desktop</a>.`,
			{ length: 0, identifier: 'chrome-ledger' }
		)
	}
}

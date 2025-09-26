import { Injectable, inject } from '@angular/core'
import { AppSettingsService } from 'app/services'
import { BehaviorSubject } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class WebsocketService {
	private svcAppSettings = inject(AppSettingsService)

	isConnected = false
	keepaliveSet = false
	keepaliveTimeout = 60 * 1000
	queuedCommands = []
	reconnectTimeout = 5 * 1000
	subscribedAccounts = []
	newTransactions$ = new BehaviorSubject(null)
	websocket: WebSocket = null

	forceReconnect () {
		console.log('Reconnecting Websocket...')
		if (this.isConnected && this.websocket) {
			// Override the onclose event so it doesnt try to reconnect the old instance
			this.websocket.onclose = () => { }
			this.websocket.close()
			delete this.websocket
			this.isConnected = false
		}
		setTimeout(() => this.connect(), 250)
	}

	connect () {
		if (this.svcAppSettings.settings.serverWS && (!this.isConnected || !this.websocket)) {
			// Try to erase old connections
			delete this.websocket
			this.websocket = new WebSocket(this.svcAppSettings.settings.serverWS)

			this.websocket.onopen = (event: Event) => {
				console.log('Websocket opened', event)
				this.isConnected = true
				this.queuedCommands.forEach(queueevent => this.websocket.send(JSON.stringify(queueevent)))
				// Resubscribe to accounts?
				if (this.subscribedAccounts.length) {
					this.subscribeAccounts(this.subscribedAccounts)
				}
				if (!this.keepaliveSet) {
					// Start keepalives!
					this.keepalive()
				}
			}
			this.websocket.onerror = (event: Event) => {
				console.log('Websocket error', event)
				// this.socket.connected = false
			}
			this.websocket.onclose = (event: CloseEvent) => {
				console.log('Websocket closed', event)
				this.isConnected = false
				// Start attempting to recconect
				setTimeout(() => this.attemptReconnect(), this.reconnectTimeout)
			}
			this.websocket.onmessage = (event: MessageEvent<any>) => {
				try {
					const data = JSON.parse(event.data)
					console.log('Websocket message', data)
					const { topic, message } = data
					if (topic === 'confirmation') {
						this.newTransactions$.next(message)
					}
				} catch (err) {
					console.warn('Error parsing Websocket message', err)
				}
			}
		}
	}

	attemptReconnect () {
		this.connect()
		if (this.reconnectTimeout < 30 * 1000) {
			// Slowly increase the timeout up to 30 seconds
			this.reconnectTimeout += 5 * 1000
		}
	}

	keepalive () {
		this.keepaliveSet = true
		if (this.isConnected) {
			this.websocket.send(JSON.stringify({ action: 'ping' }))
		}
		setTimeout(() => this.keepalive(), this.keepaliveTimeout)
	}

	subscribeAccounts (accounts: string[]) {
		const event = {
			action: 'subscribe',
			topic: 'confirmation',
			options: { accounts }
		}
		for (const account of accounts) {
			if (this.subscribedAccounts.indexOf(account) === -1) {
				// Keep a unique list of subscriptions for reconnecting
				this.subscribedAccounts.push(account)
			}
		}
		if (this.isConnected) {
			this.websocket.send(JSON.stringify(event))
		} else {
			this.queuedCommands.push(event)
			if (this.queuedCommands.length >= 3) {
				// Prune queued commands
				this.queuedCommands.shift()
			}
		}
	}

	unsubscribeAccounts (accounts: string[]) {
		const event = {
			action: 'unsubscribe',
			topic: 'confirmation',
			options: { accounts }
		}
		for (const account of accounts) {
			const existingIndex = this.subscribedAccounts.indexOf(account)
			if (existingIndex !== -1) {
				// Remove from our internal subscription list
				this.subscribedAccounts.splice(existingIndex, 1)
			}
		}
		// If we aren't connected, we don't need to do anything. On reconnect, it won't subscribe.
		if (this.isConnected) {
			this.websocket.send(JSON.stringify(event))
		}
	}
}

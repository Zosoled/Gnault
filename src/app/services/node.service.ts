import { Injectable, inject } from '@angular/core'
import { NotificationService } from 'app/services'

@Injectable({ providedIn: 'root' })
export class NodeService {
	private notifications = inject(NotificationService)

	node = {
		status: null, // null - loading, false - offline, true - online
	}
	setOffline (msg = `Unable to connect to the nano node, your balances may be inaccurate!`) {
		if (this.node.status === false) return // Already offline
		this.node.status = false

		if (msg) this.notifications.sendError(msg, { identifier: 'node-offline', length: 0 })
	}

	setOnline () {
		if (this.node.status) return // Already online

		this.node.status = true
		this.notifications.removeNotification('node-offline')
	}

	setLoading () {
		this.node.status = null
	}

}

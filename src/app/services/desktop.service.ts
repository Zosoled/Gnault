import { Injectable } from '@angular/core'
import { IpcRenderer } from 'electron'

@Injectable({ providedIn: 'root' })
export class DesktopService {
	private _ipc: IpcRenderer | undefined

	constructor () {
		if (window.require) {
			try {
				this._ipc = window.require('electron').ipcRenderer
				console.log('IPC loaded')
			} catch (e) {
				throw e
			}
		}
	}

	on (channel: string, listener): void {
		this._ipc?.on(channel, listener)
	}

	send (channel: string, ...args: any[]): void {
		this._ipc?.send(channel, ...args)
	}
}

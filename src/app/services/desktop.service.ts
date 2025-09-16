import { Injectable } from '@angular/core'
import { IpcRenderer } from 'electron'

@Injectable({ providedIn: 'root' })
export class DesktopService {
	private ipc: IpcRenderer = window.require('electron').ipcRenderer

	constructor () {
		console.log(this.ipc ? 'IPC loaded' : 'IPC failed to load')
	}

	on (channel: string, listener): void {
		this.ipc.on(channel, (_, ...args) => listener(...args))
	}

	send (channel: string, ...args: any[]): void {
		this.ipc.send(channel, ...args)
	}
}

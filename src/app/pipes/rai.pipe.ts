import { Pipe, PipeTransform } from '@angular/core'
import { Tools } from 'libnemo'

@Pipe({
	name: 'rai'
})

export class RaiPipe implements PipeTransform {
	transform (v: unknown, args: unknown): any {
		if (typeof v !== 'bigint' && typeof v !== 'string') {
			throw new TypeError(`expected bigint or string; actual ${typeof v}`)
		}
		if (typeof args !== 'string') {
			throw new TypeError(`expected string; actual ${typeof v}`)
		}
		const opts = args.split(',')
		const denomination = opts[0].toLowerCase() || 'nano'
		const hideText = opts[1] || false
		const amount = Tools.convert(v, 'raw', denomination)
		const rounded = denomination === 'raw' ? amount : parseFloat(amount).toFixed(6)
		return `${rounded}${!hideText ? ` ${denomination}` : ''}`
	}
}

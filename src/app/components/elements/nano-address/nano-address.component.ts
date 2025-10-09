import { Component, InputSignal, computed, input, signal } from '@angular/core'

@Component({
	selector: 'app-nano-address',
	templateUrl: './nano-address.component.html',
	styleUrls: ['./nano-address.component.css'],
})
export class NanoAddressComponent {
	address: InputSignal<string> = input('')
	v = computed(() => this.address()?.replace('nano_', ''))

	isTruncated = signal(true)
	prefix = 'nano_'
	first = computed(() => this.v()?.slice(0, 5))
	middle = computed(() => this.isTruncated() ? '…' : this.v()?.slice(5, -5))
	last = computed(() => this.v()?.slice(-5))

	toggle () {
		this.isTruncated.set(!this.isTruncated())
	}
}

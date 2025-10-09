import { Component, InputSignal, computed, input, signal } from '@angular/core'

@Component({
	selector: 'app-nano-address',
	templateUrl: './nano-address.component.html',
	styleUrls: ['./nano-address.component.css'],
})
export class NanoAddressComponent {
	value: InputSignal<string> = input('')

	isTruncated = signal(true)
	address = computed(() => this.value()?.replace('nano_', ''))
	prefix = 'nano_'
	first = computed(() => this.address()?.slice(0, 5))
	middle = computed(() => this.isTruncated() ? '…' : this.address()?.slice(5, -5))
	last = computed(() => this.address()?.slice(-5))

	toggle () {
		this.isTruncated.set(!this.isTruncated())
	}
}

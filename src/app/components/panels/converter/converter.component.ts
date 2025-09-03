import { CommonModule } from '@angular/common'
import { Component, OnInit, OnDestroy, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Tools } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'
import {
	AppSettingsService,
	NotificationsService,
	PriceService,
	UtilService
} from 'app/services'

@Component({
	selector: 'app-converter',
	templateUrl: './converter.component.html',
	styleUrls: ['./converter.component.less'],
	imports: [
		ClipboardModule,
		CommonModule,
		FormsModule
	]
})

export class ConverterComponent implements OnInit, OnDestroy {
	private util = inject(UtilService)
	settings = inject(AppSettingsService)
	private price = inject(PriceService)
	notifications = inject(NotificationsService)

	Mnano = ''
	raw = ''
	invalidMnano = false
	invalidRaw = false
	invalidFiat = false
	fiatPrice = '0'
	priceSub = null

	ngOnInit (): void {
		this.priceSub = this.price.lastPrice$.subscribe(event => {
			this.fiatPrice = this.price.price.lastPrice.toFixed(30)
		})
		this.unitChange('mnano')
	}

	ngOnDestroy () {
		if (this.priceSub) {
			this.priceSub.unsubscribe()
		}
	}

	async unitChange (unit) {
		switch (unit) {
			case 'mnano':
				if (this.util.account.isValidNanoAmount(this.Mnano)) {
					this.raw = await Tools.convert(this.Mnano, 'nano', 'raw')
					this.fiatPrice = (parseFloat(this.Mnano) * this.price.price.lastPrice).toString()
					this.invalidMnano = false
					this.invalidRaw = false
					this.invalidFiat = false
				} else {
					this.raw = ''
					this.fiatPrice = ''
					this.invalidMnano = true
				}
				break
			case 'raw':
				if (this.util.account.isValidAmount(this.raw)) {
					this.Mnano = await Tools.convert(this.raw, 'raw', 'nano')
					this.fiatPrice = (parseFloat(this.Mnano) * this.price.price.lastPrice).toString()
					this.invalidRaw = false
					this.invalidMnano = false
					this.invalidFiat = false
				} else {
					this.Mnano = ''
					this.fiatPrice = ''
					this.invalidRaw = true
				}
				break
			case 'fiat':
				if (this.util.string.isNumeric(this.fiatPrice)) {
					this.Mnano = (parseFloat(this.fiatPrice) / this.price.price.lastPrice).toString()
					this.raw = await Tools.convert(this.Mnano, 'nano', 'raw')
					this.invalidRaw = false
					this.invalidMnano = false
					this.invalidFiat = false
				} else {
					this.Mnano = ''
					this.raw = ''
					this.invalidFiat = true
				}
				break
		}
	}

}

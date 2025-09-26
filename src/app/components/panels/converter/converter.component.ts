import { CommonModule } from '@angular/common'
import { Component, OnDestroy, OnInit, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
	AppSettingsService,
	NotificationsService,
	PriceService,
	UtilService
} from 'app/services'
import { Tools } from 'libnemo'
import { ClipboardModule } from 'ngx-clipboard'

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
	private svcPrice = inject(PriceService)
	private svcUtil = inject(UtilService)

	svcNotifications = inject(NotificationsService)
	svcAppSettings = inject(AppSettingsService)

	Mnano = ''
	raw = ''
	invalidMnano = false
	invalidRaw = false
	invalidFiat = false
	fiatPrice = '0'
	priceSub = null

	ngOnInit (): void {
		this.unitChange('nano')
	}

	ngOnDestroy () {
		if (this.priceSub) {
			this.priceSub.unsubscribe()
		}
	}

	async unitChange (unit) {
		switch (unit) {
			case 'nano':
				if (this.svcUtil.account.isValidNanoAmount(this.Mnano)) {
					this.raw = await Tools.convert(this.Mnano, 'nano', 'raw')
					this.fiatPrice = (parseFloat(this.Mnano) * this.svcPrice.lastPrice()).toString()
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
				if (this.svcUtil.account.isValidAmount(this.raw)) {
					this.Mnano = await Tools.convert(this.raw, 'raw', 'nano')
					this.fiatPrice = (parseFloat(this.Mnano) * this.svcPrice.lastPrice()).toString()
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
				if (this.svcUtil.string.isNumeric(this.fiatPrice)) {
					this.Mnano = (parseFloat(this.fiatPrice) / this.svcPrice.lastPrice()).toString()
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

import { CommonModule } from '@angular/common'
import { Component, Input, OnChanges, OnInit } from '@angular/core'
import { TranslocoDirective } from '@jsverse/transloco'
import { NanoAddressComponent, NanoIdenticonComponent } from 'app/components'
import { AmountSplitPipe, RaiPipe } from 'app/pipes'

@Component({
	selector: 'app-nano-transaction-mobile',
	templateUrl: './nano-transaction-mobile.component.html',
	styleUrls: ['./nano-transaction-mobile.component.less'],
	imports: [
		AmountSplitPipe,
		CommonModule,
		NanoAddressComponent,
		NanoIdenticonComponent,
		RaiPipe,
		TranslocoDirective
	]
})
export class NanoTransactionMobileComponent implements OnInit, OnChanges {
	@Input() isInteractable = true
	@Input() isHidden: boolean
	@Input() settingIdenticonsStyle: string
	@Input() transaction: any

	isNaN = isNaN
	isReceivableTransaction = false
	isReceiveTransaction = false
	isRepresentativeChange = false
	isSendTransaction = false

	ngOnInit (): void {
		this.updateType()
	}

	ngOnChanges () {
		this.updateType()
	}

	updateType () {
		if (this.transaction.isReceivable === true) {
			this.isReceivableTransaction = true
			this.isReceiveTransaction = this.isRepresentativeChange = this.isSendTransaction = false
			return
		}

		const { subtype, type } = this.transaction
		if (isNaN(this.transaction.amount)) {
			this.isRepresentativeChange = true
			this.isReceivableTransaction = this.isReceiveTransaction = this.isSendTransaction = false
		} else if (type === 'send' || subtype === 'send') {
			this.isSendTransaction = true
			this.isReceivableTransaction = this.isReceiveTransaction = this.isRepresentativeChange = false
		} else if (type === 'receive' || subtype === 'receive' || type === 'open') {
			this.isReceiveTransaction = true
			this.isReceivableTransaction = this.isRepresentativeChange = this.isSendTransaction = false
		}
	}
}

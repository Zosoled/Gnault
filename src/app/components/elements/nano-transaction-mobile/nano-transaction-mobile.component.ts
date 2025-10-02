import { CommonModule } from '@angular/common'
import { Component, Input, OnChanges, OnInit } from '@angular/core'
import { TranslocoDirective } from '@jsverse/transloco'
import { AmountSplitPipe, RaiPipe } from 'app/pipes'
import { NanoAccountIdComponent } from '../nano-account-id/nano-account-id.component'
import { NanoIdenticonComponent } from '../nano-identicon/nano-identicon.component'

@Component({
	selector: 'app-nano-transaction-mobile',
	templateUrl: './nano-transaction-mobile.component.html',
	styleUrls: ['./nano-transaction-mobile.component.less'],
	imports: [
		AmountSplitPipe,
		CommonModule,
		NanoAccountIdComponent,
		NanoIdenticonComponent,
		RaiPipe,
		TranslocoDirective
	]
})

export class NanoTransactionMobileComponent implements OnInit, OnChanges {
	@Input() transaction: any
	@Input() isInteractable = true
	@Input() isHidden: boolean
	@Input() settingIdenticonsStyle: string

	isNaN = isNaN
	isReceivableTransaction = false
	isRepresentativeChange = false
	isSendTransaction = false
	isReceiveTransaction = false

	ngOnInit (): void {
		this.updateType()
	}

	ngOnChanges () {
		this.updateType()
	}

	updateType () {
		if (this.transaction.isReceivable === true) {
			this.isReceivableTransaction = true
			this.isRepresentativeChange = false
			this.isSendTransaction = false
			this.isReceiveTransaction = false
			return
		}

		if (isNaN(this.transaction.amount)) {
			this.isReceivableTransaction = false
			this.isRepresentativeChange = true
			this.isSendTransaction = false
			this.isReceiveTransaction = false
		} else if (this.transaction.type === 'send' || this.transaction.subtype === 'send') {
			this.isReceivableTransaction = false
			this.isRepresentativeChange = false
			this.isSendTransaction = true
			this.isReceiveTransaction = false
		} else if (this.transaction.type === 'receive'
			|| this.transaction.subtype === 'receive'
			|| this.transaction.type === 'open'
		) {
			this.isReceivableTransaction = false
			this.isRepresentativeChange = false
			this.isSendTransaction = false
			this.isReceiveTransaction = true
		}
	}

}

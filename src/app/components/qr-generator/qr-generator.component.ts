import { CommonModule } from '@angular/common'
import { Component, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import * as QRCode from 'qrcode'

@Component({
	selector: 'app-qr-generator',
	templateUrl: './qr-generator.component.html',
	styleUrls: ['./qr-generator.component.less'],
	imports: [
		CommonModule,
		FormsModule
	]
})

export class QrGeneratorComponent implements OnInit {
	qrCodeImageBlock = null
	input = ''
	width = 300

	ngOnInit (): void {
		throw new Error('Method not implemented.')
	}

	async generateQR () {
		if (this.input === '') {
			this.qrCodeImageBlock = null
			return
		}
		// Gradually make QR larger when complexity increases
		this.width = Math.min(Math.max(300, Math.round(Math.log2(this.input.length) * 120 - 300)), 800)
		const qrCode = await QRCode.toDataURL(this.input, { errorCorrectionLevel: 'M', scale: 16 })
		this.qrCodeImageBlock = qrCode
	}
}

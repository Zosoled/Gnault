import { Component, Input, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { BarcodeFormat } from '@zxing/library'
import { ZXingScannerModule } from '@zxing/ngx-scanner'
import { NotificationsService, UtilService } from 'app/services'
import { Wallet } from 'libnemo'
import { BehaviorSubject } from 'rxjs'

export type QRType = 'account' | 'hash' | 'mnemonic' | 'generic'

@Component({
	selector: 'app-qr-modal',
	templateUrl: './qr-modal.component.html',
	styleUrls: ['./qr-modal.component.css'],
	imports: [ZXingScannerModule],
})
export class QrModalComponent {
	@Input() title = 'QR Scanner'
	@Input() reference: string
	@Input() type: QRType

	activeModal = inject(NgbActiveModal)
	private svcNotifcations = inject(NotificationsService)
	private svcUtil = inject(UtilService)

	availableDevices: MediaDeviceInfo[]
	currentDevice: MediaDeviceInfo = null
	nano_scheme = /^(xrb|nano|nanorep|nanoseed|nanokey):.+$/g
	formatsEnabled: BarcodeFormat[] = [
		BarcodeFormat.CODE_128,
		BarcodeFormat.DATA_MATRIX,
		BarcodeFormat.EAN_13,
		BarcodeFormat.QR_CODE,
	]
	hasDevices: boolean
	hasPermission: boolean

	torchEnabled = false
	torchAvailable$ = new BehaviorSubject<boolean>(false)
	tryHarder = false

	onCamerasFound (devices: MediaDeviceInfo[]): void {
		this.availableDevices = devices
		this.hasDevices = Boolean(devices && devices.length)
	}

	async onCodeResult (resultString: string) {
		let type: QRType = null
		let content = ''
		// account
		if (this.svcUtil.account.isValidAccount(resultString)) {
			type = 'account'
			content = resultString
		} else if (/ /.test(resultString)) {
			try {
				await Wallet.load('BLAKE2b', '', resultString)
				type = 'mnemonic'
				content = resultString
			} catch (err) { }
		} else if (resultString.length === 128) {
			// includes deterministic R value material which we ignore
			resultString = resultString.substring(0, 64)
			if (this.svcUtil.nano.isValidHash(resultString)) {
				type = 'hash'
				content = resultString
			}
		} else if (this.svcUtil.nano.isValidHash(resultString)) {
			type = 'hash'
			content = resultString
		} else if (this.nano_scheme.test(resultString)) {
			// This is a valid Nano scheme URI
			const url = new URL(resultString)
			content = url.pathname

			if (['nano:', 'nanorep:', 'xrb:'].includes(url.protocol) && this.svcUtil.account.isValidAccount(url.pathname)) {
				type = 'account'
			} else if (['nanoseed:', 'nanokey:'].includes(url.protocol) && this.svcUtil.nano.isValidHash(url.pathname)) {
				type = 'hash'
			}
		} else {
			type = 'generic'
			content = resultString
		}

		// check that the result is valid and matched the requested type
		if ((type != null && type === this.type) || this.type === 'generic') {
			this.activeModal.close({ reference: this.reference, content: content })
		} else {
			this.svcNotifcations.sendWarning('This QR code is not recognized.', {
				length: 5000,
				identifier: 'qr-not-recognized',
			})
			return
		}
	}

	onDeviceSelectChange (target: EventTarget) {
		const { value } = target as HTMLSelectElement
		const device = this.availableDevices.find((x) => x.deviceId === value)
		this.currentDevice = device || null
	}

	onHasPermission (has: boolean) {
		this.hasPermission = has
	}

	onTorchCompatible (isCompatible: boolean): void {
		this.torchAvailable$.next(isCompatible || false)
	}

	toggleTorch (): void {
		this.torchEnabled = !this.torchEnabled
	}

	toggleTryHarder (): void {
		this.tryHarder = !this.tryHarder
	}
}

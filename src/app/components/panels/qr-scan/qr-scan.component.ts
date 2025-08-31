import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { BarcodeFormat } from '@zxing/library'
import { ZXingScannerModule } from '@zxing/ngx-scanner'
import { BehaviorSubject } from 'rxjs'
import { DeeplinkService, NotificationService } from 'app/services'

@Component({
	selector: 'app-qr-scan',
	templateUrl: './qr-scan.component.html',
	styleUrls: ['./qr-scan.component.css'],
	imports: [
		CommonModule,
		ZXingScannerModule
	]
})

export class QrScanComponent implements OnInit {
	[key: string]: any

	private svcDeeplink = inject(DeeplinkService)
	private svcNotification = inject(NotificationService);

	availableDevices: MediaDeviceInfo[]
	currentDevice: MediaDeviceInfo = null

	formatsEnabled: BarcodeFormat[] = [
		BarcodeFormat.CODE_128,
		BarcodeFormat.DATA_MATRIX,
		BarcodeFormat.EAN_13,
		BarcodeFormat.QR_CODE,
	]

	hasDevices: boolean
	hasPermission: boolean

	qrResultString: string

	torchEnabled = false
	torchAvailable$ = new BehaviorSubject<boolean>(false)
	tryHarder = false

	ngOnInit (): void { }

	clearResult (): void {
		this.qrResultString = null
	}

	onCamerasFound (devices: MediaDeviceInfo[]): void {
		this.availableDevices = devices
		this.hasDevices = Boolean(devices && devices.length)
	}

	onCodeResult (resultString: string) {
		this.qrResultString = resultString
		if (!this.svcDeeplink.navigate(resultString)) {
			this.svcNotification.sendWarning('This QR code is not recognized.', { length: 5000, identifier: 'qr-not-recognized' })
		}
	}

	onDeviceSelectChange (target: EventTarget) {
		const { value } = target as HTMLSelectElement
		const device = this.availableDevices.find(x => x.deviceId === value)
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
